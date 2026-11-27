import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { dayKeyOf, errorMessage, getTimeZone, vehicleLabel } from '@/api/appointments';
import { listInvoices, listLatestInvoiceEmails, subscribeInvoices } from '@/api/invoices';
import type { Invoice, OutboxRow } from '@/api/invoices';
import { plateOf } from '@/api/repairOrders';
import { useAuth } from '@/auth/AuthContext';
import { useEnsureInvoicePdfs } from '@/api/invoicePdf';
import {
  EmailState,
  InvoicePdfActions,
  InvoiceStatusBadge,
  PdfStoreError,
  ResendInvoiceButton,
  ShowContactCheckbox,
  useShowContactChoice,
} from '@/components/InvoiceActions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatCurrency } from '@/lib/format';
import { ErrorNote } from './inventory/PartForm';
import { textLink } from './repair-orders/common';
import { EmptyNote } from './SalesPage';

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function formatDay(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let f = dateFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' });
    dateFormatters.set(tz, f);
  }
  return f.format(d);
}

function matches(inv: Invoice, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [inv.number, inv.bill_to.name ?? '', plateOf(inv.vehicle), inv.repair_order?.number ?? ''].some((x) => x.toLowerCase().includes(q));
}

/**
 * Invoices: created automatically when a repair order is marked Ready for pickup and emailed with a PDF.
 * Payments are not built yet, so there is no Paid or Overdue.
 */
export function InvoicesPage() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canSeeRepairs = can('repair-orders', 'view');
  // The search stays out of the address (it can be a customer's name). A link may pass a starting search
  // (an invoice number) in the navigation state.
  const location = useLocation();
  const [search, setSearch] = useState(() => ((location.state as { q?: string } | null)?.q ?? ''));
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [emails, setEmails] = useState<Map<string, OutboxRow>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tz, setTz] = useState('America/Edmonton');
  const [live, setLive] = useState('');
  const timer = useRef<number | null>(null);
  // One privacy choice for every Download PDF and Print in the list.
  const [showContact, setShowContact] = useShowContactChoice();
  // Makes and stores the PDF of each invoice whose email waits for it (staff with Invoices or Repair Orders full).
  const store = useEnsureInvoicePdfs(invoices);

  const announce = useCallback((message: string) => {
    setLive('');
    window.setTimeout(() => setLive(message), 30);
  }, []);

  const load = useCallback(async () => {
    if (!workshopId) return;
    try {
      const [list, latest] = await Promise.all([listInvoices(workshopId), listLatestInvoiceEmails(workshopId)]);
      setInvoices(list);
      setEmails(latest);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'The invoices could not be loaded.'));
    }
  }, [workshopId]);

  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getTimeZone(workshopId).then((t) => active && setTz(t)).catch(() => undefined);
    void load();
    // Several changes arrive together (an invoice and its email): read once after they settle.
    const unsubscribe = subscribeInvoices(workshopId, () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 300);
    });
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      unsubscribe();
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [workshopId, load]);

  const summary = useMemo(() => {
    const month = dayKeyOf(new Date(), tz).slice(0, 7);
    const all = invoices ?? [];
    const thisMonth = all.filter((i) => i.status === 'issued' && i.issued_at && dayKeyOf(i.issued_at, tz).slice(0, 7) === month);
    return {
      amount: thisMonth.reduce((sum, i) => sum + i.total, 0),
      count: thisMonth.length,
      void: all.filter((i) => i.status === 'void').length,
    };
  }, [invoices, tz]);

  const rows = useMemo(() => (invoices ?? []).filter((i) => matches(i, search)), [invoices, search]);

  const columns: Column<Invoice>[] = [
    {
      header: 'Invoice',
      mobile: 'title',
      className: 'font-semibold text-fg whitespace-nowrap',
      cell: (i) => i.number,
    },
    { header: 'Issued', className: 'whitespace-nowrap text-fg2', cell: (i) => <time dateTime={i.issued_at}>{formatDay(i.issued_at, tz)}</time> },
    { header: 'Customer', className: 'text-fg', cell: (i) => i.bill_to.name ?? 'No name' },
    {
      header: 'Vehicle',
      cell: (i) => {
        const car = vehicleLabel(i.vehicle);
        const plate = plateOf(i.vehicle);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{car || 'Not given'}</span>
            {plate && <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-fg">{plate}</span>}
          </span>
        );
      },
    },
    {
      header: 'Total',
      mobile: 'corner',
      className: 'whitespace-nowrap font-semibold tabular-nums text-fg',
      cell: (i) => (i.status === 'void' ? <s className="text-fg3">{formatCurrency(i.total)}</s> : formatCurrency(i.total)),
    },
    { header: 'Status', mobile: 'corner', cell: (i) => <InvoiceStatusBadge status={i.status} /> },
    {
      header: 'Email',
      cell: (i) => <EmailState row={emails.get(i.id)} tz={tz} compact pdfPending={i.status === 'issued' && i.email_pending} />,
    },
    {
      header: 'Repair order',
      cell: (i) => {
        const label = i.repair_order?.number ?? 'Repair order';
        return canSeeRepairs ? (
          <Link to={`/repair-orders/${i.repair_order_id}`} className={textLink} aria-label={`Open repair order ${label}`}>
            {label}
          </Link>
        ) : (
          <span>{i.repair_order?.number ?? '-'}</span>
        );
      },
    },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: (i) => (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <InvoicePdfActions invoice={i} onError={setActionError} showContact={showContact} />
            <ResendInvoiceButton invoice={i} onError={setActionError} onDone={announce} />
          </div>
          <PdfStoreError message={store.errors.get(i.id)} onRetry={() => store.retry(i.id)} />
        </div>
      ),
    },
  ];

  const cards = [
    { label: 'Invoiced this month', value: formatCurrency(summary.amount), color: 'text-accent', caption: 'Issued invoices, with GST' },
    { label: 'Invoices this month', value: String(summary.count), color: 'text-fg', caption: 'Issued' },
    { label: 'Void', value: String(summary.void), color: 'text-fg2', caption: 'Cancelled repairs' },
  ];

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {cards.map((card) => (
          <div key={card.label} className="glass rounded-xl p-4 sm:p-5">
            <div className="text-xs text-fg2">{card.label}</div>
            <div className={`mt-2 font-display text-xl font-semibold tabular-nums ${card.color}`}>{invoices ? card.value : '...'}</div>
            <div className="mt-1 text-[11px] text-fg3">{card.caption}</div>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden p-4 pb-0 sm:p-5 sm:pb-0">
        <CardHeader
          title="All invoices"
          subtitle="Made automatically when a repair is marked Ready for pickup, and emailed to the customer as a PDF."
          action={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search number, customer or plate"
              className="w-full sm:w-64"
            />
          }
        />
        <div className="space-y-3 pb-4 sm:pb-5">
          {loadError && (
            <div className="space-y-2">
              <ErrorNote errors={loadError} />
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}
          <ErrorNote errors={actionError} />
          {invoices && invoices.length > 0 && <ShowContactCheckbox checked={showContact} onChange={setShowContact} />}
          {!invoices && !loadError && (
            <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
              Loading invoices...
            </p>
          )}
          {invoices && invoices.length === 0 && (
            <EmptyNote icon={<FileText className="h-5 w-5" aria-hidden />} title="No invoices yet">
              An invoice is created automatically when a repair order is marked Ready for pickup, from its approved items, and
              emailed to the customer as a PDF.
            </EmptyNote>
          )}
          {invoices && invoices.length > 0 && (
            <div className="-mx-4 -mb-4 border-t border-line sm:-mx-5 sm:-mb-5">
              <DataTable columns={columns} rows={rows} getKey={(i) => i.id} emptyMessage="No invoices match your search." />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
