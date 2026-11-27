// What the customer-mailer sends: the email for each repair status, and the invoice email.
// Pure functions (no Deno or Supabase calls), so they can be tested on their own.
// The invoice PDF itself is made by the ERP (packages/shared/src/invoicePdf.ts) and stored; this only attaches it.

export type RepairStatus =
  | 'checked_in' | 'diagnosing' | 'awaiting_approval' | 'in_progress' | 'quality_check' | 'ready' | 'completed' | 'cancelled';

export interface Vehicle {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  vin?: string | null;
  plate?: string | null;
}

export interface Shop {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface RepairInfo {
  number: string;
  tracking_code: string;
  contact_name: string;
  vehicle: Vehicle;
  /** Link to the customer's tracking page, when the site address is known. */
  trackUrl?: string | null;
  /** The customer has an account (they can turn progress emails off). */
  hasAccount: boolean;
}

export interface Invoice {
  number: string;
  total: number;
}

export interface Email {
  subject: string;
  text: string;
  html: string;
}

// Helpers ------------------------------------------------------------------------------------------------------

export function vehicleName(v: Vehicle | null | undefined): string {
  const s = [v?.year, v?.make, v?.model].filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' ');
  return s || 'vehicle';
}

export function money(n: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);
}

export function day(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone, year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

// Emails ---------------------------------------------------------------------------------------------------------

const STATUS_COPY: Record<RepairStatus, (car: string, shop: string, ro: string) => { subject: string; lines: string[] }> = {
  checked_in: (car, shop, ro) => ({
    subject: `We've checked in your ${car}`,
    lines: [`Your ${car} is checked in at ${shop} (repair ${ro}).`, 'We will let you know as the work moves along.'],
  }),
  diagnosing: (car) => ({
    subject: `We're inspecting your ${car}`,
    lines: [`A technician is inspecting your ${car} now.`, 'If anything needs your approval, we will send you an estimate first.'],
  }),
  awaiting_approval: (car) => ({
    subject: `Your estimate for the ${car} is ready`,
    lines: [`The technician has looked at your ${car}. Your estimate is ready.`, 'Please review it and approve or decline the work. Nothing is done without your OK.'],
  }),
  in_progress: (car) => ({
    subject: `Work has started on your ${car}`,
    lines: [`Work has started on your ${car}.`],
  }),
  quality_check: (car) => ({
    subject: `Final checks on your ${car}`,
    lines: [`The work on your ${car} is done and we are running final checks.`],
  }),
  ready: (car) => ({
    subject: `Your ${car} is ready for pickup`,
    lines: [`Your ${car} is ready for pickup.`],
  }),
  completed: (car, shop, ro) => ({
    subject: `Thank you for choosing ${shop}`,
    lines: [`Repair ${ro} on your ${car} is complete.`, 'Thank you for your business. We hope to see you again.'],
  }),
  cancelled: (car, _shop, ro) => ({
    subject: `Your repair ${ro} was cancelled`,
    lines: [`Repair ${ro} on your ${car} has been cancelled.`, 'If this is unexpected, please contact us.'],
  }),
};

function wrapEmail(shop: Shop, repair: RepairInfo, lines: string[], cta: string | null): Omit<Email, 'subject'> {
  const hello = `Hi ${firstName(repair.contact_name)},`;
  const contact = [shop.phone, shop.email, shop.address].filter(Boolean) as string[];
  const footerNote = repair.hasAccount
    ? 'You get these updates because you have a repair with us. To stop progress emails, turn off email reminders in your account.'
    : 'You get these updates because you have a repair with us.';

  const text = [
    hello,
    '',
    ...lines,
    '',
    ...(repair.trackUrl ? [`${cta ?? 'Track your repair'}: ${repair.trackUrl}`, ''] : []),
    `Repair ${repair.number} · tracking code ${repair.tracking_code}`,
    '',
    shop.name,
    ...contact,
    '',
    footerNote,
  ].join('\n');

  const button = repair.trackUrl
    ? `<p style="margin:24px 0"><a href="${esc(repair.trackUrl)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(cta ?? 'Track your repair')}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#4f46e5;letter-spacing:.04em;text-transform:uppercase">${esc(shop.name)}</p>
<p style="margin:0 0 12px;font-size:16px">${esc(hello)}</p>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${esc(l)}</p>`).join('\n')}
${button}
<p style="margin:16px 0 0;font-size:13px;color:#6b7280">Repair ${esc(repair.number)} · tracking code ${esc(repair.tracking_code)}</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="margin:0;font-size:13px;color:#374151"><strong>${esc(shop.name)}</strong>${contact.map((c) => `<br>${esc(c)}`).join('')}</p>
<p style="margin:12px 0 0;font-size:12px;color:#9ca3af">${esc(footerNote)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

/** The progress email for a status change. */
export function statusEmail(status: RepairStatus, shop: Shop, repair: RepairInfo): Email {
  const car = vehicleName(repair.vehicle);
  const copy = STATUS_COPY[status](car, shop.name, repair.number);
  const cta = status === 'awaiting_approval' ? 'Review the estimate' : 'Track your repair';
  return { ...wrapEmail(shop, repair, copy.lines, cta), subject: copy.subject };
}

/** The Ready-for-pickup email that carries the invoice PDF. */
export function invoiceEmail(shop: Shop, repair: RepairInfo, invoice: Invoice): Email {
  const car = vehicleName(repair.vehicle);
  const lines = [
    `Your ${car} is ready for pickup.`,
    `Your invoice ${invoice.number} is attached as a PDF. Total: ${money(invoice.total)} (including GST).`,
  ];
  return { ...wrapEmail(shop, repair, lines, 'View your repair'), subject: `Your ${car} is ready for pickup · Invoice ${invoice.number}` };
}

export function invoiceFileName(invoice: Invoice, shopName: string): string {
  const clean = (x: string) => x.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Invoice-${clean(invoice.number)}-${clean(shopName).slice(0, 40)}.pdf`;
}
