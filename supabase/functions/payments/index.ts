// payments: card payments through Helcim (HelcimPay.js), card refunds, and the connection test (migration 030).
//
// One POST endpoint; the JSON body's "action" picks what to do:
//   start      {invoice_id, amount?}            signed-in staff (Invoices or Repair Orders full; amount may be smaller
//                                               than the balance) or the signed-in customer who owns the invoice
//              {slug, code, contact}           a guest on the tracking page (tracking code plus email or phone)
//              The amount is ALWAYS computed by the database (the balance); the browser never sets it for customers.
//              Returns {checkout_id, checkoutToken}. The secretToken stays in the database (payment_checkouts).
//   confirm    {checkout_id, helcim_response}  validates Helcim's hash with the stored secretToken, re-reads the
//                                               transaction from Helcim (approved, purchase, CAD, the exact amount),
//                                               then records it once. Returns the invoice's new balance and status.
//   reconcile  {invoice_id, transaction_id}    staff (payments full): records an approved Helcim transaction of one of
//                                               this invoice's checkouts when the browser never confirmed it (a closed
//                                               tab). Re-read from Helcim; the amount must match that checkout.
//   refund     {payment_id, amount, note?}     staff (payments full): refunds a card payment through Helcim. A
//                                               pending refund row is written first; its id is the idempotency key,
//                                               so pressing Refund again after a lost reply never refunds twice.
//   test       {}                              staff with Settings full: checks the stored token with Helcim.
//
// Helcim documentation this follows (read 2026-11-27):
//   Initialize:  https://devdocs.helcim.com/docs/initialize-helcimpayjs and https://devdocs.helcim.com/reference/checkout-init
//                POST https://api.helcim.com/v2/helcim-pay/initialize, header api-token, body {paymentType, amount,
//                currency}; response {checkoutToken, secretToken}; tokens valid 60 minutes; server side only.
//   Validate:    https://devdocs.helcim.com/docs/validate-helcimpayjs
//                the response holds {hash, data}; hash = sha256_hex(json_encode(data) + secretToken).
//   Transaction: https://devdocs.helcim.com/reference/getcardtransaction  GET /v2/card-transactions/{cardTransactionId}
//                {transactionId, status APPROVED|DECLINED, type purchase|preauth|verify, amount, currency, cardType,
//                cardNumber (first 6 and last 4), ...}
//   Refund:      https://devdocs.helcim.com/reference/refund  POST /v2/payment/refund, headers api-token and
//                idempotency-key (25-36 characters, letters, digits, - and _), body {originalTransactionId, amount,
//                ipAddress, ecommerce}. Only for transactions in a closed batch.
//   Reverse:     https://devdocs.helcim.com/reference/reverse  POST /v2/payment/reverse {cardTransactionId, ipAddress}
//                (the whole transaction, while its batch is still open).
//   Connection:  https://devdocs.helcim.com/reference/connectiontest  GET /v2/connection-test
//   Token setup: https://devdocs.helcim.com/docs/authentication-with-the-helcim-api-and-helcimpayjs
//
// Secrets (Supabase dashboard > Edge Functions > Secrets; never in the code or the repo):
//   ALLOWED_ORIGINS   comma separated, e.g. https://erp.example.com,https://book.example.com,http://localhost:5174
//   HELCIM_API_BASE   optional, default https://api.helcim.com/v2
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are provided by Supabase.
// Each shop's Helcim API token is in Supabase Vault (Settings > Payments in the ERP), read with get_helcim_token().
//
// Never logged: API tokens, checkout or secret tokens, card data, customer contact details.
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k)?.trim() || '';

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
const HELCIM_API = (env('HELCIM_API_BASE') || 'https://api.helcim.com/v2').replace(/\/+$/, '');
const ALLOWED = env('ALLOWED_ORIGINS')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const HELCIM_TIMEOUT_MS = 25_000;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// HTTP ------------------------------------------------------------------------------------------------------------

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && ALLOWED.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** A database function raised on purpose (plpgsql RAISE): its message is meant for people. */
function rpcError(error: { message: string; code?: string }, fallback: string): HttpError {
  if (error.code === 'P0001') return new HttpError(400, error.message);
  if (/permission denied/i.test(error.message)) return new HttpError(403, 'You do not have access to do that.');
  if (/function .* does not exist|schema cache|PGRST202/i.test(error.message) || error.code === 'PGRST202') {
    return new HttpError(500, 'The database is not set up for payments yet. Apply migration 030.');
  }
  console.error('rpc error', error.code ?? '', error.message.slice(0, 200));
  return new HttpError(500, fallback);
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw rpcError(error, fallback);
  return data as T;
}

// Callers ---------------------------------------------------------------------------------------------------------

interface Caller {
  user: User;
  /** A client that acts as this user: RLS and has_access() apply. */
  db: SupabaseClient;
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const t = m?.[1]?.trim() ?? '';
  if (!t || t === ANON_KEY) return null;
  return t;
}

/** The signed-in user, checked with Supabase Auth; null for guests. An invalid session is an error, not a guest. */
async function getCaller(req: Request): Promise<Caller | null> {
  const token = bearer(req);
  if (!token) return null;
  // Publishable keys (sb_publishable_...) are not user sessions.
  if (token.startsWith('sb_')) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    // The anon key (a JWT with role anon) is not a user either.
    if (isAnonJwt(token)) return null;
    throw new HttpError(401, 'Your session has ended. Sign in again.');
  }
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { user: data.user, db };
}

function isAnonJwt(token: string): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'anon' && !payload?.sub;
  } catch {
    return false;
  }
}

function requireCaller(c: Caller | null): Caller {
  if (!c) throw new HttpError(401, 'Sign in first.');
  return c;
}

interface StaffCheck {
  workshop_id: string;
  invoice_id: string | null;
  user_id: string;
  payments_full: boolean;
  settings_full: boolean;
}

function clientIp(req: Request): string {
  const raw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || '';
  return /^[0-9a-fA-F:.]{3,45}$/.test(raw) ? raw : '127.0.0.1';
}

// Money -----------------------------------------------------------------------------------------------------------

/** Whole cents of a dollar amount (number or numeric string); NaN when it is not a finite amount. */
function cents(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

function dollars(c: number): number {
  return Math.round(c) / 100;
}

const CARD_TYPES: Record<string, string> = {
  VI: 'Visa',
  MC: 'Mastercard',
  AX: 'American Express',
  AM: 'American Express',
  DI: 'Discover',
  DS: 'Discover',
  JC: 'JCB',
  DC: 'Diners Club',
  UP: 'UnionPay',
};

function cardBrand(t: unknown): string | null {
  if (typeof t !== 'string' || !t.trim()) return null;
  const k = t.trim().toUpperCase();
  return CARD_TYPES[k] ?? t.trim().slice(0, 30);
}

function cardLast4(n: unknown): string | null {
  if (typeof n !== 'string') return null;
  const digits = n.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

// Helcim API ------------------------------------------------------------------------------------------------------

interface HelcimResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  /** Network failure or timeout: the request may or may not have reached Helcim. */
  unknown: boolean;
}

async function helcim(
  path: string,
  token: string,
  init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string },
): Promise<HelcimResult> {
  const headers: Record<string, string> = { accept: 'application/json', 'api-token': token };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${HELCIM_API}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(HELCIM_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, body: null, unknown: true };
  }
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = text ? JSON.parse(text) : null;
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, unknown: res.status >= 500 || (res.ok && !body) };
}

/** Helcim's error list as one short sentence (errors may be a string, an array or an object). */
function helcimErrors(r: HelcimResult): string {
  const e = r.body?.errors ?? r.body?.message;
  let parts: string[] = [];
  if (typeof e === 'string') parts = [e];
  else if (Array.isArray(e)) parts = e.map(String);
  else if (e && typeof e === 'object') parts = Object.entries(e as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`);
  const s = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (s) return s;
  if (r.status === 401 || r.status === 403) return 'Helcim did not accept the API token.';
  return r.status ? `Helcim answered with status ${r.status}.` : 'Helcim could not be reached.';
}

async function shopToken(workshopId: string): Promise<string> {
  const token = await rpc<string | null>(admin, 'get_helcim_token', { p_workshop: workshopId }, 'Could not read the payment settings.');
  if (!token) throw new HttpError(409, 'Card payments are not set up for this shop yet (Settings > Payments).');
  return token;
}

// Hash validation (https://devdocs.helcim.com/docs/validate-helcimpayjs) ------------------------------------------------
//
// Helcim hashes json_encode(data) . secretToken with SHA-256. Its server is PHP, whose json_encode escapes "/" as "\/"
// and non-ASCII characters as \uXXXX; Helcim's own Python sample uses compact separators. Re-encoding can differ from
// Helcim's bytes, so the exact text of "data" as Helcim sent it is tried first, then the common encodings. Any match
// proves the data came from this checkout (the secretToken is unique per checkout and never leaves the server).

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function escapeNonAscii(s: string): string {
  return s.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** The raw JSON text of the value at path (object keys) in text, exactly as written; null if absent or malformed. */
function rawJsonAt(text: string, path: string[]): string | null {
  let i = 0;
  const fail = () => {
    throw new Error('bad json');
  };
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const skipString = () => {
    if (text[i] !== '"') fail();
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      i++;
      if (c === '"') return;
    }
    fail();
  };
  const readKey = (): string => {
    const s = i;
    skipString();
    return JSON.parse(text.slice(s, i)) as string;
  };
  const skipValue = (): void => {
    ws();
    const c = text[i];
    if (c === '"') return skipString();
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++;
      ws();
      if (text[i] === close) {
        i++;
        return;
      }
      for (;;) {
        if (c === '{') {
          ws();
          skipString();
          ws();
          if (text[i] !== ':') fail();
          i++;
        }
        skipValue();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === close) {
          i++;
          return;
        }
        fail();
      }
    }
    const s = i;
    while (i < text.length && !',}] \t\n\r'.includes(text[i])) i++;
    if (i === s) fail();
  };
  const find = (depth: number): string | null => {
    ws();
    if (depth === path.length) {
      const s = i;
      skipValue();
      return text.slice(s, i);
    }
    if (text[i] !== '{') return null;
    i++;
    ws();
    if (text[i] === '}') return null;
    for (;;) {
      ws();
      const key = readKey();
      ws();
      if (text[i] !== ':') fail();
      i++;
      if (key === path[depth]) return find(depth + 1);
      skipValue();
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      return null;
    }
  };
  try {
    return find(0);
  } catch {
    return null;
  }
}

interface ParsedResponse {
  hash: string;
  data: Record<string, unknown>;
  rawData: string | null;
}

/**
 * The browser sends event.data.eventMessage as it came from the HelcimPay.js iframe (a JSON string per
 * https://devdocs.helcim.com/docs/render-helcimpayjs). Helcim's samples show {hash, data}; some integrations see it
 * wrapped once more as {data: {hash, data}}. Both are accepted.
 */
function parseHelcimResponse(input: unknown): ParsedResponse {
  let raw: string | null = null;
  let value: unknown = input;
  for (let k = 0; k < 2 && typeof value === 'string'; k++) {
    raw = value;
    try {
      value = JSON.parse(value);
    } catch {
      throw new HttpError(400, 'The payment response could not be read.');
    }
  }
  if (!value || typeof value !== 'object') throw new HttpError(400, 'The payment response could not be read.');
  const top = value as Record<string, unknown>;
  const isPair = (o: unknown): o is { hash: string; data: Record<string, unknown> } =>
    !!o && typeof o === 'object' && typeof (o as { hash?: unknown }).hash === 'string' &&
    !!(o as { data?: unknown }).data && typeof (o as { data?: unknown }).data === 'object';
  if (isPair(top)) return { hash: top.hash, data: top.data, rawData: raw ? rawJsonAt(raw, ['data']) : null };
  if (isPair(top.data)) return { hash: top.data.hash, data: top.data.data, rawData: raw ? rawJsonAt(raw, ['data', 'data']) : null };
  throw new HttpError(400, 'The payment response from Helcim is incomplete.');
}

async function hashMatches(p: ParsedResponse, secretToken: string): Promise<boolean> {
  const want = p.hash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want)) return false;
  const js = JSON.stringify(p.data);
  const candidates = new Set<string>();
  if (p.rawData) candidates.add(p.rawData);
  candidates.add(js); // compact, like Helcim's Python sample with separators=(',', ':') when there is no non-ASCII
  candidates.add(escapeNonAscii(js)); // Python json.dumps default ensure_ascii
  candidates.add(escapeNonAscii(js).replace(/\//g, '\\/')); // PHP json_encode defaults
  candidates.add(js.replace(/\//g, '\\/'));
  for (const c of candidates) {
    if (timingSafeEqual(await sha256Hex(c + secretToken), want)) return true;
  }
  return false;
}

// Actions ---------------------------------------------------------------------------------------------------------

interface CheckoutRow {
  id: string;
  workshop_id: string;
  invoice_id: string;
  amount: number | string;
  currency: string;
  secret_token: string | null;
  checkout_token: string | null;
  status: 'open' | 'completed' | 'expired';
  transaction_id: string | null;
  created_at: string;
}

async function start(body: Record<string, unknown>, caller: Caller | null) {
  const slug = typeof body.slug === 'string' ? body.slug : null;
  const code = typeof body.code === 'string' ? body.code : null;
  const contact = typeof body.contact === 'string' ? body.contact : null;
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : null;
  let args: Record<string, unknown>;

  if (code) {
    if (!slug || !contact) throw new HttpError(400, 'Enter the tracking code and the email or phone you booked with.');
    args = { p_slug: slug, p_code: code, p_contact: contact };
  } else {
    if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new HttpError(400, 'Which invoice? invoice_id is missing.');
    const c = requireCaller(caller);
    const { data: staff, error } = await c.db.rpc('payment_staff_check', { p_invoice: invoiceId });
    if (!error && staff) {
      const s = staff as StaffCheck;
      if (!s.payments_full) throw new HttpError(403, 'You need full access to Invoices or Repair Orders to take payments.');
      let amount: number | null = null;
      if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
        const ct = cents(body.amount);
        if (!Number.isFinite(ct) || ct <= 0 || Math.abs(Number(body.amount) * 100 - ct) > 1e-6) {
          throw new HttpError(400, 'Enter an amount in dollars and cents.');
        }
        amount = dollars(ct);
      }
      args = { p_invoice: invoiceId, p_amount: amount, p_staff: c.user.id };
    } else if (error && /staff account/i.test(error.message)) {
      // Not staff: a customer paying their own invoice (checked as that user, then again in open_checkout).
      if (body.amount !== undefined && body.amount !== null) throw new HttpError(400, 'Online payments are for the full balance.');
      await rpc(c.db, 'my_invoice_for_payment', { p_invoice: invoiceId }, 'The invoice could not be loaded.');
      args = { p_invoice: invoiceId, p_customer: c.user.id };
    } else {
      throw rpcError(error ?? { message: 'Invoice not found.', code: 'P0001' }, 'The invoice could not be loaded.');
    }
  }

  const opened = await rpc<{ checkout_id: string; amount: number | string; workshop_id: string; invoice_id: string; invoice_number: string }>(
    admin,
    'open_checkout',
    args,
    'The payment could not be started.',
  );
  const token = await shopToken(opened.workshop_id);
  const amount = dollars(cents(opened.amount));
  // https://devdocs.helcim.com/reference/checkout-init: paymentType purchase, amount, currency CAD, card only.
  const init = await helcim('/helcim-pay/initialize', token, {
    method: 'POST',
    body: { paymentType: 'purchase', amount, currency: 'CAD', paymentMethod: 'cc', language: 'en' },
  });
  const checkoutToken = typeof init.body?.checkoutToken === 'string' ? init.body.checkoutToken : null;
  const secretToken = typeof init.body?.secretToken === 'string' ? init.body.secretToken : null;
  if (!init.ok || !checkoutToken || !secretToken) {
    const reason = helcimErrors(init);
    await admin.from('payment_checkouts').update({ status: 'expired', last_error: reason }).eq('id', opened.checkout_id);
    console.error('initialize failed', init.status, reason);
    throw new HttpError(502, `Helcim could not start the payment: ${reason}`);
  }
  const { error: saveError } = await admin
    .from('payment_checkouts')
    .update({ checkout_token: checkoutToken, secret_token: secretToken })
    .eq('id', opened.checkout_id);
  if (saveError) throw rpcError(saveError, 'The payment could not be started.');
  return {
    checkout_id: opened.checkout_id,
    checkoutToken,
    amount,
    currency: 'CAD',
    invoice_number: opened.invoice_number,
  };
}

interface Txn {
  id: string;
  amountCents: number;
  brand: string | null;
  last4: string | null;
}

/** Re-reads a transaction from Helcim and checks it is an approved CAD purchase. */
async function approvedPurchase(token: string, transactionId: string): Promise<Txn> {
  if (!/^\d{1,20}$/.test(transactionId)) throw new HttpError(400, 'That is not a Helcim transaction number.');
  const r = await helcim(`/card-transactions/${transactionId}`, token, { method: 'GET' });
  if (r.unknown) throw new HttpError(502, 'Helcim could not be reached to check the payment. Try again in a minute.');
  if (!r.ok || !r.body) throw new HttpError(400, `Helcim could not find this payment: ${helcimErrors(r)}`);
  const t = r.body;
  if (String(t.transactionId ?? '') !== transactionId) throw new HttpError(400, 'Helcim returned a different transaction.');
  if (String(t.status ?? '').toUpperCase() !== 'APPROVED') throw new HttpError(400, 'Helcim shows this card payment as not approved.');
  if (String(t.type ?? '').toLowerCase() !== 'purchase') throw new HttpError(400, 'This Helcim transaction is not a purchase.');
  if (String(t.currency ?? '').toUpperCase() !== 'CAD') throw new HttpError(400, 'This Helcim transaction is not in Canadian dollars.');
  const amountCents = cents(t.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new HttpError(400, 'Helcim returned no amount for this payment.');
  return { id: transactionId, amountCents, brand: cardBrand(t.cardType), last4: cardLast4(t.cardNumber) };
}

async function recordCard(checkout: CheckoutRow, txn: Txn) {
  if (txn.amountCents !== cents(checkout.amount)) {
    await admin.from('payment_checkouts').update({ last_error: 'Amount at Helcim does not match' }).eq('id', checkout.id);
    console.error('amount mismatch', checkout.id);
    throw new HttpError(400, 'The amount charged does not match this payment. It was not recorded; contact the shop.');
  }
  return await rpc<Record<string, unknown>>(
    admin,
    'record_card_payment',
    { p_checkout: checkout.id, p_transaction_id: txn.id, p_amount: dollars(txn.amountCents), p_card_brand: txn.brand, p_card_last4: txn.last4 },
    'The payment was approved but could not be recorded. Do not pay again; contact the shop.',
  );
}

async function loadCheckout(id: unknown): Promise<CheckoutRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'checkout_id is missing.');
  const { data, error } = await admin
    .from('payment_checkouts')
    .select('id, workshop_id, invoice_id, amount, currency, secret_token, checkout_token, status, transaction_id, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw rpcError(error, 'The payment could not be loaded.');
  if (!data) throw new HttpError(404, 'This payment session was not found.');
  return data as CheckoutRow;
}

async function confirm(body: Record<string, unknown>) {
  const checkout = await loadCheckout(body.checkout_id);
  if (!checkout.secret_token) throw new HttpError(400, 'This payment session was never opened.');
  const parsed = parseHelcimResponse(body.helcim_response);
  if (!(await hashMatches(parsed, checkout.secret_token))) {
    await admin.from('payment_checkouts').update({ last_error: 'Response hash did not match' }).eq('id', checkout.id);
    console.error('hash mismatch', checkout.id);
    throw new HttpError(
      400,
      'We could not verify this payment with Helcim, so it was not recorded. If your card was charged, contact the shop: they can record it from Helcim.',
    );
  }
  const txnId = String(parsed.data.transactionId ?? '').trim();
  if (!txnId) throw new HttpError(400, 'The payment response has no transaction number.');
  if (checkout.status === 'completed' && checkout.transaction_id === txnId) {
    return await rpc(admin, 'invoice_payment_state', { p_invoice: checkout.invoice_id }, 'Could not read the invoice.');
  }
  // The hash proves the data; the transaction is still re-read from Helcim so only Helcim's own record counts.
  if (cents(parsed.data.amount) !== cents(checkout.amount)) {
    throw new HttpError(400, 'The amount in the payment response does not match. It was not recorded; contact the shop.');
  }
  const token = await shopToken(checkout.workshop_id);
  const txn = await approvedPurchase(token, txnId);
  return await recordCard(checkout, txn);
}

async function reconcile(body: Record<string, unknown>, caller: Caller | null) {
  const c = requireCaller(caller);
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  const txnId = String(body.transaction_id ?? '').trim();
  const s = await rpc<StaffCheck>(c.db, 'payment_staff_check', { p_invoice: invoiceId }, 'The invoice could not be loaded.');
  if (!s.payments_full) throw new HttpError(403, 'You need full access to Invoices or Repair Orders to record payments.');
  const token = await shopToken(s.workshop_id);
  const txn = await approvedPurchase(token, txnId);
  // Only a checkout this system opened for this invoice, for exactly this amount, can take the transaction.
  const { data, error } = await admin
    .from('payment_checkouts')
    .select('id, workshop_id, invoice_id, amount, currency, secret_token, checkout_token, status, transaction_id, created_at')
    .eq('invoice_id', invoiceId)
    .eq('workshop_id', s.workshop_id)
    .in('status', ['open', 'expired'])
    .not('checkout_token', 'is', null)
    .eq('amount', dollars(txn.amountCents))
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw rpcError(error, 'The payment could not be checked.');
  const checkout = (data ?? [])[0] as CheckoutRow | undefined;
  if (!checkout) {
    throw new HttpError(400, 'No card payment of that amount was started for this invoice here. Record it with Record payment instead.');
  }
  return await recordCard(checkout, txn);
}

interface RefundStart {
  refund_id: string;
  original_transaction_id: string;
  workshop_id: string;
  payment_amount: number | string;
  amount: number | string;
  other_refunds: number;
  resumed: boolean;
}

async function refund(req: Request, body: Record<string, unknown>, caller: Caller | null) {
  const c = requireCaller(caller);
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id : '';
  const ct = cents(body.amount);
  if (!Number.isFinite(ct) || ct <= 0 || Math.abs(Number(body.amount) * 100 - ct) > 1e-6) {
    throw new HttpError(400, 'Enter the amount to refund in dollars and cents.');
  }
  const s = await rpc<StaffCheck>(c.db, 'payment_staff_check', { p_payment: paymentId }, 'The payment could not be loaded.');
  if (!s.payments_full) throw new HttpError(403, 'You need full access to Invoices or Repair Orders to refund payments.');
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  const r = await rpc<RefundStart>(
    admin,
    'begin_card_refund',
    { p_payment: paymentId, p_amount: dollars(ct), p_staff: c.user.id, p_note: note },
    'The refund could not be started.',
  );
  const token = await shopToken(r.workshop_id);
  const amount = dollars(cents(r.amount));
  const ip = clientIp(req);
  const original = Number(r.original_transaction_id);

  const finish = (txnId: string | null, ok: boolean, failure: string | null) =>
    rpc<Record<string, unknown>>(
      admin,
      'record_card_refund',
      { p_refund: r.refund_id, p_transaction_id: txnId, p_succeeded: ok, p_failure: failure },
      'Helcim answered but the refund could not be recorded. Press Refund to card again with the same amount to finish it.',
    );
  const stillPending = () =>
    new HttpError(
      502,
      'Helcim did not answer clearly, so the refund is marked as processing. Press Refund to card again with the same amount: it will not refund twice.',
      { pending: true },
    );

  // The refund row id is the idempotency key (36 characters, allowed by Helcim: 25-36 of letters, digits, - and _).
  const res = await helcim('/payment/refund', token, {
    method: 'POST',
    body: { originalTransactionId: original, amount, ipAddress: ip, ecommerce: true },
    idempotencyKey: r.refund_id,
  });
  if (res.unknown) throw stillPending();
  if (res.ok && res.body) {
    const st = String(res.body.status ?? '').toUpperCase();
    const txn = res.body.transactionId != null ? String(res.body.transactionId) : null;
    if (st === 'APPROVED' && txn) return { ...(await finish(txn, true, null)), helcim: 'refund' };
    if (st === 'DECLINED') {
      await finish(txn, false, 'Declined by Helcim');
      throw new HttpError(400, 'Helcim declined the refund. Nothing was refunded.');
    }
    throw stillPending();
  }
  const reason = helcimErrors(res);
  if (/idempoten/i.test(reason)) throw stillPending();
  // Refunds need a closed batch; until the day's batch closes the whole transaction can be reversed instead.
  const batchOpen = /batch/i.test(reason);
  const whole = cents(r.amount) === cents(r.payment_amount) && Number(r.other_refunds) === 0;
  if (batchOpen && whole) {
    const rev = await helcim('/payment/reverse', token, {
      method: 'POST',
      body: { cardTransactionId: original, ipAddress: ip, ecommerce: true },
      idempotencyKey: `rv_${r.refund_id.replace(/-/g, '')}`,
    });
    if (rev.unknown) throw stillPending();
    const st = String(rev.body?.status ?? '').toUpperCase();
    const txn = rev.body?.transactionId != null ? String(rev.body.transactionId) : null;
    if (rev.ok && st === 'APPROVED' && txn) return { ...(await finish(txn, true, null)), helcim: 'reverse' };
    if (rev.ok && st !== 'DECLINED') throw stillPending();
    const why = rev.ok ? 'Helcim declined the reversal.' : helcimErrors(rev);
    await finish(txn, false, why);
    throw new HttpError(400, `Helcim could not reverse the payment: ${why}`);
  }
  if (batchOpen) {
    await finish(null, false, reason);
    throw new HttpError(
      400,
      'Helcim can refund part of a card payment only after the day\'s batch closes (usually overnight). Refund the full amount now, or try this amount tomorrow.',
    );
  }
  await finish(null, false, reason);
  throw new HttpError(400, `Helcim did not refund the payment: ${reason}`);
}

async function test(caller: Caller | null) {
  const c = requireCaller(caller);
  const s = await rpc<StaffCheck>(c.db, 'payment_staff_check', {}, 'Could not check your access.');
  if (!s.settings_full) throw new HttpError(403, 'You need full access to Settings to test payments.');
  const token = await shopToken(s.workshop_id);
  const r = await helcim('/connection-test', token, { method: 'GET' });
  if (r.ok) return { ok: true, message: 'Connected to Helcim.' };
  if (r.status === 401 || r.status === 403) return { ok: false, message: 'Helcim did not accept this API token. Paste a new one.' };
  return { ok: false, message: helcimErrors(r) };
}

// Server ----------------------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED.includes(origin.replace(/\/+$/, ''))) {
    return json(403, { error: 'This website may not use the payments service.' }, null);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, origin);
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return json(500, { error: 'The payments service is not configured.' }, origin);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object') throw new Error('bad');
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Send a JSON body with an action.' }, origin);
  }
  const action = String(body.action ?? '');
  try {
    const caller = await getCaller(req);
    let out: unknown;
    if (action === 'start') out = await start(body, caller);
    else if (action === 'confirm') out = await confirm(body);
    else if (action === 'reconcile') out = await reconcile(body, caller);
    else if (action === 'refund') out = await refund(req, body, caller);
    else if (action === 'test') out = await test(caller);
    else return json(400, { error: 'Unknown action.' }, origin);
    return json(200, out, origin);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, ...e.extra }, origin);
    console.error('unexpected', action, e instanceof Error ? e.message.slice(0, 200) : 'error');
    return json(500, { error: 'Something went wrong. Try again: a payment or refund is never recorded twice.' }, origin);
  }
});
