// customer-mailer: sends the customer emails queued in public.customer_outbox (migration 023; approval requests
// since migration 034) and the purchase orders to suppliers queued in public.supplier_outbox (migration 031).
//
// Called by Supabase Database Webhooks on INSERT into customer_outbox and supplier_outbox (and safe to call any time,
// for example from a schedule): it claims up to 10 waiting messages from each queue, sends each, and marks it sent,
// or puts it back for a retry (up to 5 attempts, then "failed"). Invoice jobs attach the invoice PDF the ERP stored in
// the private "invoices" bucket; purchase-order jobs attach the PO PDF from the private "documents" bucket.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets; never in the code or the repo):
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS   the shop's email account (nodemailer)
//   SMTP_FROM          optional: the address to send from (defaults to SMTP_USER)
//   CUSTOMER_SITE_URL  optional: the customer website, e.g. https://book.example.com (adds a "Track your repair" link)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';
import { approvalEmail, day, invoiceEmail, invoiceFileName, purchaseOrderEmail, purchaseOrderFileName, statusEmail } from './content.ts';
import type { PurchaseOrderInfo, RepairInfo, RepairStatus, Shop } from './content.ts';

const MAX_ATTEMPTS = 5;

interface Job {
  id: string;
  workshop_id: string;
  repair_order_id: string;
  invoice_id: string | null;
  kind: 'status' | 'invoice' | 'approval';
  status: RepairStatus | null;
  channel: 'email' | 'sms';
  to_address: string | null;
  attempts: number;
  last_error: string | null;
}

interface SupplierJob {
  id: string;
  workshop_id: string;
  purchase_order_id: string;
  supplier_id: string | null;
  kind: 'purchase_order';
  to_address: string;
  attempts: number;
  last_error: string | null;
}

const env = (k: string) => Deno.env.get(k)?.trim() || '';

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

function smtpConfigured(): boolean {
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function mailer() {
  if (!transport) {
    const port = Number(env('SMTP_PORT') || 587);
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    });
  }
  return transport;
}

/** The shop's name and contact details (its website settings, else the workshop name). */
async function shopFor(workshopId: string) {
  const [{ data: ws }, { data: site }] = await Promise.all([
    supabase.from('workshops').select('name').eq('id', workshopId).single(),
    supabase.from('workshop_sites').select('slug, display_name, phone, email, address').eq('workshop_id', workshopId).maybeSingle(),
  ]);
  const shop: Shop = {
    name: site?.display_name || ws?.name || 'Your workshop',
    phone: site?.phone ?? null,
    email: site?.email ?? null,
    address: site?.address ?? null,
  };
  return { shop, slug: (site?.slug as string | undefined) ?? null };
}

/** Everything a job needs about its repair, shop and time zone. */
async function context(job: Job) {
  const { data: ro, error } = await supabase
    .from('repair_orders')
    .select('id, number, tracking_code, status, contact_name, vehicle, customer_id, workshop_id')
    .eq('id', job.repair_order_id)
    .single();
  if (error || !ro) throw new Error(`Repair order not found: ${error?.message ?? ''}`);
  const { shop, slug } = await shopFor(ro.workshop_id);
  const base = env('CUSTOMER_SITE_URL').replace(/\/+$/, '');
  const repair: RepairInfo = {
    number: ro.number,
    tracking_code: ro.tracking_code,
    contact_name: ro.contact_name,
    vehicle: ro.vehicle ?? {},
    trackUrl: base && slug ? `${base}/${slug}/track/${encodeURIComponent(ro.tracking_code)}` : null,
    hasAccount: Boolean(ro.customer_id),
  };
  return { shop, repair, status: ro.status as string };
}

async function send(shop: Shop, to: string, mail: { subject: string; text: string; html: string }, attachment?: { filename: string; content: Uint8Array }) {
  const from = env('SMTP_FROM') || env('SMTP_USER');
  await mailer().sendMail({
    from: { name: shop.name, address: from },
    to,
    replyTo: shop.email || undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: attachment ? [{ filename: attachment.filename, content: attachment.content, contentType: 'application/pdf' }] : [],
  });
}

type Outcome = 'sent' | { skipped: string };

/** Returns the final state: sent, or skipped with the reason (kept in last_error). */
async function handle(job: Job): Promise<Outcome> {
  if (job.channel === 'sms') return { skipped: 'Text messages are not connected yet' };
  const { shop, repair, status } = await context(job);

  if (job.kind === 'approval') {
    if (!job.to_address) return { skipped: 'No email address for this customer' };
    if (status !== 'awaiting_approval') return { skipped: 'The repair is no longer waiting for approval' };
    const { data: items, error } = await supabase
      .from('repair_order_items')
      .select('description, quantity, unit_price, sort_order')
      .eq('repair_order_id', job.repair_order_id)
      .eq('approval', 'pending')
      .order('sort_order');
    if (error) throw new Error(`Could not read the estimate: ${error.message}`);
    if (!items || items.length === 0) return { skipped: 'Nothing is waiting for approval any more' };
    const lines = items.map((i) => ({ description: String(i.description), quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 }));
    await send(shop, job.to_address, approvalEmail(shop, repair, lines));
    return 'sent';
  }

  if (job.kind === 'invoice') {
    if (!job.invoice_id) throw new Error('Invoice job without an invoice');
    const { data: inv, error } = await supabase.from('invoices').select('id, number, total, status, pdf_path').eq('id', job.invoice_id).single();
    if (error || !inv) throw new Error(`Invoice not found: ${error?.message ?? ''}`);
    if (inv.status !== 'issued') return { skipped: 'The invoice is no longer issued' };
    if (!job.to_address) return { skipped: 'No email address for this customer' };
    if (!inv.pdf_path) throw new Error('The invoice PDF is not stored yet');
    const file = await supabase.storage.from('invoices').download(inv.pdf_path);
    if (file.error || !file.data) throw new Error(`Could not read the PDF: ${file.error?.message ?? ''}`);
    const pdf = new Uint8Array(await file.data.arrayBuffer());
    const invoice = { number: inv.number, total: Number(inv.total) || 0 };
    await send(shop, job.to_address, invoiceEmail(shop, repair, invoice), { filename: invoiceFileName(invoice, shop.name), content: pdf });
    return 'sent';
  }

  if (!job.to_address) return { skipped: 'No email address for this customer' };
  if (!job.status) return { skipped: 'No status on this message' };
  await send(shop, job.to_address, statusEmail(job.status, shop, repair));
  return 'sent';
}

/** A purchase order to its supplier, with the PDF the ERP stored. Returns sent, or skipped (cancelled meanwhile). */
async function handleSupplier(job: SupplierJob): Promise<'sent' | 'skipped'> {
  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select('id, workshop_id, number, status, notes, expected_at, pdf_path, supplier_id, repair_order_id')
    .eq('id', job.purchase_order_id)
    .single();
  if (error || !po) throw new Error(`Purchase order not found: ${error?.message ?? ''}`);
  if (po.status === 'cancelled') return 'skipped';
  if (!po.pdf_path) throw new Error('The purchase order PDF is not stored yet');
  const [{ data: sup }, { data: lines, error: linesError }, { data: ro }, { data: booking }, { shop }] = await Promise.all([
    supabase.from('suppliers').select('name, contact_name, account_number').eq('id', po.supplier_id).maybeSingle(),
    supabase.from('purchase_order_lines').select('description, part_number, quantity, unit_cost, sort_order').eq('po_id', po.id).order('sort_order'),
    po.repair_order_id
      ? supabase.from('repair_orders').select('number').eq('id', po.repair_order_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('booking_settings').select('time_zone').eq('workshop_id', po.workshop_id).maybeSingle(),
    shopFor(po.workshop_id),
  ]);
  if (linesError) throw new Error(`Could not read the order lines: ${linesError.message}`);
  const file = await supabase.storage.from('documents').download(po.pdf_path);
  if (file.error || !file.data) throw new Error(`Could not read the PDF: ${file.error?.message ?? ''}`);
  const pdf = new Uint8Array(await file.data.arrayBuffer());
  const info: PurchaseOrderInfo = {
    number: po.number,
    supplier_name: sup?.name ?? 'Supplier',
    contact_name: sup?.contact_name ?? null,
    account_number: sup?.account_number ?? null,
    lines: (lines ?? []).map((l) => ({
      description: String(l.description),
      part_number: l.part_number ?? null,
      quantity: Number(l.quantity) || 0,
      unit_cost: Number(l.unit_cost) || 0,
    })),
    notes: po.notes ?? null,
    // expected_at is a date: read it at noon UTC so no time zone moves it to another day.
    expected: po.expected_at ? day(`${po.expected_at}T12:00:00Z`, String(booking?.time_zone ?? 'America/Edmonton')) : null,
    repair_number: (ro as { number?: string } | null)?.number ?? null,
  };
  await send(shop, job.to_address, purchaseOrderEmail(shop, info), { filename: purchaseOrderFileName(po.number, shop.name), content: pdf });
  return 'sent';
}

async function runCustomerQueue(results: Record<string, string>): Promise<number> {
  const { data, error } = await supabase.rpc('claim_customer_outbox', { p_limit: 10 });
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as Job[];
  for (const job of jobs) {
    try {
      const outcome = await handle(job);
      const sent = outcome === 'sent';
      await supabase
        .from('customer_outbox')
        .update({ state: sent ? 'sent' : 'skipped', sent_at: sent ? new Date().toISOString() : null, last_error: sent ? null : outcome.skipped })
        .eq('id', job.id);
      results[job.id] = sent ? 'sent' : `skipped: ${outcome.skipped}`;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const state = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await supabase.from('customer_outbox').update({ state, last_error: message }).eq('id', job.id);
      results[job.id] = `${state}: ${message}`;
    }
  }
  return jobs.length;
}

async function runSupplierQueue(results: Record<string, string>): Promise<number> {
  const { data, error } = await supabase.rpc('claim_supplier_outbox', { p_limit: 10 });
  if (error) {
    // Migration 031 not applied yet: customer emails still go out.
    if (/claim_supplier_outbox|schema cache|does not exist/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  const jobs = (data ?? []) as SupplierJob[];
  for (const job of jobs) {
    try {
      const state = await handleSupplier(job);
      await supabase
        .from('supplier_outbox')
        .update({
          state,
          sent_at: state === 'sent' ? new Date().toISOString() : null,
          last_error: state === 'sent' ? null : 'The purchase order was cancelled',
        })
        .eq('id', job.id);
      results[job.id] = state;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const state = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await supabase.from('supplier_outbox').update({ state, last_error: message }).eq('id', job.id);
      results[job.id] = `${state}: ${message}`;
    }
  }
  return jobs.length;
}

Deno.serve(async () => {
  if (!smtpConfigured()) {
    // Nothing is claimed, so the queue waits until the email account is set up.
    return Response.json({ error: 'SMTP is not set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS as Edge Function secrets.' }, { status: 503 });
  }
  const results: Record<string, string> = {};
  const errors: string[] = [];
  let processed = 0;
  for (const run of [runCustomerQueue, runSupplierQueue]) {
    try {
      processed += await run(results);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (errors.length > 0 && processed === 0) return Response.json({ error: errors.join(' | ') }, { status: 500 });
  return Response.json({ processed, results, ...(errors.length > 0 ? { errors } : {}) });
});
