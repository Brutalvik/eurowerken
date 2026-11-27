import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { dayKeyOf, errorMessage, getTimeZone, vehicleLabel } from '@/api/appointments';
import { listInvoices, listLatestInvoiceEmails, subscribeInvoices } from '@/api/invoices';
import type { Invoice, OutboxRow } from '@/api/invoices';
import { plateOf } from '@/api/repairOrders';
import { useAuth } from '@/auth/AuthContext';
import { useEnsureInvoicePdfs } from '@/api/invoicePdf';
import { listInvoiceBalances, listMoneySince, PAYMENT_STATUS_LABEL, subscribePayments } from '@/api/payments';
import type { InvoiceBalance, InvoicePaymentStatus, MoneyMovement } from '@/api/payments';
import { PaymentStatusBadge } from '@/components/payments/PaymentStatusBadge';
import { PillTabs } from '@/components/ui/PillTabs';
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

type PayFilter = 'All' | 'Unpaid' | 'Partly paid' | 'Paid' | 'Refunded';
const PAY_FILTERS: readonly PayFilter[] = ['All', 'Unpaid', 'Partly paid', 'Paid', 'Refunded'];

function payFilterMatches(filter: PayFilter, inv: Invoice, b: InvoiceBalance | undefined): boolean {
  if (filter === 'All') return true;
  if (!b || inv.status === 'void') return false;
  return PAYMENT_STATUS_LABEL[b.payment_status] === filter;
}

/**
 * Invoices: created automatically when a repair order is marked Ready for pickup and emailed with a PDF.
 * Balances and payment status come from migration 030 (payments); the database keeps them.
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
  // Payments (migration 030). Null while loading or when payments are not set up; the page works without them.
  const [balances, setBalances] = useState<Map<string, InvoiceBalance> | null>(null);
  const [money, setMoney] = useState<MoneyMovement[] | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<PayFilter>('All');
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
    try {
      // Enough to cover this month in any time zone.
      const since = new Date(Date.now() - 32 * 864e5).toISOString();
      const [b, m] = await Promise.all([listInvoiceBalances(workshopId), listMoneySince(workshopId, since)]);
      setBalances(b);
      setMoney(m);
      setPaymentsError(null);
    } catch (err) {
      setPaymentsError(errorMessage(err, 'Payments could not be loaded.'));
    }
  }, [workshopId]);

  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getTimeZone(workshopId).then((t) => active && setTz(t)).catch(() => undefined);
    void load();
    // Several changes arrive together (an invoice and its email): read once after they settle.
    const later = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 300);
    };
    const unsubscribeInvoices = subscribeInvoices(workshopId, later);
    const unsubscribePayments = subscribePayments({ workshopId }, later);
    const unsubscribe = () => {
      unsubscribeInvoices();
      unsubscribePayments();
    };
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
    // Work in cents so sums never drift.
    const c = (n: number) => Math.round(n * 100);
    let outstanding = 0;
    let outstandingCount = 0;
    for (const i of all) {
      const b = balances?.get(i.id);
      if (i.status === 'issued' && b && b.balance > 0) {
        outstanding += c(b.balance);
        outstandingCount++;
      }
    }
    const paidThisMonth = (money ?? [])
      .filter((m) => m.received_at && dayKeyOf(m.received_at, tz).slice(0, 7) === month)
      .reduce((sum, m) => sum + (m.kind === 'refund' ? -c(m.amount) : c(m.amount)), 0);
    return {
      amount: thisMonth.reduce((sum, i) => sum + c(i.total), 0) / 100,
      count: thisMonth.length,
      outstanding: outstanding / 100,
      outstandingCount,
      paid: paidThisMonth / 100,
    };
  }, [invoices, balances, money, tz]);

  const rows = useMemo(
    () => (invoices ?? []).filter((i) => matches(i, search) && payFilterMatches(payFilter, i, balances?.get(i.id))),
    [invoices, search, payFilter, balances],
  );

  const paymentStatusOf = (i: Invoice): InvoicePaymentStatus | null => (i.status === 'void' ? null : balances?.get(i.id)?.payment_status ?? null);

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
    {
      header: 'Balance',
      className: 'whitespace-nowrap tabular-nums text-fg',
      cell: (i) => {
        const b = balances?.get(i.id);
        if (!b) return <span className="text-fg3">-</span>;
        if (b.balance < 0) return <span className="text-warn">Credit {formatCurrency(-b.balance)}</span>;
        return i.status === 'void' ? <span className="text-fg3">-</span> : formatCurrency(b.balance);
      },
    },
    {
      header: 'Status',
      mobile: 'corner',
      cell: (i) => {
        const ps = paymentStatusOf(i);
        return (
          <span className="flex flex-wrap items-center gap-1">
            {i.status === 'void' || !ps ? <InvoiceStatusBadge status={i.status} /> : <PaymentStatusBadge status={ps} />}
          </span>
        );
      },
    },
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

  const paymentsReady = balances !== null && money !== null;
  const cards = [
    {
      label: 'Outstanding',
      value: paymentsReady ? formatCurrency(summary.outstanding) : paymentsError ? 'Not set up' : '...',
      color: 'text-warn',
      caption: paymentsReady ? `${summary.outstandingCount} invoice${summary.outstandingCount === 1 ? '' : 's'} with a balance` : 'Balances owed',
    },
    {
      label: 'Paid this month',
      value: paymentsReady ? formatCurrency(summary.paid) : paymentsError ? 'Not set up' : '...',
      color: 'text-ok',
      caption: 'Received, less refunds',
    },
    {
      label: 'Invoiced this month',
      value: formatCurrency(summary.amount),
      color: 'text-accent',
      caption: `${summary.count} issued invoice${summary.count === 1 ? '' : 's'}, with tax`,
    },
  ];

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {cards.map((card) => (
          <div key={card.label} className="glass rounded-2xl p-4 sm:p-5">
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
          {paymentsError && <p className="text-[11px] text-fg3">Balances are not shown: {paymentsError}</p>}
          {invoices && invoices.length > 0 && balances && (
            <PillTabs label="Filter by payment" options={PAY_FILTERS} value={payFilter} onChange={setPayFilter} />
          )}
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
              <DataTable columns={columns} rows={rows} getKey={(i) => i.id} emptyMessage={payFilter === 'All' ? 'No invoices match your search.' : `No ${payFilter.toLowerCase()} invoices match.`} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
