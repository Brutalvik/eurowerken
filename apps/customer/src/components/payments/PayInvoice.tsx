import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { confirmPayment, invoicePayInfo, retryPendingPayments, startPayment } from '@/api/payments';
import type { InvoicePayInfo, PaySource } from '@/api/payments';
import { formatMoney } from '@/lib/format';
import { payWithHelcim } from './helcimPay';

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; step: 'starting' | 'paying' | 'confirming' }
  | { kind: 'paid'; amount: number }
  | { kind: 'note'; message: string }
  | { kind: 'error'; message: string };

const BRANDS: Record<string, string> = { card_online: 'card', card_present: 'card', debit: 'debit', cash: 'cash', cheque: 'cheque', etransfer: 'e-transfer' };

function receiptLine(info: InvoicePayInfo): string | null {
  const p = info.last_payment;
  if (!p) return null;
  const how = p.card_brand || p.card_last4 ? [p.card_brand, p.card_last4 ? `ending ${p.card_last4}` : ''].filter(Boolean).join(' ') : BRANDS[p.method] ?? 'payment';
  const d = new Date(p.received_at);
  const when = Number.isNaN(d.getTime()) ? '' : ` on ${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return `${formatMoney(p.amount)} paid by ${how}${when}.`;
}

/**
 * Pay now for one invoice: shows the balance and opens Helcim's secure window, or a Paid badge when it is settled.
 * Renders nothing when the shop does not take payments online or payments are not set up.
 *
 * For a signed-in owner: <PayInvoice source={{ kind: 'owner', invoiceId }} />.
 * For a guest on the tracking page: <PayInvoice source={{ kind: 'guest', slug, code, contact }} />, with the site slug,
 * the tracking code and the email or phone the visitor entered.
 */
export function PayInvoice({ source, compact = false, onPaid }: { source: PaySource; compact?: boolean; onPaid?: () => void }) {
  const [info, setInfo] = useState<InvoicePayInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const busyRef = useRef(false);
  const key = source.kind === 'owner' ? `o:${source.invoiceId}` : `g:${source.slug}:${source.code}:${source.contact}`;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const load = useCallback(async () => {
    const res = await invoicePayInfo(sourceRef.current);
    if (res.error === null) setInfo(res.data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void load();
    // A payment confirmed on an earlier visit whose answer never came: send it again, then reload.
    void retryPendingPayments().then((n) => n > 0 && active && void load());
    return () => {
      active = false;
    };
  }, [key, load]);

  async function pay() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase({ kind: 'busy', step: 'starting' });
    try {
      const started = await startPayment(sourceRef.current);
      setPhase({ kind: 'busy', step: 'paying' });
      const outcome = await payWithHelcim(started.checkoutToken);
      if (outcome.kind === 'closed') {
        setPhase({ kind: 'note', message: outcome.declined ? 'The card was declined. Nothing was charged. Try another card.' : 'Payment cancelled. Nothing was charged.' });
        return;
      }
      setPhase({ kind: 'busy', step: 'confirming' });
      await confirmPayment(started.checkout_id, outcome.response);
      setPhase({ kind: 'paid', amount: started.amount });
      onPaid?.();
      await load();
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error && e.message ? e.message : 'The payment could not be completed.' });
      void load();
    } finally {
      busyRef.current = false;
    }
  }

  if (!loaded || !info) return null;
  const busy = phase.kind === 'busy';
  const settled = info.payment_status === 'paid' && info.balance <= 0;
  const receipt = receiptLine(info);

  if (phase.kind === 'paid' || settled) {
    return (
      <div className={`rounded-xl border border-ok/30 bg-ok/10 ${compact ? 'px-3 py-2' : 'px-4 py-3'} text-sm`} role="status">
        <p className="flex items-center gap-2 font-semibold text-ok">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {phase.kind === 'paid' ? 'Paid, thank you' : 'Paid'}
        </p>
        {receipt && <p className="mt-0.5 text-xs text-fg2">{receipt}</p>}
      </div>
    );
  }

  if (!info.online_payments || info.balance <= 0) {
    if (info.payment_status === 'partial') {
      return <p className="text-xs text-fg2">Balance to pay at {info.shop_name || 'the shop'}: {formatMoney(info.balance)}</p>;
    }
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void pay()}
          disabled={busy}
          className={`btn-ink bg-accent text-accent-fg shadow-accent/20 disabled:opacity-60 ${compact ? 'min-h-11 px-3 py-2 text-sm' : 'min-h-11 px-4 py-2.5'}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
          {busy && phase.step === 'confirming' ? 'Confirming...' : busy && phase.step === 'paying' ? 'Waiting for payment...' : `Pay now ${formatMoney(info.balance)}`}
        </button>
        {info.payment_status === 'partial' && <span className="text-xs text-fg2">{formatMoney(info.amount_paid)} already paid</span>}
      </div>
      <p className="text-[11px] text-fg3">Secure card payment by Helcim. Your card details go only to Helcim.</p>
      <div aria-live="polite" className="text-xs">
        {phase.kind === 'note' && <p className="text-fg2">{phase.message}</p>}
      </div>
      {phase.kind === 'error' && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">
          {phase.message}
        </p>
      )}
    </div>
  );
}
