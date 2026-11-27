// customer-mailer: sends the customer emails queued in public.customer_outbox (migration 023).
//
// Called by a Supabase Database Webhook on INSERT into customer_outbox (and safe to call any time, for example from a
// schedule): it claims up to 10 waiting messages, sends each, and marks it sent, or puts it back for a retry (up to 5
// attempts, then "failed"). Invoice jobs attach the invoice PDF the ERP stored in the private "invoices" bucket.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets; never in the code or the repo):
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS   the shop's email account (nodemailer)
//   SMTP_FROM          optional: the address to send from (defaults to SMTP_USER)
//   CUSTOMER_SITE_URL  optional: the customer website, e.g. https://book.example.com (adds a "Track your repair" link)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';
import { invoiceEmail, invoiceFileName, statusEmail } from './content.ts';
import type { RepairInfo, RepairStatus, Shop } from './content.ts';

const MAX_ATTEMPTS = 5;

interface Job {
  id: string;
  workshop_id: string;
  repair_order_id: string;
  invoice_id: string | null;
  kind: 'status' | 'invoice';
  status: RepairStatus | null;
  channel: 'email' | 'sms';
  to_address: string | null;
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

/** Everything a job needs about its repair, shop and time zone. */
async function context(job: Job) {
  const { data: ro, error } = await supabase
    .from('repair_orders')
    .select('id, number, tracking_code, status, contact_name, vehicle, customer_id, workshop_id')
    .eq('id', job.repair_order_id)
    .single();
  if (error || !ro) throw new Error(`Repair order not found: ${error?.message ?? ''}`);
  const [{ data: ws }, { data: site }] = await Promise.all([
    supabase.from('workshops').select('name').eq('id', ro.workshop_id).single(),
    supabase.from('workshop_sites').select('slug, display_name, phone, email, address').eq('workshop_id', ro.workshop_id).maybeSingle(),
  ]);
  const shop: Shop = {
    name: site?.display_name || ws?.name || 'Your workshop',
    phone: site?.phone ?? null,
    email: site?.email ?? null,
    address: site?.address ?? null,
  };
  const base = env('CUSTOMER_SITE_URL').replace(/\/+$/, '');
  const repair: RepairInfo = {
    number: ro.number,
    tracking_code: ro.tracking_code,
    contact_name: ro.contact_name,
    vehicle: ro.vehicle ?? {},
    trackUrl: base && site?.slug ? `${base}/${site.slug}/track/${encodeURIComponent(ro.tracking_code)}` : null,
    hasAccount: Boolean(ro.customer_id),
  };
  return { shop, repair };
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

/** Returns the final state: sent, or skipped (with the reason kept in last_error). */
async function handle(job: Job): Promise<'sent' | 'skipped'> {
  if (job.channel === 'sms') return 'skipped'; // No SMS provider yet.
  const { shop, repair } = await context(job);

  if (job.kind === 'invoice') {
    if (!job.invoice_id) throw new Error('Invoice job without an invoice');
    const { data: inv, error } = await supabase.from('invoices').select('id, number, total, status, pdf_path').eq('id', job.invoice_id).single();
    if (error || !inv) throw new Error(`Invoice not found: ${error?.message ?? ''}`);
    if (inv.status !== 'issued' || !job.to_address) return 'skipped';
    if (!inv.pdf_path) throw new Error('The invoice PDF is not stored yet');
    const file = await supabase.storage.from('invoices').download(inv.pdf_path);
    if (file.error || !file.data) throw new Error(`Could not read the PDF: ${file.error?.message ?? ''}`);
    const pdf = new Uint8Array(await file.data.arrayBuffer());
    const invoice = { number: inv.number, total: Number(inv.total) || 0 };
    await send(shop, job.to_address, invoiceEmail(shop, repair, invoice), { filename: invoiceFileName(invoice, shop.name), content: pdf });
    return 'sent';
  }

  if (!job.to_address || !job.status) return 'skipped';
  await send(shop, job.to_address, statusEmail(job.status, shop, repair));
  return 'sent';
}

Deno.serve(async () => {
  if (!smtpConfigured()) {
    // Nothing is claimed, so the queue waits until the email account is set up.
    return Response.json({ error: 'SMTP is not set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS as Edge Function secrets.' }, { status: 503 });
  }
  const { data, error } = await supabase.rpc('claim_customer_outbox', { p_limit: 10 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const jobs = (data ?? []) as Job[];
  const results: Record<string, string> = {};
  for (const job of jobs) {
    try {
      const state = await handle(job);
      await supabase
        .from('customer_outbox')
        .update({ state, sent_at: state === 'sent' ? new Date().toISOString() : null, last_error: state === 'sent' ? null : job.last_error })
        .eq('id', job.id);
      results[job.id] = state;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const state = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await supabase.from('customer_outbox').update({ state, last_error: message }).eq('id', job.id);
      results[job.id] = `${state}: ${message}`;
    }
  }
  return Response.json({ processed: jobs.length, results });
});
