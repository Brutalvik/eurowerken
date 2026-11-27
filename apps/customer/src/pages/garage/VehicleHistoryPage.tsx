import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Car, ChevronDown, FileText, Lock, MessageSquare, Receipt, RotateCcw, User, Wrench } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { DEFAULT_TIME_ZONE, useBookingSettings } from '@/api/booking';
import { invoicesForRepairs } from '@/api/invoices';
import type { InvoiceSummary } from '@/api/invoices';
import { customerPhotoUrl } from '@/api/photos';
import { conversationClosed, myServiceHistory } from '@/api/repairs';
import type { HistoryRepair } from '@/api/repairs';
import { listVehicles } from '@/api/vehicles';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { InvoiceButtons } from '@/components/InvoiceButtons';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { ItemsSummary, MediaGrid, StatusPill, Totals, WorkshopUpdates, formatDay, formatWhen } from '@/pages/track/repairUi';

function carName(v: Pick<CustomerVehicleRow, 'year' | 'make' | 'model'>): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'ready'; vehicle: CustomerVehicleRow; repairs: HistoryRepair[]; invoices: Record<string, InvoiceSummary> };

/**
 * My Garage, one car: every repair it had at this workshop, newest first, read only. What was done and what was
 * not, the workshop's notes, photos and the conversation. There is no download of the history, and printing the page
 * shows a note instead (the workshop can give a printed copy). Issued invoices can be downloaded or printed as PDFs.
 */
export function VehicleHistoryPage() {
  const { vehicleId = '' } = useParams();
  const site = useSite();
  const { account } = useCustomerAuth();
  const setup = useBookingSettings();
  const tz = setup.data?.settings.time_zone ?? DEFAULT_TIME_ZONE;
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!account) return;
    setState({ status: 'loading' });
    const [vehicles, history] = await Promise.all([listVehicles(account.id), myServiceHistory(site.slug, vehicleId)]);
    if (vehicles.error !== null) return setState({ status: 'error', message: vehicles.error });
    const vehicle = vehicles.data.find((v) => v.id === vehicleId);
    if (!vehicle) return setState({ status: 'missing' });
    if (history.error !== null) return setState({ status: 'error', message: history.error });
    // Invoices are extra: if they cannot be read, the history still shows (without invoice rows).
    const invoices = await invoicesForRepairs(history.data.map((r) => r.id));
    setState({ status: 'ready', vehicle, repairs: history.data, invoices: invoices.data ?? {} });
  }, [account, site.slug, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = state.status === 'ready' ? state.vehicle.nickname || carName(state.vehicle) : 'Vehicle';
  useEffect(() => {
    document.title = `Service history, ${name} | ${site.display_name}`;
  }, [name, site.display_name]);

  return (
    <div className="container-site py-8 sm:py-12">
      {/* Printing shows this note instead of the history. */}
      <div className="hidden print:block">
        <p className="text-lg font-semibold">Service history cannot be printed from the website.</p>
        <p className="mt-2">Ask {site.display_name} for a printed copy{site.phone ? ` on ${site.phone}` : ''}.</p>
      </div>

      <div className="space-y-6 print:hidden">
        <Link to={sitePath(site, 'garage')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline coarse:min-h-11">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          My Garage
        </Link>

        {state.status === 'loading' && (
          <div aria-busy="true" className="space-y-4">
            <p className="sr-only" role="status">
              Loading the service history
            </p>
            <div aria-hidden className="glass h-36 animate-pulse rounded-3xl motion-reduce:animate-none" />
            <div aria-hidden className="glass h-64 animate-pulse rounded-2xl motion-reduce:animate-none" />
          </div>
        )}

        {state.status === 'error' && (
          <div role="alert" className="glass rounded-2xl border-l-4 border-l-bad p-5">
            <p className="font-semibold text-fg">We could not load the service history.</p>
            <p className="mt-1 text-sm text-fg2">{state.message}</p>
            <button type="button" onClick={() => void load()} className="btn-outline mt-4">
              <RotateCcw className="h-4 w-4" aria-hidden />
              Try again
            </button>
          </div>
        )}

        {state.status === 'missing' && (
          <div className="glass rounded-2xl p-6">
            <p className="font-semibold text-fg">This vehicle is not in your garage.</p>
            <Link to={sitePath(site, 'garage')} className="btn-outline mt-4">
              Back to My Garage
            </Link>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <VehicleHeader vehicle={state.vehicle} repairs={state.repairs} timeZone={tz} />
            {state.repairs.length === 0 ? (
              <div className="glass flex flex-col items-center rounded-2xl p-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Wrench className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-4 font-semibold text-fg">No service history yet</p>
                <p className="mt-1 max-w-sm text-sm text-fg2">Repairs and services on this car at {site.display_name} will appear here.</p>
                <Link to={sitePath(site, 'book')} className="btn-ink mt-5">
                  <CalendarCheck className="h-4 w-4" aria-hidden />
                  Book
                </Link>
              </div>
            ) : (
              <ol className="space-y-4" aria-label="Repairs, newest first">
                {state.repairs.map((r, i) => (
                  <li key={r.id}>
                    <RepairRecord repair={r} invoice={state.invoices[r.id] ?? null} timeZone={tz} defaultOpen={i === 0} />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VehicleHeader({ vehicle: v, repairs, timeZone }: { vehicle: CustomerVehicleRow; repairs: HistoryRepair[]; timeZone: string }) {
  const site = useSite();
  const name = v.nickname || carName(v);
  const last = repairs[0];
  return (
    <section className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {v.photo_path ? (
          <img src={customerPhotoUrl(v.photo_path)} alt="" className="aspect-[16/10] w-full rounded-2xl object-cover sm:w-56" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Car className="h-7 w-7" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="eyebrow">Service history</p>
          <h1 className="mt-1 break-words font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{name}</h1>
          {v.nickname && <p className="text-sm text-fg2">{carName(v)}</p>}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-fg3">Plate</dt>
              <dd className="font-mono font-semibold text-fg">{v.plate || 'Not set'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-fg3">VIN</dt>
              <dd className="break-all font-mono font-semibold text-fg">{v.vin || 'Not set'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-fg3">Visits</dt>
              <dd className="font-semibold text-fg">{repairs.length}</dd>
            </div>
            {last && (
              <div className="flex gap-1.5">
                <dt className="text-fg3">Last visit</dt>
                <dd className="font-semibold text-fg">{formatDay(last.created_at, timeZone)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-fg3">Everything done on this car at {site.display_name}. Need a printed copy? Ask the workshop.</p>
        </div>
      </div>
    </section>
  );
}

function RepairRecord({
  repair: r,
  invoice,
  timeZone,
  defaultOpen,
}: {
  repair: HistoryRepair;
  invoice: InvoiceSummary | null;
  timeZone: string;
  defaultOpen: boolean;
}) {
  const site = useSite();
  const [open, setOpen] = useState(defaultOpen);
  const closed = conversationClosed(r.status);
  const done = r.items.filter((i) => i.approval === 'approved').length;
  const notDone = r.items.filter((i) => i.approval === 'declined').length;
  const bodyId = `repair-${r.id}`;

  return (
    <article aria-labelledby={`${bodyId}-title`} className="glass rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left sm:p-6"
      >
        <span className="min-w-0">
          <span id={`${bodyId}-title`} className="block font-display text-lg font-semibold text-fg">
            {formatDay(r.created_at, timeZone)}
          </span>
          <span className="mt-0.5 block text-xs text-fg3">
            {r.number}
            {r.technician && <> · {r.technician}</>}
            {' · '}
            {done} done{notDone > 0 && `, ${notDone} not done`}
            {r.media.length > 0 && ` · ${r.media.length} photo${r.media.length === 1 ? '' : 's'}`}
            {r.messages.length > 0 && ` · ${r.messages.length} message${r.messages.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <StatusPill status={r.status} />
          <ChevronDown className={`h-5 w-5 text-fg3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>

      {invoice && (
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <p className="flex items-center gap-2 text-sm text-fg">
            <Receipt className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-semibold">Invoice {invoice.number}</span>
              <span className="text-fg3"> · </span>
              <span className="tabular-nums">{formatMoney(invoice.total)}</span>
              <span className="sr-only"> including tax</span>
            </span>
          </p>
          <InvoiceButtons invoice={invoice} compact />
        </div>
      )}

      {open && (
        <div id={bodyId} className="space-y-6 border-t border-line p-5 sm:p-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-fg3">Checked in</dt>
              <dd className="text-fg">{formatWhen(r.created_at, timeZone)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg3">Completed</dt>
              <dd className="text-fg">{r.completed_at ? formatWhen(r.completed_at, timeZone) : 'Not yet'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg3">Technician</dt>
              <dd className="flex items-center gap-1.5 text-fg">
                <User className="h-3.5 w-3.5 text-fg3" aria-hidden />
                {r.technician ?? 'Not assigned'}
              </dd>
            </div>
          </dl>

          {r.customer_notes && (
            <div className="rounded-xl border border-line bg-surface2/60 p-3 text-sm">
              <p className="text-xs font-semibold text-fg3">What you told us</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-fg2">{r.customer_notes}</p>
            </div>
          )}

          <section aria-label="Work">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
              <Wrench className="h-4 w-4 text-accent" aria-hidden />
              Work done and not done
            </h3>
            <ItemsSummary items={r.items} />
            {r.items.length > 0 && <Totals items={r.items} />}
          </section>

          {r.events.some((e) => e.kind === 'note' || e.kind === 'approval') && (
            <section aria-label="Notes from the workshop">
              <h3 className="mb-3 text-sm font-semibold text-fg">Notes from the workshop</h3>
              <WorkshopUpdates events={r.events} timeZone={timeZone} />
            </section>
          )}

          {r.media.length > 0 && (
            <section aria-label="Photos and video">
              <h3 className="mb-3 text-sm font-semibold text-fg">Photos and video</h3>
              <MediaGrid media={r.media} />
            </section>
          )}

          <section aria-label="Conversation">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
              <MessageSquare className="h-4 w-4 text-accent" aria-hidden />
              Conversation
            </h3>
            {r.messages.length === 0 ? (
              <p className="text-sm text-fg2">No messages on this repair.</p>
            ) : (
              <ol className="space-y-3">
                {r.messages.map((m) => {
                  const mine = m.sender === 'customer';
                  return (
                    <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? 'text-right' : ''}`}>
                        <p className="sr-only">{mine ? 'You' : (m.author_name ?? site.display_name)} said:</p>
                        <p
                          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm ${
                            mine ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md border border-line bg-surface2 text-fg'
                          }`}
                        >
                          {m.body}
                        </p>
                        <p className="mt-1 px-1 text-[11px] text-fg3">
                          {mine ? 'You' : (m.author_name ?? site.display_name)} · <time dateTime={m.created_at}>{formatWhen(m.created_at, timeZone)}</time>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {closed ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-fg3">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                This repair is {r.status === 'cancelled' ? 'cancelled' : 'completed'}, so its conversation is closed.
              </p>
            ) : (
              <Link to={sitePath(site, `track/${encodeURIComponent(r.tracking_code)}#messages`)} className="btn-outline mt-3 min-h-11 py-2.5">
                <FileText className="h-4 w-4" aria-hidden />
                Open this repair to reply
              </Link>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
