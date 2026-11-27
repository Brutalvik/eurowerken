/**
 * Payments (migration 030 and the payments Edge Function).
 *
 * Every amount is decided and checked by the database: balances (invoices.amount_paid, balance, payment_status) are
 * kept by triggers from the payments table, manual payments can never exceed the balance, card payments are recorded
 * only after the server has verified them with Helcim. Nothing here writes a table directly: only database functions
 * (record_manual_payment, record_manual_refund, set_helcim_token, ...) and the Edge Function change money.
 * Manual requests carry a request id, so a double click or a retry records once.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { forgetPendingConfirm, pendingConfirms, rememberPendingConfirm } from '@/components/payments/helcimPay';

// Types -------------------------------------------------------------------------------------------------------------

export type PaymentKind = 'payment' | 'refund';
export type PaymentMethod = 'card_online' | 'card_present' | 'debit' | 'cash' | 'cheque' | 'etransfer' | 'other';
export type ManualMethod = Exclude<PaymentMethod, 'card_online'>;
export type PaymentRowStatus = 'succeeded' | 'pending' | 'failed';
export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export interface Payment {
  id: string;
  invoice_id: string;
  repair_order_id: string | null;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  status: PaymentRowStatus;
  provider: 'helcim' | null;
  provider_transaction_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  refund_of: string | null;
  note: string | null;
  failure_reason: string | null;
  received_at: string;
  recorded_by: string | null;
  customer_id: string | null;
  created_at: string;
  /** The staff member's name (or email), when it can be read. */
  recorded_by_name: string | null;
}

export interface InvoiceBalance {
  id: string;
  total: number;
  amount_paid: number;
  /** Negative when more was paid than is owed (a credit to refund). */
  balance: number;
  payment_status: InvoicePaymentStatus;
}

export interface PaymentSettings {
  connected: boolean;
  token_hint: string | null;
  online_payments_enabled: boolean;
  connected_at: string | null;
}

export const NOT_CONNECTED: PaymentSettings = { connected: false, token_hint: null, online_payments_enabled: true, connected_at: null };

export interface PaymentState {
  invoice_id: string;
  amount_paid: number;
  balance: number;
  payment_status: InvoicePaymentStatus;
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  card_online: 'Card (Helcim)',
  card_present: 'Card on terminal',
  debit: 'Debit',
  cash: 'Cash',
  cheque: 'Cheque',
  etransfer: 'E-transfer',
  other: 'Other',
};

export const MANUAL_METHODS: ManualMethod[] = ['cash', 'debit', 'card_present', 'cheque', 'etransfer', 'other'];

export const PAYMENT_STATUS_LABEL: Record<InvoicePaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
  refunded: 'Refunded',
};

/** Helcim's published pricing (interchange plus), linked from Settings. */
export const HELCIM_PRICING_URL = 'https://www.helcim.com/pricing/';

// Errors ------------------------------------------------------------------------------------------------------------

export const PAYMENTS_SETUP_MESSAGE = 'The database is not set up for payments yet. Apply migration 030 (npm run db:migrate).';

interface DbError {
  message: string;
  code?: string;
}

function setupError(err: DbError | Error): Error {
  const message = err.message;
  const code = 'code' in err ? err.code : undefined;
  if (code === 'P0001') return new Error(message);
  if (
    code === '42P01' ||
    code === '42703' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    /(payments|workshop_payment_settings|amount_paid|payment_status|record_manual_payment|record_manual_refund|set_helcim_token|disconnect_helcim|set_online_payments).*(does not exist|not find|schema cache)/i.test(
      message,
    )
  ) {
    return new Error(PAYMENTS_SETUP_MESSAGE);
  }
  if (/failed to fetch|network|load failed/i.test(message)) return new Error('Could not reach the server. Check your connection and try again.');
  return new Error(message);
}

export function paymentErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Shaping -----------------------------------------------------------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

const STATUSES: InvoicePaymentStatus[] = ['unpaid', 'partial', 'paid', 'refunded'];

function paymentStatus(v: unknown): InvoicePaymentStatus {
  return STATUSES.includes(v as InvoicePaymentStatus) ? (v as InvoicePaymentStatus) : 'unpaid';
}

function toState(row: Record<string, unknown>): PaymentState {
  return {
    invoice_id: String(row.invoice_id ?? ''),
    amount_paid: num(row.amount_paid),
    balance: num(row.balance),
    payment_status: paymentStatus(row.payment_status),
  };
}

/** Dollars as whole cents: 12.3 -> 1230. NaN for anything that is not a plain amount with at most 2 decimals. */
export function toCents(input: string | number): number {
  const s = String(input).trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export function fromCents(c: number): number {
  return Math.round(c) / 100;
}

// Reading -----------------------------------------------------------------------------------------------------------

const PAYMENT_COLUMNS =
  'id, invoice_id, repair_order_id, kind, amount, method, status, provider, provider_transaction_id, card_brand, card_last4, refund_of, note, failure_reason, received_at, recorded_by, customer_id, created_at';

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique);
  for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    map.set(p.id, p.full_name?.trim() || p.email || 'Staff');
  }
  return map;
}

/** The payments and refunds of one invoice, oldest first. */
export async function listInvoicePayments(invoiceId: string): Promise<Payment[]> {
  const { data, error } = await supabase.from('payments').select(PAYMENT_COLUMNS).eq('invoice_id', invoiceId).order('created_at', { ascending: true });
  if (error) throw setupError(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await namesOf(rows.map((r) => String(r.recorded_by ?? '')));
  return rows.map((r) => ({
    id: String(r.id),
    invoice_id: String(r.invoice_id),
    repair_order_id: text(r.repair_order_id),
    kind: r.kind === 'refund' ? 'refund' : 'payment',
    amount: num(r.amount),
    method: (r.method as PaymentMethod) ?? 'other',
    status: r.status === 'pending' || r.status === 'failed' ? r.status : 'succeeded',
    provider: r.provider === 'helcim' ? 'helcim' : null,
    provider_transaction_id: text(r.provider_transaction_id),
    card_brand: text(r.card_brand),
    card_last4: text(r.card_last4),
    refund_of: text(r.refund_of),
    note: text(r.note),
    failure_reason: text(r.failure_reason),
    received_at: String(r.received_at ?? ''),
    recorded_by: text(r.recorded_by),
    customer_id: text(r.customer_id),
    created_at: String(r.created_at ?? ''),
    recorded_by_name: r.recorded_by ? names.get(String(r.recorded_by)) ?? null : null,
  }));
}

function toBalance(r: Record<string, unknown>): InvoiceBalance {
  return {
    id: String(r.id),
    total: num(r.total),
    amount_paid: num(r.amount_paid),
    balance: num(r.balance),
    payment_status: paymentStatus(r.payment_status),
  };
}

export async function getInvoiceBalance(invoiceId: string): Promise<InvoiceBalance | null> {
  const { data, error } = await supabase.from('invoices').select('id, total, amount_paid, balance, payment_status').eq('id', invoiceId).maybeSingle();
  if (error) throw setupError(error);
  return data ? toBalance(data as Record<string, unknown>) : null;
}

/** Balances of every invoice of the workshop, by invoice id. */
export async function listInvoiceBalances(workshopId: string): Promise<Map<string, InvoiceBalance>> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, total, amount_paid, balance, payment_status')
    .eq('workshop_id', workshopId)
    .order('issued_at', { ascending: false })
    .limit(2000);
  if (error) throw setupError(error);
  const map = new Map<string, InvoiceBalance>();
  for (const r of (data ?? []) as Record<string, unknown>[]) map.set(String(r.id), toBalance(r));
  return map;
}

export interface MoneyMovement {
  kind: PaymentKind;
  amount: number;
  received_at: string;
}

/** Succeeded payments and refunds received since a moment (for Paid this month). */
export async function listMoneySince(workshopId: string, sinceIso: string): Promise<MoneyMovement[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('kind, amount, received_at')
    .eq('workshop_id', workshopId)
    .eq('status', 'succeeded')
    .gte('received_at', sinceIso)
    .limit(10000);
  if (error) throw setupError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    kind: r.kind === 'refund' ? 'refund' : 'payment',
    amount: num(r.amount),
    received_at: String(r.received_at ?? ''),
  }));
}

export async function getPaymentSettings(workshopId: string): Promise<PaymentSettings> {
  const { data, error } = await supabase
    .from('workshop_payment_settings')
    .select('enabled, token_hint, online_payments_enabled, connected_at')
    .eq('workshop_id', workshopId)
    .maybeSingle();
  if (error) throw setupError(error);
  const r = data as Record<string, unknown> | null;
  if (!r) return { ...NOT_CONNECTED };
  return {
    connected: r.enabled === true,
    token_hint: text(r.token_hint),
    online_payments_enabled: r.online_payments_enabled !== false,
    connected_at: text(r.connected_at),
  };
}

/** Live changes to payments (of one invoice, or of the whole workshop). Returns the unsubscribe function. */
export function subscribePayments(filter: { invoiceId: string } | { workshopId: string }, onChange: () => void): () => void {
  const f = 'invoiceId' in filter ? `invoice_id=eq.${filter.invoiceId}` : `workshop_id=eq.${filter.workshopId}`;
  const channel = supabase
    .channel(`payments:${f}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: f }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// Manual payments ---------------------------------------------------------------------------------------------------

export interface ManualPaymentInput {
  invoiceId: string;
  amount: number;
  method: ManualMethod;
  note: string;
  receivedAt: string | null;
  /** Same id for retries of the same request: the payment is recorded once. */
  requestId: string;
}

export async function recordManualPayment(input: ManualPaymentInput): Promise<PaymentState> {
  const { data, error } = await supabase.rpc('record_manual_payment', {
    p_invoice: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_note: input.note.trim() || null,
    p_received_at: input.receivedAt,
    p_request_id: input.requestId,
  });
  if (error) throw setupError(error);
  return toState(data as Record<string, unknown>);
}

export async function recordManualRefund(paymentId: string, amount: number, note: string, requestId: string): Promise<PaymentState> {
  const { data, error } = await supabase.rpc('record_manual_refund', {
    p_payment: paymentId,
    p_amount: amount,
    p_note: note.trim() || null,
    p_request_id: requestId,
  });
  if (error) throw setupError(error);
  return toState(data as Record<string, unknown>);
}

// Settings ----------------------------------------------------------------------------------------------------------

export async function connectHelcim(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_helcim_token', { p_token: token });
  if (error) throw setupError(error);
  return String((data as { token_hint?: string } | null)?.token_hint ?? '');
}

export async function disconnectHelcim(): Promise<void> {
  const { error } = await supabase.rpc('disconnect_helcim');
  if (error) throw setupError(error);
}

export async function setOnlinePayments(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_online_payments', { p_enabled: enabled });
  if (error) throw setupError(error);
}

// The payments Edge Function ----------------------------------------------------------------------------------------

export const FUNCTION_MISSING =
  'The payments service is not deployed yet. Deploy the payments Edge Function (supabase/functions/payments/README.md).';

/** Calls the payments Edge Function as the signed-in user. Throws with the function's own message. */
async function callPayments<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('payments', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let message = '';
      try {
        const j = (await res.json()) as { error?: string };
        message = j.error ?? '';
      } catch {
        message = '';
      }
      if (res.status === 404 && !message) throw new Error(FUNCTION_MISSING);
      throw new Error(message || `The payments service answered with status ${res.status}.`);
    }
    if (/failed to send|fetch/i.test(error.message)) {
      throw new Error('Could not reach the payments service. Check your connection; if it keeps failing, the payments Edge Function may not be deployed or this address is not in ALLOWED_ORIGINS.');
    }
    throw new Error(error.message);
  }
  return data as T;
}

export interface StartedCheckout {
  checkout_id: string;
  checkoutToken: string;
  amount: number;
}

/** Opens a Helcim checkout for the invoice balance (or a smaller amount). */
export function startCardPayment(invoiceId: string, amount: number | null): Promise<StartedCheckout> {
  return callPayments<StartedCheckout>({ action: 'start', invoice_id: invoiceId, amount });
}

/**
 * Sends Helcim's response to the server, which verifies and records it. The response is kept in this browser until
 * the server has answered, and sent again by retryPendingConfirms if the answer never came.
 */
export async function confirmCardPayment(checkoutId: string, response: unknown): Promise<PaymentState> {
  rememberPendingConfirm(checkoutId, response);
  try {
    const out = await callPayments<Record<string, unknown>>({ action: 'confirm', checkout_id: checkoutId, helcim_response: response });
    forgetPendingConfirm(checkoutId);
    return toState(out);
  } catch (e) {
    // A clear "no" from the server is final; only a lost connection is worth sending again.
    if (!(e instanceof Error && /reach|connection/i.test(e.message))) forgetPendingConfirm(checkoutId);
    throw e;
  }
}

/** Sends confirmations this browser kept from an earlier visit. Quiet: errors are dropped. */
export async function retryPendingConfirms(): Promise<number> {
  let done = 0;
  for (const p of pendingConfirms()) {
    try {
      await confirmCardPayment(p.checkout_id, p.response);
      done++;
    } catch {
      // Kept (connection) or dropped (refused) by confirmCardPayment.
    }
  }
  return done;
}

/** Records an approved Helcim transaction of this invoice that never got confirmed (by its Helcim number). */
export async function reconcileCardPayment(invoiceId: string, transactionId: string): Promise<PaymentState> {
  const out = await callPayments<Record<string, unknown>>({ action: 'reconcile', invoice_id: invoiceId, transaction_id: transactionId.trim() });
  return toState(out);
}

/** Refunds a Helcim card payment back to the card. */
export async function refundCardPayment(paymentId: string, amount: number, note: string): Promise<PaymentState> {
  const out = await callPayments<Record<string, unknown>>({ action: 'refund', payment_id: paymentId, amount, note: note.trim() || null });
  return toState(out);
}

export function testHelcimConnection(): Promise<{ ok: boolean; message: string }> {
  return callPayments<{ ok: boolean; message: string }>({ action: 'test' });
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
