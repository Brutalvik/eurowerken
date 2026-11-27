import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Car, Download, EyeOff, History, Mail, MessageSquare, Phone, Printer, Video } from 'lucide-react';
import { errorMessage, formatDateTime, getTimeZone, telHref } from '@/api/appointments';
import { ITEM_KIND_LABEL, REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, lineTotal, mediaUrl, plateOf } from '@/api/repairOrders';
import type { Approval } from '@/api/repairOrders';
import { formatTaxLabel } from '@eurowerken/shared';
import type { TaxComponent } from '@eurowerken/shared';
import {
  HISTORY_ITEM_LABEL,
  MIN_QUERY,
  getServiceHistory,
  historyRepairTotals,
  historySummary,
  historyVehicleLabel,
  searchServiceHistory,
  vinOf,
} from '@/api/serviceHistory';
import type { HistoryRepair, HistoryVehicle, ServiceHistory } from '@/api/serviceHistory';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import type { Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote } from './inventory/PartForm';
import { SectionTitle, textLink } from './repair-orders/common';
import type { BuiltPdf } from './service-history/historyPdf';
import { ImportedRecords } from './service-history/ImportedRecords';

const DEBOUNCE_MS = 300;
const PAGE_WARNING = 50;
const ITEM_TONE: Record<Approval, Tone> = { approved: 'ok', declined: 'bad', pending: 'warn' };

/**
 * Service history: find a vehicle by VIN, plate, phone, name or email, then see every repair it has had here,
 * and download or print it as a PDF. The search and the open vehicle survive reload, and Back works.
 */
/**
 * The search and the open vehicle live in the browser's history state, not the address: a search can be a
 * phone number or email, and personal details never go into URLs. Reload and Back still restore them.
 */
interface HistoryState {
  q?: string;
  v?: string;
}

function useHistoryState(): [HistoryState, (next: HistoryState, opts?: { replace?: boolean }) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as HistoryState;
  const set = useCallback(
    (next: HistoryState, opts?: { replace?: boolean }) => navigate(location.pathname, { state: next, replace: opts?.replace }),
    [navigate, location.pathname],
  );
  return [state, set];
}

export function ServiceHistoryPage() {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [hs, setHs] = useHistoryState();
  const q = hs.q ?? '';
  const v = hs.v ?? null;
  const [tz, setTz] = useState('America/Edmonton');

  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getTimeZone(workshopId).then((t) => active && setTz(t)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [workshopId]);

  const openVehicle = (key: string) => setHs({ q, v: key });
  const backToResults = () => setHs({ q });

  return v ? <VehicleView vehicleKey={v} tz={tz} onBack={backToResults} /> : <SearchView q={q} tz={tz} onOpen={openVehicle} />;
}

// Search -----------------------------------------------------------------------------------------------

function SearchView({ q, tz, onOpen }: { q: string; tz: string; onOpen: (key: string) => void }) {
  const [, setHs] = useHistoryState();
  const [text, setText] = useState(q);
  /** The last query this page saved; anything else came from Back. */
  const written = useRef(q);
  const timer = useRef(0);
  const [results, setResults] = useState<HistoryVehicle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    if (q !== written.current) {
      written.current = q;
      setText(q);
    }
  }, [q]);

  const writeQuery = useCallback(
    (value: string) => {
      window.clearTimeout(timer.current);
      if (value === written.current) return;
      written.current = value;
      setHs(value ? { q: value } : {}, { replace: true });
    },
    [setHs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function onChange(value: string) {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => writeQuery(value), DEBOUNCE_MS);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    writeQuery(text);
  }

  const search = useCallback(async () => {
    const mine = ++request.current;
    if (q.trim().length < MIN_QUERY) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await searchServiceHistory(q);
      if (mine === request.current) setResults(list);
    } catch (err) {
      if (mine === request.current) setError(errorMessage(err, 'The search could not be run.'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void search();
  }, [search]);

  const short = q.trim().length < MIN_QUERY;

  return (
    <div className="min-w-0 space-y-4">
      <form role="search" onSubmit={onSubmit} className="max-w-xl">
        <SearchInput value={text} onChange={onChange} placeholder="Search by VIN, plate, phone, name or email" className="w-full" />
      </form>

      <p aria-live="polite" className="sr-only">
        {loading || short || error || !results ? '' : `${results.length} vehicle${results.length === 1 ? '' : 's'} found.`}
      </p>

      {error ? (
        <Card className="space-y-3 p-4">
          <ErrorNote errors={error} />
          <Button variant="ghost" onClick={() => void search()}>
            Try again
          </Button>
        </Card>
      ) : short ? (
        <EmptyCard text="Type at least 2 characters to find a vehicle." hint="A VIN, plate, phone number, customer name or email all work." />
      ) : loading && !results ? (
        <ResultsSkeleton />
      ) : results && results.length === 0 ? (
        <EmptyCard text={`No vehicles match "${q.trim()}".`} hint="Check the spelling, or try part of the VIN, the plate or the phone number." />
      ) : results ? (
        <ul aria-label="Vehicles" aria-busy={loading} className={`grid gap-3 ${loading ? 'opacity-60' : ''}`}>
          {results.map((r) => (
            <li key={r.vehicle_key}>
              <ResultCard vehicle={r} tz={tz} onOpen={() => onOpen(r.vehicle_key)} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyCard({ text, hint }: { text: string; hint: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <History className="h-8 w-8 text-fg3" aria-hidden />
      <p className="max-w-sm text-sm text-fg2">{text}</p>
      <p className="max-w-sm text-[11px] text-fg3">{hint}</p>
    </Card>
  );
}

function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Searching" className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="animate-pulse space-y-2 p-4">
          <div className="h-3.5 w-48 rounded bg-surface2" />
          <div className="h-3 w-72 max-w-full rounded bg-surface2" />
          <div className="h-3 w-56 max-w-full rounded bg-surface2" />
        </Card>
      ))}
    </div>
  );
}

function ResultCard({ vehicle: r, tz, onOpen }: { vehicle: HistoryVehicle; tz: string; onOpen: () => void }) {
  const vin = vinOf(r.vehicle);
  const plate = plateOf(r.vehicle);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass block w-full rounded-xl p-4 text-left transition hover:border-accent/50 hover:bg-surface2/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Car className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="break-words font-display text-sm font-semibold text-fg">{historyVehicleLabel(r.vehicle)}</span>
        </span>
        {r.open_repairs > 0 && <Badge tone="warn">{r.open_repairs} open</Badge>}
      </span>
      <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase text-fg2">
        <span>VIN {vin || <span className="normal-case text-fg3">not given</span>}</span>
        <span>Plate {plate || <span className="normal-case text-fg3">not given</span>}</span>
      </span>
      <span className="mt-2 grid gap-x-4 gap-y-1 text-xs text-fg2 sm:grid-cols-2">
        <span className="min-w-0 break-words">
          <span className="font-medium text-fg">{r.owner_name || 'No name'}</span>
          {r.owner_phone && <span> · {r.owner_phone}</span>}
          {r.owner_email && <span className="block break-all text-fg3">{r.owner_email}</span>}
        </span>
        <span className="text-fg3 sm:text-right">
          <span className="font-medium text-fg2">
            {r.visits} visit{r.visits === 1 ? '' : 's'}
          </span>
          <span className="block">
            First {formatDateTime(r.first_visit, tz)}
            {r.visits > 1 && <> · Last {formatDateTime(r.last_visit, tz)}</>}
          </span>
        </span>
      </span>
    </button>
  );
}

// One vehicle ------------------------------------------------------------------------------------------

type PdfAction = 'download' | 'print';

/** The shop's logo for documents (Settings, Documents), else its website logo, or none when turned off. */
async function documentLogo(workshopId: string | null): Promise<string | null> {
  if (!workshopId) return null;
  const { data } = await supabase.from('workshop_sites').select('*').eq('workshop_id', workshopId).maybeSingle();
  const site = (data ?? null) as Record<string, unknown> | null;
  if (!site || site.document_show_logo === false) return null;
  const pick = (k: string) => (typeof site[k] === 'string' && site[k] ? (site[k] as string) : null);
  return pick('document_logo_url') ?? pick('logo_url');
}

function VehicleView({ vehicleKey, tz, onBack }: { vehicleKey: string; tz: string; onBack: () => void }) {
  const headingId = useId();
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [history, setHistory] = useState<ServiceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const [busy, setBusy] = useState<PdfAction | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDone, setPdfDone] = useState('');
  /** A built PDF over 50 pages, waiting for Continue or Cancel. */
  const [pending, setPending] = useState<{ built: BuiltPdf; action: PdfAction } | null>(null);

  const load = useCallback(async () => {
    const mine = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const h = await getServiceHistory(vehicleKey, user?.workshop?.id ?? null);
      if (mine === request.current) setHistory(h);
    } catch (err) {
      if (mine === request.current) setError(errorMessage(err, 'The service history could not be loaded.'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [vehicleKey]);

  useEffect(() => {
    setHistory(null);
    void load();
  }, [load]);

  async function finish(built: BuiltPdf, action: PdfAction) {
    if (!history) return;
    const pdf = await import('./service-history/historyPdf');
    if (action === 'download') {
      pdf.downloadPdf(built.doc, pdf.historyFileName(historySummary(history), tz));
      setPdfDone(`PDF downloaded, ${built.pages} page${built.pages === 1 ? '' : 's'}.`);
    } else {
      await pdf.printPdf(built.doc);
      setPdfDone('The PDF is ready to print.');
    }
  }

  async function makePdf(action: PdfAction) {
    if (!history || busy) return;
    setBusy(action);
    setPdfError(null);
    setPdfDone('');
    try {
      const pdf = await import('./service-history/historyPdf');
      const built = await pdf.buildHistoryPdf(history, historySummary(history), tz, { logoUrl: await documentLogo(workshopId) });
      if (built.pages > PAGE_WARNING) {
        setPending({ built, action });
        return;
      }
      await finish(built, action);
    } catch (err) {
      setPdfError(errorMessage(err, 'The PDF could not be made.'));
    } finally {
      setBusy(null);
      }
  }

  async function continueLong() {
    if (!pending) return;
    const { built, action } = pending;
    setPending(null);
    setBusy(action);
    try {
      await finish(built, action);
    } catch (err) {
      setPdfError(errorMessage(err, 'The PDF could not be made.'));
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <button type="button" onClick={onBack} className={`${textLink} text-xs`}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back to results
    </button>
  );

  if (loading && !history) {
    return (
      <div className="min-w-0 space-y-4">
        {back}
        <div role="status" aria-label="Loading service history" className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse space-y-3 p-5">
              <div className="h-4 w-56 max-w-full rounded bg-surface2" />
              <div className="h-3 w-80 max-w-full rounded bg-surface2" />
              <div className="h-20 rounded bg-surface2" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && !history) {
    return (
      <div className="min-w-0 space-y-4">
        {back}
        <Card className="space-y-3 p-4">
          <ErrorNote errors={error} />
          <Button variant="ghost" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (!history || (history.repairs.length === 0 && history.imported.length === 0)) {
    return (
      <div className="min-w-0 space-y-4">
        {back}
        <EmptyCard text="No repairs were found for this vehicle." hint="It may have been removed, or your role cannot see it. Search again." />
      </div>
    );
  }

  const s = historySummary(history);
  const progressText = busy ? 'Preparing PDF…' : '';

  return (
    <div className="min-w-0 space-y-4">
      {back}

      <Card className="p-4 md:p-5">
        <section aria-labelledby={headingId} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 id={headingId} className="flex items-center gap-2 break-words font-display text-lg font-semibold text-fg">
                <Car className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                {s.label}
              </h1>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase text-fg2">
                <span>VIN {s.vin || <span className="normal-case text-fg3">not given</span>}</span>
                <span>Plate {s.plate || <span className="normal-case text-fg3">not given</span>}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void makePdf('download')} disabled={busy !== null}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                {busy === 'download' ? 'Preparing…' : 'Download PDF'}
              </Button>
              <Button variant="ghost" onClick={() => void makePdf('print')} disabled={busy !== null}>
                <Printer className="h-3.5 w-3.5" aria-hidden />
                {busy === 'print' ? 'Preparing…' : 'Print'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg2">
            <span className="font-medium text-fg">{s.owner || 'No name'}</span>
            {s.phone && (
              <a href={telHref(s.phone)} className={textLink}>
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {s.phone}
              </a>
            )}
            {s.email && (
              <a href={`mailto:${s.email}`} className={textLink}>
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {s.email}
              </a>
            )}
            <span className="text-fg3">
              {s.visits} visit{s.visits === 1 ? '' : 's'}
            </span>
          </div>

          <div role="status" aria-live="polite" className="text-[11px] text-fg2">
            {progressText || pdfDone}
          </div>
          <ErrorNote errors={pdfError} />
        </section>
      </Card>

      <h2 className="sr-only">Repairs, newest first</h2>
      {history.repairs.map((r) => (
        <RepairHistoryCard key={r.id} repair={r} tz={tz} shopTaxes={history.tax_components} />
      ))}
      <ImportedRecords records={history.imported} tz={tz} />

      <Dialog
        open={pending !== null}
        title="A long PDF"
        onClose={() => setPending(null)}
        role="alertdialog"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} data-autofocus>
              Cancel
            </Button>
            <Button onClick={() => void continueLong()}>Continue</Button>
          </>
        }
      >
        <p className="text-xs text-fg2">
          This service history is {pending?.built.pages ?? 0} pages long. It is more than {PAGE_WARNING} pages. Continue?
        </p>
      </Dialog>
    </div>
  );
}

// One repair ---------------------------------------------------------------------------------------------

function TeamOnly() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-fg3/15 px-2 py-0.5 text-[10px] font-semibold text-fg2">
      <EyeOff className="h-3 w-3" aria-hidden />
      Team only
    </span>
  );
}

function RepairHistoryCard({ repair: r, tz, shopTaxes }: { repair: HistoryRepair; tz: string; shopTaxes: TaxComponent[] }) {
  const id = useId();
  const totals = historyRepairTotals(r, { tax_components: shopTaxes });
  const photos = r.media.filter((m) => m.kind === 'photo');
  const videos = r.media.filter((m) => m.kind === 'video');

  return (
    <Card className="p-4 md:p-5">
      <article aria-labelledby={`${id}-title`} className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`${id}-title`} className="font-display text-sm font-semibold">
              <Link to={`/repair-orders/${r.id}`} className="text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                {r.number || 'Repair order'}
              </Link>
            </h3>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg2">
              <span>
                Checked in <time dateTime={r.created_at}>{formatDateTime(r.created_at, tz)}</time>
              </span>
              {r.completed_at && (
                <span>
                  Completed <time dateTime={r.completed_at}>{formatDateTime(r.completed_at, tz)}</time>
                </span>
              )}
              <span>Technician {r.technician ?? <span className="text-fg3">not assigned</span>}</span>
            </p>
          </div>
          <Badge tone={REPAIR_STATUS_TONE[r.status] ?? 'neutral'}>{REPAIR_STATUS_LABEL[r.status] ?? r.status}</Badge>
        </div>

        {r.customer_notes && (
          <div className="text-xs">
            <p className="text-[10px] uppercase tracking-wider text-fg3">Customer notes</p>
            <p className="mt-0.5 whitespace-pre-line break-words text-fg">{r.customer_notes}</p>
          </div>
        )}

        {r.staff_notes && (
          <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg2">
              Team notes <TeamOnly />
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-fg">{r.staff_notes}</p>
          </div>
        )}

        <section aria-labelledby={`${id}-items`} className="space-y-2">
          <SectionTitle id={`${id}-items`} title="Work" />
          {r.items.length === 0 ? (
            <p className="text-xs text-fg2">No line items.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[30rem] text-xs">
                  <thead className="bg-surface2/60 text-left text-[10px] uppercase tracking-wider text-fg3">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Item</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Unit price</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.items.map((item) => {
                      const declined = item.approval === 'declined';
                      return (
                        <tr key={item.id} className={declined ? 'text-fg3' : 'text-fg'}>
                          <td className="px-3 py-2">
                            <span className={`block break-words font-medium ${declined ? 'line-through' : ''}`}>{item.description}</span>
                            <span className="text-[10px] uppercase tracking-wider text-fg3">{ITEM_KIND_LABEL[item.kind] ?? item.kind}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={ITEM_TONE[item.approval]}>{HISTORY_ITEM_LABEL[item.approval]}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${declined ? 'line-through' : ''}`}>{formatCurrency(lineTotal(item))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
                <dt className="text-fg2">Approved work</dt>
                <dd className="text-right tabular-nums text-fg">{formatCurrency(totals.subtotal)}</dd>
                {totals.taxes.map((t) => (
                  <Fragment key={t.code}>
                    <dt className="text-fg2">{formatTaxLabel(t, 'paren')}</dt>
                    <dd className="text-right tabular-nums text-fg">{formatCurrency(t.amount)}</dd>
                  </Fragment>
                ))}
                <dt className="font-semibold text-fg">Total</dt>
                <dd className="text-right font-semibold tabular-nums text-fg">{formatCurrency(totals.total)}</dd>
                {totals.pending > 0 && (
                  <>
                    <dt className="text-warn">Waiting (not included)</dt>
                    <dd className="text-right tabular-nums text-warn">{formatCurrency(totals.pending)}</dd>
                  </>
                )}
              </dl>
            </>
          )}
          {r.approvals.length > 0 && (
            <ul aria-label="Approval records" className="space-y-1 border-t border-line pt-2 text-[11px] text-fg2">
              {r.approvals.map((a, i) => (
                <li key={i} className="break-words">
                  <span className={a.decision === 'approved' ? 'font-semibold text-ok' : 'font-semibold text-bad'}>
                    {a.decision === 'approved' ? 'Approved' : 'Declined'}
                  </span>{' '}
                  {a.method === 'phone' ? 'by phone' : 'online'}: {a.item_description} · <time dateTime={a.decided_at}>{formatDateTime(a.decided_at, tz)}</time>
                  {a.method === 'online' && a.customer_email && <> · {a.customer_email}</>}
                  {a.note && (
                    <span className="ml-1 inline-flex flex-wrap items-center gap-1">
                      <span className="text-fg3">Note: {a.note}</span> <TeamOnly />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(photos.length > 0 || videos.length > 0) && (
          <section aria-labelledby={`${id}-media`} className="space-y-2">
            <SectionTitle id={`${id}-media`} title="Photos and video" />
            {photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((m) => {
                  const label = m.caption || 'Repair photo';
                  return (
                    <li key={m.id} className="min-w-0 overflow-hidden rounded-xl glass-field">
                      <a
                        href={mediaUrl(m.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-[4/3] bg-sidebar/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <img src={mediaUrl(m.path)} alt={`${label} (opens full size in a new tab)`} loading="lazy" className="h-full w-full object-cover" />
                      </a>
                      <div className="flex flex-wrap items-center gap-1 p-1.5 text-[11px]">
                        {m.caption && <span className="min-w-0 break-words text-fg">{m.caption}</span>}
                        {!m.visible_to_customer && <TeamOnly />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {videos.length > 0 && (
              <ul className="space-y-1">
                {videos.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <a href={mediaUrl(m.path)} target="_blank" rel="noopener noreferrer" className={textLink}>
                      <Video className="h-3.5 w-3.5" aria-hidden />
                      {m.caption || `Video, ${formatDateTime(m.created_at, tz)}`}
                    </a>
                    {!m.visible_to_customer && <TeamOnly />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {r.events.length > 0 && (
          <section aria-labelledby={`${id}-events`} className="space-y-2">
            <SectionTitle id={`${id}-events`} title="Timeline" subtitle="Oldest first" />
            <ol className="space-y-2">
              {r.events.map((ev) => (
                <li key={ev.id} className="border-l-2 border-line pl-3 text-xs">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {ev.title}
                    {!ev.visible_to_customer && <TeamOnly />}
                  </p>
                  {ev.body && <p className="mt-0.5 whitespace-pre-line break-words text-fg2">{ev.body}</p>}
                  <p className="mt-0.5 text-[10px] text-fg3">
                    <time dateTime={ev.created_at}>{formatDateTime(ev.created_at, tz)}</time>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-labelledby={`${id}-messages`} className="space-y-2">
          <SectionTitle id={`${id}-messages`} title="Messages" subtitle={`With ${r.contact_name || 'the customer'}`} />
          {r.messages.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-fg2">
              <MessageSquare className="h-4 w-4 shrink-0 text-fg3" aria-hidden />
              No messages.
            </p>
          ) : (
            <ol aria-label={`Messages on ${r.number}`} className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {r.messages.map((m) => {
                const staff = m.sender === 'staff';
                return (
                  <li key={m.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${staff ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md glass-field text-fg'}`}>
                      <p className="whitespace-pre-line break-words">{m.body}</p>
                      <p className={`mt-1 text-[10px] ${staff ? 'text-white/80' : 'text-fg3'}`}>
                        {m.author_name || (staff ? 'Workshop' : r.contact_name)} · <time dateTime={m.created_at}>{formatDateTime(m.created_at, tz)}</time>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </article>
    </Card>
  );
}
