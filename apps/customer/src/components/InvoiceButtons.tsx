import { useEffect, useId, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { makeInvoicePdf } from '@/api/invoices';
import type { InvoiceSummary } from '@/api/invoices';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { PayInvoice } from './payments/PayInvoice';

type Phase = { kind: 'idle' } | { kind: 'busy'; action: 'download' | 'print' } | { kind: 'done'; message: string } | { kind: 'error'; message: string };

/** A guest's tracking details (tracking page): lets a visitor who is not signed in pay. */
export interface InvoiceGuest {
  slug: string;
  code: string;
  contact: string;
}

/**
 * Pay now (when the shop takes payments online and a balance remains, or a Paid badge once settled), Download PDF and
 * Print for one invoice, plus the per-print choice to show the full phone and email.
 * The PDF is built fresh on each click (pdf-lib loads only then). The choice starts from the account setting.
 * Pass guest to pay as a visitor who is not signed in (the server checks the tracking code and contact).
 */
export function InvoiceButtons({ invoice, compact = false, guest }: { invoice: InvoiceSummary; compact?: boolean; guest?: InvoiceGuest }) {
  const { account } = useCustomerAuth();
  const savedHide = account?.invoice_hide_contact ?? true;
  const [showContact, setShowContact] = useState(!savedHide);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const id = useId();

  // Follow the saved setting when it changes (for example on the account page in another tab of the app).
  useEffect(() => {
    setShowContact(!savedHide);
  }, [savedHide]);

  const busy = phase.kind === 'busy';

  async function run(action: 'download' | 'print') {
    if (busy) return;
    setPhase({ kind: 'busy', action });
    try {
      await makeInvoicePdf(invoice.id, action, !showContact);
      setPhase({
        kind: 'done',
        message: action === 'download' ? `Invoice ${invoice.number} is downloaded.` : `Invoice ${invoice.number} is open for printing.`,
      });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error && e.message ? e.message : 'The invoice could not be prepared. Try again.' });
    }
  }

  const btn = compact ? 'min-h-11 px-3 py-2 text-sm' : 'min-h-11 px-4 py-2.5';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <PayInvoice compact={compact} source={guest ? { kind: 'guest', ...guest } : { kind: 'owner', invoiceId: invoice.id }} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run('download')}
          disabled={busy}
          aria-label={`Download invoice ${invoice.number} as a PDF`}
          className={`btn-ink bg-accent text-accent-fg shadow-accent/20 disabled:opacity-60 ${btn}`}
        >
          {busy && phase.action === 'download' ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          Download PDF
        </button>
        <button
          type="button"
          onClick={() => void run('print')}
          disabled={busy}
          aria-label={`Print invoice ${invoice.number}`}
          className={`btn-outline disabled:opacity-60 ${btn}`}
        >
          {busy && phase.action === 'print' ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Printer className="h-4 w-4" aria-hidden />
          )}
          Print
        </button>
      </div>

      <label htmlFor={`${id}-contact`} className="flex cursor-pointer items-start gap-2.5 text-sm text-fg2 coarse:min-h-11 coarse:items-center">
        <input
          id={`${id}-contact`}
          type="checkbox"
          checked={showContact}
          onChange={(e) => setShowContact(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-accent coarse:mt-0"
        />
        <span>Show my full phone and email on the invoice</span>
      </label>

      <div aria-live="polite" role="status" className="text-xs">
        {busy && (
          <p className="flex items-center gap-1.5 text-fg3">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Preparing…
          </p>
        )}
        {phase.kind === 'done' && <p className="text-fg2">{phase.message}</p>}
      </div>
      {phase.kind === 'error' && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">
          {phase.message}
        </p>
      )}
    </div>
  );
}
