import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mail, MessageSquareText } from 'lucide-react';
import { errorMessage, formatDateTime } from '@/api/appointments';
import { createInvoice, getInvoiceForRepair, latestByInvoice, listRepairOutbox, maskEmail, subscribeRepairInvoice } from '@/api/invoices';
import type { Invoice, OutboxRow } from '@/api/invoices';
import { REPAIR_STATUS_LABEL } from '@/api/repairOrders';
import type { RepairStatus } from '@/api/repairOrders';
import { useAuth } from '@/auth/AuthContext';
import { useEnsureInvoicePdf } from '@/api/invoicePdf';
import { EmailState, InvoicePdfActions, InvoiceStatusBadge, PdfStoreError, ResendInvoiceButton } from '@/components/InvoiceActions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { ErrorNote } from '../inventory/PartForm';
import { SectionTitle, textLink } from './common';
import { formatTaxLabel } from '@eurowerken/shared';
import { PaymentPanel } from '@/components/payments/PaymentPanel';

interface Props {
  repairOrderId: string;
  status: RepairStatus;
  tz: string;
  announce: (message: string) => void;
}

/**
 * The invoice of a repair order (made automatically at Ready for pickup) and the customer emails sent about it.
 * Both cards read their own data and stay current through Realtime.
 */
export function RepairInvoiceCard({ repairOrderId, status, tz, announce }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [inv, rows] = await Promise.all([getInvoiceForRepair(repairOrderId), listRepairOutbox(repairOrderId)]);
      setInvoice(inv);
      setOutbox(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'The invoice could not be loaded.'));
    } finally {
      setLoaded(true);
    }
  }, [repairOrderId]);

  useEffect(() => {
    setInvoice(null);
    setOutbox([]);
    setLoaded(false);
    void load();
    const unsubscribe = subscribeRepairInvoice(repairOrderId, () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 300);
    });
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repairOrderId, load]);

  return (
    <>
      <InvoiceCard repairOrderId={repairOrderId} status={status} invoice={invoice} outbox={outbox} loaded={loaded} loadError={loadError} tz={tz} announce={announce} onRetry={() => void load()} />
      {loaded && !loadError && <CustomerEmailsCard rows={outbox} invoice={invoice} tz={tz} />}
    </>
  );
}

interface InvoiceCardProps {
  repairOrderId: string;
  status: RepairStatus;
  invoice: Invoice | null;
  outbox: OutboxRow[];
  loaded: boolean;
  loadError: string | null;
  tz: string;
  announce: (message: string) => void;
  onRetry: () => void;
}

function InvoiceCard({ repairOrderId, status, invoice, outbox, loaded, loadError, tz, announce, onRetry }: InvoiceCardProps) {
  const id = useId();
  const { can } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);
  const [send, setSend] = useState(true);
  const [creating, setCreating] = useState(false);
  const canCreate = (can('invoices', 'full') || can('repair-orders', 'full')) && (status === 'ready' || status === 'completed');

  async function create() {
    setCreating(true);
    setActionError(null);
    try {
      await createInvoice(repairOrderId, send);
      announce(send ? 'Invoice created. It will be emailed to the customer.' : 'Invoice created.');
      onRetry();
    } catch (err) {
      setActionError(errorMessage(err, 'The invoice could not be created.'));
    } finally {
      setCreating(false);
    }
  }
  // Makes and stores the PDF the invoice email waits for (staff with Invoices or Repair Orders full).
  const store = useEnsureInvoicePdf(invoice);
  const latest = invoice ? latestByInvoice(outbox).get(invoice.id) : undefined;

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-3 text-xs">
        <SectionTitle id={`${id}-title`} title="Invoice" />
        {!loaded && !loadError && (
          <p role="status" className="text-fg2">
            Loading invoice...
          </p>
        )}
        {loadError && (
          <div className="space-y-2">
            <ErrorNote errors={loadError} />
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
        {loaded && !loadError && !invoice && !canCreate && (
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-fg2">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg3" aria-hidden />
            {status === 'ready' || status === 'completed'
              ? 'This repair has no invoice. Staff with full access to Invoices or Repair Orders can create it.'
              : 'The invoice is created automatically when this repair is marked Ready for pickup.'}
          </p>
        )}
        {loaded && !loadError && !invoice && canCreate && (
          <div className="space-y-3 rounded-lg border border-dashed border-line px-3 py-3">
            <p className="flex items-start gap-2 text-fg2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg3" aria-hidden />
              This repair has no invoice yet. Create it from the approved work.
            </p>
            <label className="flex items-center gap-2 text-fg">
              <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              Email it to the customer as a PDF
            </label>
            <Button onClick={() => void create()} disabled={creating}>
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {creating ? 'Creating...' : 'Create invoice'}
            </Button>
            <ErrorNote errors={actionError} />
          </div>
        )}
        {invoice && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {can('invoices', 'view') ? (
                <Link to="/invoices" state={{ q: invoice.number }} className={`${textLink} font-display text-sm font-semibold`}>
                  {invoice.number}
                </Link>
              ) : (
                <span className="font-display text-sm font-semibold text-fg">{invoice.number}</span>
              )}
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="text-[11px] text-fg3">
              Issued <time dateTime={invoice.issued_at}>{formatDateTime(invoice.issued_at, tz)}</time>
              {invoice.status === 'void' && '. Void because the repair was cancelled.'}
            </p>

            <dl className="space-y-1 rounded-lg border border-line bg-surface2/50 p-3 tabular-nums">
              <div className="flex justify-between gap-3">
                <dt className="text-fg2">Subtotal</dt>
                <dd className="text-fg">{formatCurrency(invoice.subtotal)}</dd>
              </div>
              {invoice.taxes.map((t) => (
                <div key={`${t.code}-${t.label}`} className="flex justify-between gap-3">
                  <dt className="text-fg2">{formatTaxLabel(t, 'paren')}</dt>
                  <dd className="text-fg">{formatCurrency(t.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                <dt className="text-fg">Total</dt>
                <dd className="text-fg">{formatCurrency(invoice.total)}</dd>
              </div>
            </dl>

            <PaymentPanel invoice={invoice} tz={tz} onChange={onRetry} />

            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg3">Invoice email</p>
              <EmailState row={latest} tz={tz} pdfPending={invoice.status === 'issued' && invoice.email_pending} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <InvoicePdfActions invoice={invoice} onError={setActionError} />
              <ResendInvoiceButton invoice={invoice} onError={setActionError} onDone={announce} />
            </div>
            <ErrorNote errors={actionError} />
            <PdfStoreError message={store.error} onRetry={store.retry} />
          </>
        )}
      </section>
    </Card>
  );
}

function describe(row: OutboxRow, invoice: Invoice | null): string {
  if (row.kind === 'invoice') {
    return invoice && row.invoice_id === invoice.id ? `Invoice ${invoice.number}` : 'Invoice';
  }
  return row.status ? `Status: ${REPAIR_STATUS_LABEL[row.status] ?? row.status}` : 'Status update';
}

/** Every email (or text) the customer was sent about this repair, newest first. */
function CustomerEmailsCard({ rows, invoice, tz }: { rows: OutboxRow[]; invoice: Invoice | null; tz: string }) {
  const id = useId();
  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-3 text-xs">
        <SectionTitle id={`${id}-title`} title="Customer emails" subtitle="Newest first" />
        {rows.length === 0 ? (
          <p className="text-fg2">No emails to the customer yet. One is sent at each progress step, if the shop has progress emails on.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const Icon = row.channel === 'sms' ? MessageSquareText : Mail;
              const to = row.channel === 'sms' ? row.to_address ?? '' : maskEmail(row.to_address);
              return (
                <li key={row.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-fg">{describe(row, invoice)}</p>
                    <p className="break-all text-[11px] text-fg2">
                      {to ? `To ${to}` : 'No address'}
                    </p>
                    <EmailState row={row} tz={tz} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
