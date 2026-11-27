import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Loader2, RotateCcw } from 'lucide-react';
import {
  confirmCardPayment,
  fromCents,
  getInvoiceBalance,
  getPaymentSettings,
  listInvoicePayments,
  MANUAL_METHODS,
  METHOD_LABEL,
  newRequestId,
  NOT_CONNECTED,
  paymentErrorMessage,
  reconcileCardPayment,
  recordManualPayment,
  recordManualRefund,
  refundCardPayment,
  retryPendingConfirms,
  startCardPayment,
  subscribePayments,
  toCents,
} from '@/api/payments';
import type { InvoiceBalance, ManualMethod, Payment, PaymentSettings, PaymentState } from '@/api/payments';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Dialog, ErrorNote, inputClass, Labeled } from '@/pages/inventory/PartForm';
import { formatCurrency } from '@/lib/format';
import { payWithHelcim } from './helcimPay';
import { PaymentStatusBadge } from './PaymentStatusBadge';

export interface PaymentPanelInvoice {
  id: string;
  number: string;
  status: 'issued' | 'void';
  total: number;
}

interface Props {
  invoice: PaymentPanelInvoice;
  /** Called after any payment or refund is recorded, with the invoice's new balance. */
  onChange?: (state: PaymentState) => void;
  /** The workshop's time zone for dates (defaults to the browser's). */
  tz?: string;
}

const dateTime = new Map<string, Intl.DateTimeFormat>();
function formatWhen(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const key = tz ?? '';
  let f = dateTime.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    dateTime.set(key, f);
  }
  return f.format(d);
}

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A picked day as a moment: now for today, else noon that day in this browser's time. */
function receivedAtFromInput(day: string): string | null {
  if (!day || day === todayInput()) return null;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

function cardLabel(p: Payment): string {
  const brand = p.card_brand ?? '';
  const last4 = p.card_last4 ? `ending ${p.card_last4}` : '';
  return [brand, last4].filter(Boolean).join(' ');
}

/**
 * Payments on one invoice, for the repair order's Invoice card: balance and status, every payment and refund, and the
 * actions Take card payment (Helcim), Record payment (cash, cheque, ...) and Refund. The database decides every
 * amount; buttons only open the right flow. Every action is disabled with its reason when Helcim is not connected or
 * the user may not take payments.
 */
export function PaymentPanel({ invoice, onChange, tz }: Props) {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const mayTakePayments = can('invoices', 'full') || can('repair-orders', 'full');
  const [settings, setSettings] = useState<PaymentSettings>(NOT_CONNECTED);
  const [balance, setBalance] = useState<InvoiceBalance | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState<'starting' | 'paying' | 'confirming' | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'record' } | { kind: 'card' } | { kind: 'refund'; payment: Payment }>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, list] = await Promise.all([getInvoiceBalance(invoice.id), listInvoicePayments(invoice.id)]);
      setBalance(b);
      setPayments(list);
      setLoadError(null);
    } catch (e) {
      setLoadError(paymentErrorMessage(e, 'The payments could not be loaded.'));
    }
  }, [invoice.id]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribePayments({ invoiceId: invoice.id }, () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 300);
    });
    return () => {
      unsubscribe();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [invoice.id, invoice.total, invoice.status, load]);

  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getPaymentSettings(workshopId)
      .then((s) => active && setSettings(s))
      .catch(() => undefined);
    // A card payment confirmed in an earlier visit whose answer never came: send it again.
    void retryPendingConfirms().then((n) => n > 0 && active && void load());
    return () => {
      active = false;
    };
  }, [workshopId, load]);

  const changed = useCallback(
    (state: PaymentState, message: string) => {
      setNotice(message);
      setError(null);
      onChange?.(state);
      void load();
    },
    [load, onChange],
  );

  const refundable = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments ?? []) if (p.kind === 'payment' && p.status === 'succeeded') map.set(p.id, toCents(p.amount.toFixed(2)));
    for (const r of payments ?? []) {
      if (r.kind === 'refund' && r.refund_of && r.status !== 'failed' && map.has(r.refund_of)) {
        map.set(r.refund_of, (map.get(r.refund_of) ?? 0) - toCents(r.amount.toFixed(2)));
      }
    }
    return map;
  }, [payments]);

  const owed = balance?.balance ?? invoice.total;
  const isVoid = invoice.status === 'void';

  const cardReason = !mayTakePayments
    ? 'You need full access to Invoices or Repair Orders to take payments.'
    : !settings.connected
      ? 'Connect Helcim in Settings > Payments to take card payments.'
      : isVoid
        ? 'This invoice is void.'
        : owed <= 0
          ? 'Nothing is owed on this invoice.'
          : null;
  const recordReason = !mayTakePayments
    ? 'You need full access to Invoices or Repair Orders to record payments.'
    : isVoid
      ? 'This invoice is void.'
      : owed <= 0
        ? 'Nothing is owed on this invoice.'
        : null;

  async function takeCard(amount: number | null) {
    if (cardBusy) return;
    setDialog(null);
    setError(null);
    setNotice(null);
    setCardBusy('starting');
    try {
      const started = await startCardPayment(invoice.id, amount);
      setCardBusy('paying');
      const outcome = await payWithHelcim(started.checkoutToken);
      if (outcome.kind === 'closed') {
        setNotice(outcome.declined ? 'The card was declined. Nothing was charged.' : 'The payment window was closed. Nothing was charged.');
        return;
      }
      setCardBusy('confirming');
      const state = await confirmCardPayment(started.checkout_id, outcome.response);
      changed(state, `Card payment of ${formatCurrency(started.amount)} recorded.`);
    } catch (e) {
      setError(paymentErrorMessage(e, 'The card payment could not be completed.'));
      void load();
    } finally {
      setCardBusy(null);
    }
  }

  const list = payments ?? [];
  const refundsOf = (id: string) => list.filter((r) => r.kind === 'refund' && r.refund_of === id);

  return (
    <div className="space-y-3 rounded-xl glass-field p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-fg2">Balance</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-semibold tabular-nums text-fg">{balance ? formatCurrency(Math.max(owed, 0)) : '...'}</span>
            {balance && <PaymentStatusBadge status={balance.payment_status} />}
          </div>
          {balance && balance.amount_paid !== 0 && (
            <div className="text-[11px] text-fg3">
              Paid {formatCurrency(balance.amount_paid)} of {formatCurrency(balance.total)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setDialog({ kind: 'card' })}
            disabled={!!cardReason || !!cardBusy}
            title={cardReason ?? undefined}
            aria-describedby={cardReason ? `${invoice.id}-card-reason` : undefined}
          >
            {cardBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <CreditCard className="h-3.5 w-3.5" aria-hidden />}
            {cardBusy === 'starting' ? 'Starting...' : cardBusy === 'paying' ? 'Waiting for card...' : cardBusy === 'confirming' ? 'Checking with Helcim...' : 'Take card payment'}
          </Button>
          <Button variant="ghost" onClick={() => setDialog({ kind: 'record' })} disabled={!!recordReason || !!cardBusy} title={recordReason ?? undefined}>
            <Banknote className="h-3.5 w-3.5" aria-hidden />
            Record payment
          </Button>
        </div>
      </div>

      {(cardReason || recordReason) && balance && (
        <p id={`${invoice.id}-card-reason`} className="text-[11px] text-fg3">
          {cardReason === recordReason ? cardReason : [cardReason, recordReason].filter(Boolean).join(' ')}
        </p>
      )}
      {balance && balance.balance < 0 && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          More was paid than is owed: a credit of {formatCurrency(-balance.balance)}. Refund the difference to the customer.
        </p>
      )}

      <div aria-live="polite" className="text-xs text-ok">
        {notice}
      </div>
      <ErrorNote errors={error} />
      {loadError && (
        <div className="space-y-2">
          <ErrorNote errors={loadError} />
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {payments && payments.length === 0 && <p className="text-xs text-fg3">No payments yet.</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-xl glass-field">
          {list
            .filter((p) => p.kind === 'payment' || !p.refund_of || !list.some((x) => x.id === p.refund_of))
            .map((p) => (
              <PaymentLine
                key={p.id}
                payment={p}
                refunds={refundsOf(p.id)}
                tz={tz}
                refundableCents={refundable.get(p.id) ?? 0}
                refundReason={
                  !mayTakePayments
                    ? 'You need full access to Invoices or Repair Orders to refund.'
                    : p.provider === 'helcim' && !settings.connected
                      ? 'Connect Helcim in Settings > Payments to refund card payments.'
                      : null
                }
                onRefund={() => setDialog({ kind: 'refund', payment: p })}
              />
            ))}
        </ul>
      )}

      {mayTakePayments && settings.connected && <ReconcileCard invoiceId={invoice.id} onDone={changed} />}

      {dialog?.kind === 'record' && (
        <RecordPaymentDialog invoice={invoice} balance={owed} onClose={() => setDialog(null)} onDone={(s, m) => { setDialog(null); changed(s, m); }} />
      )}
      {dialog?.kind === 'card' && (
        <CardAmountDialog invoiceNumber={invoice.number} balance={owed} onClose={() => setDialog(null)} onStart={(amount) => void takeCard(amount)} />
      )}
      {dialog?.kind === 'refund' && (
        <RefundDialog
          payment={dialog.payment}
          refundableCents={refundable.get(dialog.payment.id) ?? 0}
          pending={refundsOf(dialog.payment.id).find((r) => r.status === 'pending') ?? null}
          onClose={() => setDialog(null)}
          onDone={(s, m) => {
            setDialog(null);
            changed(s, m);
          }}
          onFailed={() => void load()}
        />
      )}
    </div>
  );
}

function PaymentLine({
  payment: p,
  refunds,
  tz,
  refundableCents,
  refundReason,
  onRefund,
}: {
  payment: Payment;
  refunds: Payment[];
  tz?: string;
  refundableCents: number;
  refundReason: string | null;
  onRefund: () => void;
}) {
  const isRefund = p.kind === 'refund';
  const who = p.recorded_by_name ?? (p.method === 'card_online' ? 'Customer, online' : null);
  const canRefund = !isRefund && p.status === 'succeeded' && refundableCents > 0;
  return (
    <li className="space-y-1.5 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-medium text-fg">
            <span>{isRefund ? 'Refund' : METHOD_LABEL[p.method]}</span>
            {p.provider === 'helcim' && cardLabel(p) && <span className="text-fg2">{cardLabel(p)}</span>}
            {p.status === 'pending' && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">Processing</span>}
            {p.status === 'failed' && <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-semibold text-bad">Failed</span>}
          </div>
          <div className="text-[11px] text-fg3">
            <time dateTime={p.received_at}>{formatWhen(p.received_at, tz)}</time>
            {who && <> · {who}</>}
            {p.provider_transaction_id && <> · Helcim {p.provider_transaction_id}</>}
          </div>
          {p.note && <div className="text-[11px] text-fg2">{p.note}</div>}
          {p.failure_reason && p.status === 'failed' && <div className="text-[11px] text-bad">{p.failure_reason}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-semibold tabular-nums ${isRefund ? 'text-bad' : 'text-fg'} ${p.status === 'failed' ? 'line-through opacity-60' : ''}`}>
            {isRefund ? '-' : ''}
            {formatCurrency(p.amount)}
          </span>
          {canRefund && (
            <Button variant="ghost" size="sm" onClick={onRefund} disabled={!!refundReason} title={refundReason ?? undefined}>
              <RotateCcw className="h-3 w-3" aria-hidden />
              {p.provider === 'helcim' ? 'Refund to card' : 'Refund'}
            </Button>
          )}
        </div>
      </div>
      {refunds.length > 0 && (
        <ul className="space-y-1 border-l-2 border-line pl-3">
          {refunds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-fg2">
                Refund · <time dateTime={r.received_at}>{formatWhen(r.received_at, tz)}</time>
                {r.recorded_by_name && <> · {r.recorded_by_name}</>}
                {r.status === 'pending' && <span className="ml-1 font-semibold text-warn">Processing: press Refund to card again with the same amount to finish</span>}
                {r.status === 'failed' && <span className="ml-1 font-semibold text-bad">Failed{r.failure_reason ? `: ${r.failure_reason}` : ''}</span>}
                {r.note && <> · {r.note}</>}
              </span>
              <span className={`tabular-nums ${r.status === 'failed' ? 'text-fg3 line-through' : 'text-bad'}`}>-{formatCurrency(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** An amount field in dollars; returns cents (NaN when not valid). */
function useAmount(initial: number) {
  const [value, setValue] = useState(initial > 0 ? initial.toFixed(2) : '');
  return { value, setValue, cents: toCents(value) };
}

function RecordPaymentDialog({
  invoice,
  balance,
  onClose,
  onDone,
}: {
  invoice: PaymentPanelInvoice;
  balance: number;
  onClose: () => void;
  onDone: (s: PaymentState, message: string) => void;
}) {
  const id = useId();
  const amount = useAmount(balance);
  const [method, setMethod] = useState<ManualMethod>('cash');
  const [day, setDay] = useState(todayInput());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request id per dialog: pressing Save again after a lost answer records once.
  const requestId = useRef(newRequestId());
  const maxCents = toCents(Math.max(balance, 0).toFixed(2));

  const problem = !Number.isFinite(amount.cents) || amount.cents <= 0
    ? 'Enter the amount received, for example 120.00.'
    : amount.cents > maxCents
      ? `That is more than the balance of ${formatCurrency(balance)}.`
      : !day || day > todayInput()
        ? 'The date received cannot be in the future.'
        : null;

  async function save() {
    if (busy || problem) return;
    setBusy(true);
    setError(null);
    try {
      const value = fromCents(amount.cents);
      const state = await recordManualPayment({ invoiceId: invoice.id, amount: value, method, note, receivedAt: receivedAtFromInput(day), requestId: requestId.current });
      onDone(state, `${METHOD_LABEL[method]} payment of ${formatCurrency(value)} recorded.`);
    } catch (e) {
      setError(paymentErrorMessage(e, 'The payment could not be recorded.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={`Record payment on invoice ${invoice.number}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !!problem}>
            {busy ? 'Recording...' : 'Record payment'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="text-xs text-fg2">For money taken at the shop. Card payments in Helcim's window are recorded automatically.</p>
        <Labeled id={`${id}-method`} label="How did they pay?">
          <select id={`${id}-method`} className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)}>
            {MANUAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled id={`${id}-amount`} label="Amount (CAD)" hint={`Balance ${formatCurrency(balance)}`}>
          <input id={`${id}-amount`} className={inputClass} inputMode="decimal" autoComplete="off" value={amount.value} onChange={(e) => amount.setValue(e.target.value)} data-autofocus />
        </Labeled>
        <Labeled id={`${id}-day`} label="Date received">
          <input id={`${id}-day`} type="date" className={inputClass} value={day} max={todayInput()} onChange={(e) => setDay(e.target.value)} />
        </Labeled>
        <Labeled id={`${id}-note`} label="Note (optional)" hint="For example the cheque number.">
          <input id={`${id}-note`} className={inputClass} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Labeled>
        {problem && amount.value !== '' && <p className="text-[11px] text-warn">{problem}</p>}
        <ErrorNote errors={error} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

function CardAmountDialog({
  invoiceNumber,
  balance,
  onClose,
  onStart,
}: {
  invoiceNumber: string;
  balance: number;
  onClose: () => void;
  onStart: (amount: number | null) => void;
}) {
  const id = useId();
  const amount = useAmount(balance);
  const balanceCents = toCents(Math.max(balance, 0).toFixed(2));
  const problem =
    !Number.isFinite(amount.cents) || amount.cents <= 0
      ? 'Enter the amount to charge.'
      : amount.cents > balanceCents
        ? `That is more than the balance of ${formatCurrency(balance)}.`
        : null;
  return (
    <Dialog
      open
      title={`Card payment for invoice ${invoiceNumber}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onStart(amount.cents === balanceCents ? null : fromCents(amount.cents))} disabled={!!problem}>
            <CreditCard className="h-3.5 w-3.5" aria-hidden />
            Open Helcim
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-fg2">
          Helcim's secure window opens. The customer (or you, with the customer's card) types the card there; EuroWerken never sees the card number.
        </p>
        <Labeled id={`${id}-amount`} label="Amount to charge (CAD)" hint={`Balance ${formatCurrency(balance)}. Charge less to take part of it now.`}>
          <input id={`${id}-amount`} className={inputClass} inputMode="decimal" autoComplete="off" value={amount.value} onChange={(e) => amount.setValue(e.target.value)} data-autofocus />
        </Labeled>
        {problem && amount.value !== '' && <p className="text-[11px] text-warn">{problem}</p>}
      </div>
    </Dialog>
  );
}

function RefundDialog({
  payment,
  refundableCents,
  pending,
  onClose,
  onDone,
  onFailed,
}: {
  payment: Payment;
  refundableCents: number;
  pending: Payment | null;
  onClose: () => void;
  onDone: (s: PaymentState, message: string) => void;
  onFailed: () => void;
}) {
  const id = useId();
  const card = payment.provider === 'helcim';
  // A refund still processing must be finished with the same amount (the same Helcim request).
  const amount = useAmount(pending ? pending.amount : fromCents(refundableCents));
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  const limit = pending ? toCents(pending.amount.toFixed(2)) : refundableCents;
  const problem =
    !Number.isFinite(amount.cents) || amount.cents <= 0
      ? 'Enter the amount to refund.'
      : pending && amount.cents !== limit
        ? `A refund of ${formatCurrency(pending.amount)} is still processing. Finish it with that amount first.`
        : amount.cents > limit
          ? `At most ${formatCurrency(fromCents(limit))} can be refunded on this payment.`
          : null;
  const value = Number.isFinite(amount.cents) ? fromCents(amount.cents) : 0;

  async function run() {
    if (busy || problem) return;
    setBusy(true);
    setError(null);
    try {
      const state = card ? await refundCardPayment(payment.id, value, note) : await recordManualRefund(payment.id, value, note, requestId.current);
      onDone(state, card ? `Refund of ${formatCurrency(value)} sent to the card.` : `Refund of ${formatCurrency(value)} recorded.`);
    } catch (e) {
      setError(paymentErrorMessage(e, 'The refund could not be completed.'));
      setConfirming(false);
      onFailed();
    } finally {
      setBusy(false);
    }
  }

  const where = card ? `back to the ${cardLabel(payment) || 'card'} through Helcim` : `as ${METHOD_LABEL[payment.method].toLowerCase()}`;

  return (
    <Dialog
      open
      title={card ? 'Refund to card' : 'Record a refund'}
      onClose={onClose}
      role={confirming ? 'alertdialog' : 'dialog'}
      size="sm"
      footer={
        confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy} data-autofocus>
              Go back
            </Button>
            <Button onClick={() => void run()} disabled={busy} className="!bg-bad">
              {busy ? 'Refunding...' : `Refund ${formatCurrency(value)}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!!problem}>
              Continue
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3 text-xs text-fg2">
        <p>
          {METHOD_LABEL[payment.method]} payment of {formatCurrency(payment.amount)}. Up to {formatCurrency(fromCents(refundableCents))} can be refunded.
        </p>
        {!confirming && (
          <>
            <Labeled id={`${id}-amount`} label="Amount to refund (CAD)">
              <input id={`${id}-amount`} className={inputClass} inputMode="decimal" autoComplete="off" value={amount.value} onChange={(e) => amount.setValue(e.target.value)} disabled={!!pending} data-autofocus />
            </Labeled>
            <Labeled id={`${id}-note`} label="Reason (optional)">
              <input id={`${id}-note`} className={inputClass} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Labeled>
            {problem && amount.value !== '' && <p className="text-[11px] text-warn">{problem}</p>}
          </>
        )}
        {confirming && (
          <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-bad">
            {card
              ? `Refund ${formatCurrency(value)} ${where}? Helcim sends the money back to the customer's card. This cannot be undone.`
              : `Record that you gave ${formatCurrency(value)} back ${where}? Give the money back first. A recorded refund cannot be removed.`}
          </p>
        )}
        <ErrorNote errors={error} />
      </div>
    </Dialog>
  );
}

/** A card payment that went through at Helcim but never showed here (for example the browser closed right after). */
function ReconcileCard({ invoiceId, onDone }: { invoiceId: string; onDone: (s: PaymentState, message: string) => void }) {
  const id = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d{1,20}$/.test(value.trim());

  async function run() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const state = await reconcileCardPayment(invoiceId, value);
      setValue('');
      onDone(state, 'The Helcim payment is recorded.');
    } catch (e) {
      setError(paymentErrorMessage(e, 'The payment could not be checked.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-fg2 hover:text-fg coarse:min-h-11 coarse:py-3">Card paid but not showing?</summary>
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-fg3">
          Enter the transaction number from Helcim (Card Transactions). It is checked with Helcim and recorded only if it is an approved payment of exactly the amount started here for this invoice.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Labeled id={`${id}-txn`} label="Helcim transaction number">
              <input id={`${id}-txn`} className={inputClass} inputMode="numeric" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
            </Labeled>
          </div>
          <Button variant="ghost" onClick={() => void run()} disabled={!valid || busy}>
            {busy ? 'Checking...' : 'Check and record'}
          </Button>
        </div>
        <ErrorNote errors={error} />
      </div>
    </details>
  );
}
