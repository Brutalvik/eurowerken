/**
 * Paying an invoice online on the customer site (migration 030 and the payments Edge Function).
 *
 * The amount is never decided here: the server charges the invoice balance it computes. Cards are typed only into
 * Helcim's window. Signed-in owners pay their own invoices; guests on the tracking page prove who they are with the
 * tracking code plus the email or phone they booked with (the same check as tracking).
 * When payments are not set up (an older database, the function not deployed), there is simply no Pay now button.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { forgetPendingConfirm, pendingConfirms, rememberPendingConfirm } from '@/components/payments/helcimPay';

export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export interface InvoicePayInfo {
  invoice_id: string;
  number: string;
  total: number;
  amount_paid: number;
  /** What is still owed (never below zero here). */
  balance: number;
  payment_status: InvoicePaymentStatus;
  shop_name: string;
  /** The shop takes card payments online. */
  online_payments: boolean;
  last_payment: { amount: number; received_at: string; method: string; card_brand: string | null; card_last4: string | null } | null;
}

/** Who is paying: the signed-in owner of an invoice, or a guest with their tracking details. */
export type PaySource = { kind: 'owner'; invoiceId: string } | { kind: 'guest'; slug: string; code: string; contact: string };

export interface PayState {
  balance: number;
  amount_paid: number;
  payment_status: InvoicePaymentStatus;
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function status(v: unknown): InvoicePaymentStatus {
  return v === 'partial' || v === 'paid' || v === 'refunded' ? v : 'unpaid';
}

function toInfo(r: Record<string, unknown>): InvoicePayInfo {
  const lp = r.last_payment as Record<string, unknown> | null | undefined;
  return {
    invoice_id: String(r.invoice_id ?? ''),
    number: String(r.number ?? ''),
    total: num(r.total),
    amount_paid: num(r.amount_paid),
    balance: Math.max(0, num(r.balance)),
    payment_status: status(r.payment_status),
    shop_name: String(r.shop_name ?? ''),
    online_payments: r.online_payments === true,
    last_payment: lp
      ? {
          amount: num(lp.amount),
          received_at: String(lp.received_at ?? ''),
          method: String(lp.method ?? ''),
          card_brand: typeof lp.card_brand === 'string' ? lp.card_brand : null,
          card_last4: typeof lp.card_last4 === 'string' ? lp.card_last4 : null,
        }
      : null,
  };
}

/** Not set up yet (older database): no payment info, quietly. */
function quiet(error: { code?: string; message: string }): boolean {
  return error.code === '42883' || error.code === 'PGRST202' || /could not find the function|schema cache|does not exist/i.test(error.message);
}

/** What paying needs for one invoice, or null when there is nothing to show (not set up, or no invoice yet). */
export async function invoicePayInfo(source: PaySource): Promise<Result<InvoicePayInfo | null>> {
  try {
    const { data, error } =
      source.kind === 'owner'
        ? await supabase.rpc('my_invoice_for_payment', { p_invoice: source.invoiceId })
        : await supabase.rpc('invoice_for_payment', { p_slug: source.slug, p_code: source.code, p_contact: source.contact });
    if (error) {
      if (quiet(error)) return { data: null, error: null };
      return { data: null, error: friendlyError(error.message) };
    }
    return { data: data ? toInfo(data as Record<string, unknown>) : null, error: null };
  } catch (e) {
    return { data: null, error: friendlyError(e instanceof Error ? e.message : 'Could not load the invoice.') };
  }
}

async function callPayments<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('payments', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let message = '';
      try {
        message = ((await res.json()) as { error?: string }).error ?? '';
      } catch {
        message = '';
      }
      throw new Error(message || 'Online payment is not available right now. Pay at the shop, or try again later.');
    }
    throw new Error('Could not reach the payment service. Check your connection and try again.');
  }
  return data as T;
}

export interface StartedPayment {
  checkout_id: string;
  checkoutToken: string;
  amount: number;
}

/** Opens a Helcim checkout for the balance the server computes. */
export function startPayment(source: PaySource): Promise<StartedPayment> {
  return callPayments<StartedPayment>(
    source.kind === 'owner'
      ? { action: 'start', invoice_id: source.invoiceId }
      : { action: 'start', slug: source.slug, code: source.code, contact: source.contact },
  );
}

/** Sends Helcim's answer to the server, which verifies it with Helcim and records it once. */
export async function confirmPayment(checkoutId: string, response: unknown): Promise<PayState> {
  rememberPendingConfirm(checkoutId, response);
  try {
    const out = await callPayments<Record<string, unknown>>({ action: 'confirm', checkout_id: checkoutId, helcim_response: response });
    forgetPendingConfirm(checkoutId);
    return { balance: Math.max(0, num(out.balance)), amount_paid: num(out.amount_paid), payment_status: status(out.payment_status) };
  } catch (e) {
    if (!(e instanceof Error && /reach|connection/i.test(e.message))) forgetPendingConfirm(checkoutId);
    throw e;
  }
}

/** Confirmations this browser kept from an earlier visit whose answer never came. Returns how many went through. */
export async function retryPendingPayments(): Promise<number> {
  let n = 0;
  for (const p of pendingConfirms()) {
    try {
      await confirmPayment(p.checkout_id, p.response);
      n++;
    } catch {
      // Kept for later (no connection) or dropped (refused) by confirmPayment.
    }
  }
  return n;
}
