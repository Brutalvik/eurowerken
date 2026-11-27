import { useId, useState } from 'react';
import { AlertTriangle, FileDown, Loader2, Printer, Send } from 'lucide-react';
import { errorMessage, formatDateTime } from '@/api/appointments';
import { emailStateView, resendInvoice, useInvoiceHideContact } from '@/api/invoices';
import type { Invoice, OutboxRow } from '@/api/invoices';
import { downloadInvoicePdf, ensureInvoicePdf, printInvoicePdf, storeErrorMessage, useCanStoreInvoicePdf } from '@/api/invoicePdf';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/** Issued / Void. Payments are not built, so there is no Paid or Overdue. */
export function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  return status === 'void' ? <Badge tone="neutral">Void</Badge> : <Badge tone="info">Issued</Badge>;
}

/** Staff who may send an invoice again (the database checks this too). */
export function useCanResendInvoice(): boolean {
  return useCanStoreInvoicePdf();
}

/**
 * The "Show customer phone and email" choice, starting from the opposite of the shop's invoice_hide_contact
 * (hidden until the setting has loaded). Once the user changes it, their choice stays.
 */
export function useShowContactChoice(): [boolean, (show: boolean) => void] {
  const hideDefault = useInvoiceHideContact();
  const [choice, setChoice] = useState<boolean | null>(null);
  return [choice ?? (hideDefault === null ? false : !hideDefault), setChoice];
}

/** The checkbox that decides whether a printed or downloaded invoice shows the customer's phone and email in full. */
export function ShowContactCheckbox({ checked, onChange, className = '' }: { checked: boolean; onChange: (show: boolean) => void; className?: string }) {
  const id = useId();
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] text-fg2 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
      />
      <label htmlFor={id}>Show customer phone and email</label>
    </span>
  );
}

/**
 * Download PDF and Print: the PDF is built fresh in the browser each time (void invoices are marked VOID).
 * Anyone who can see the invoice may use them. Pass `showContact` to control the privacy choice from outside
 * (one checkbox for a whole list); otherwise the buttons come with their own checkbox.
 */
export function InvoicePdfActions({
  invoice,
  onError,
  showContact,
}: {
  invoice: Pick<Invoice, 'id' | 'number'>;
  onError: (message: string | null) => void;
  showContact?: boolean;
}) {
  const [ownChoice, setOwnChoice] = useShowContactChoice();
  const show = showContact ?? ownChoice;
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);

  async function run(kind: 'download' | 'print') {
    setBusy(kind);
    onError(null);
    try {
      if (kind === 'download') await downloadInvoicePdf(invoice.id, !show);
      else await printInvoicePdf(invoice.id, !show);
    } catch (err) {
      onError(errorMessage(err, kind === 'download' ? 'The PDF could not be made. Try again.' : 'The invoice could not be printed. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        aria-busy={busy === 'download'}
        onClick={() => void run('download')}
        aria-label={`Download the PDF of invoice ${invoice.number}`}
      >
        {busy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <FileDown className="h-3.5 w-3.5" aria-hidden />}
        {busy === 'download' ? 'Preparing...' : 'Download PDF'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        aria-busy={busy === 'print'}
        onClick={() => void run('print')}
        aria-label={`Print invoice ${invoice.number}`}
      >
        {busy === 'print' ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Printer className="h-3.5 w-3.5" aria-hidden />}
        {busy === 'print' ? 'Preparing...' : 'Print'}
      </Button>
      {showContact === undefined && <ShowContactCheckbox checked={ownChoice} onChange={setOwnChoice} />}
      {busy && (
        <span role="status" className="sr-only">
          Preparing the PDF of invoice {invoice.number}.
        </span>
      )}
    </>
  );
}

/** A quiet note when the stored copy of the PDF could not be made, with Try again. */
export function PdfStoreError({ message, onRetry }: { message: string | null | undefined; onRetry: () => void }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-bad">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{message}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * Send again: marks the invoice to be emailed again, then at once makes, stores and attaches a fresh PDF, which
 * queues the email (the email state shows its progress). Hidden for staff who may not, and for void invoices.
 */
export function ResendInvoiceButton({
  invoice,
  onDone,
  onError,
}: {
  invoice: Pick<Invoice, 'id' | 'workshop_id' | 'number' | 'status'>;
  onDone: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const allowed = useCanResendInvoice();
  const [busy, setBusy] = useState(false);
  if (!allowed || invoice.status !== 'issued') return null;

  async function send() {
    setBusy(true);
    onError(null);
    try {
      await resendInvoice(invoice.id);
    } catch (err) {
      onError(errorMessage(err, 'The invoice could not be sent again.'));
      setBusy(false);
      return;
    }
    try {
      await ensureInvoicePdf(invoice);
      onDone('Invoice sent again');
    } catch (err) {
      // The email still waits for the PDF; the card retries when the invoice changes, or with Try again.
      onError(storeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void send()} aria-label={`Send invoice ${invoice.number} to the customer again`}>
      <Send className="h-3.5 w-3.5" aria-hidden />
      {busy ? 'Sending...' : 'Send again'}
    </Button>
  );
}

/**
 * The state of an email: badge, then the time and any error or reason. `pdfPending`: the invoice waits for its
 * PDF, so its email is not queued yet (Preparing the PDF).
 */
export function EmailState({
  row,
  tz,
  compact = false,
  pdfPending = false,
}: {
  row: OutboxRow | null | undefined;
  tz: string;
  compact?: boolean;
  pdfPending?: boolean;
}) {
  const view = emailStateView(row, pdfPending);
  return (
    <div className="min-w-0 space-y-0.5">
      <Badge tone={view.tone}>{view.label}</Badge>
      {view.detail && <p className={`break-words text-[11px] ${view.tone === 'bad' ? 'text-bad' : 'text-fg2'}`}>{view.detail}</p>}
      {!compact && view.at && (
        <p className="text-[10px] text-fg3">
          <time dateTime={view.at}>{formatDateTime(view.at, tz)}</time>
        </p>
      )}
    </div>
  );
}
