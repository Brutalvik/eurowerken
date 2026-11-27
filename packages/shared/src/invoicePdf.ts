/**
 * The invoice PDF, one design for every place it is made: the ERP (download, print, and the copy that is emailed)
 * and the customer site (download, print). Import it lazily: `await import('@eurowerken/shared/invoice-pdf')`,
 * so pdf-lib only loads when someone asks for an invoice.
 *
 * Contact details can be partly hidden ("403 471 xxxx", "vixxx0@gmail.com"): the ERP and the customer each choose
 * per print, starting from their saved setting.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import { formatTaxLabel, invoiceTaxLines, parseRegistration, registrationLines } from './taxes';
import type { TaxLine, TaxRegistration } from './taxes';

// Data ---------------------------------------------------------------------------------------------------------------

export interface InvoiceVehicle {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  vin?: string | null;
  plate?: string | null;
}

export interface InvoiceShop {
  name: string;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  /** #rrggbb; the shop's brand colour from its website settings. */
  accent?: string | null;
  /** https URL of a PNG or JPEG logo. Other formats are skipped. */
  logoUrl?: string | null;
}

export interface InvoiceLineItem {
  kind: 'service' | 'labour' | 'part' | 'fee' | string;
  description: string;
  quantity: number;
  unit_price: number;
  /** False for a tax-exempt line (migration 029): marked "(no tax)". */
  taxable?: boolean;
}

export interface InvoiceNote {
  title: string;
  body?: string | null;
  at: string;
}

export interface InvoiceDocument {
  shop: InvoiceShop;
  number: string;
  issued_at: string;
  void?: boolean;
  timeZone: string;
  bill_to: { name?: string | null; email?: string | null; phone?: string | null };
  vehicle: InvoiceVehicle;
  repair: {
    number: string;
    tracking_code?: string | null;
    checked_in_at?: string | null;
    completed_at?: string | null;
    technician?: string | null;
    /** What the customer told the shop when booking. */
    customer_notes?: string | null;
  };
  /** Work done and charged (approved items). */
  lines: InvoiceLineItem[];
  /** Work the customer declined: shown as recommendations, not charged. */
  declined: InvoiceLineItem[];
  /** The technician's notes the customer may see. */
  notes: InvoiceNote[];
  /** Compatibility: the combined rate. Used only when `taxes` is absent (one GST line). */
  gst_rate: number;
  /** Totals as stored on the invoice; recomputed from lines when absent. */
  subtotal?: number;
  /** Compatibility: the total tax. Used only when `taxes` is absent. */
  gst?: number;
  total?: number;
  /** Each tax as charged (invoices.taxes, migration 029). Absent or empty: one GST line from gst / gst_rate. */
  taxes?: TaxLine[];
  /** The shop's tax registration numbers, printed under its details. */
  registration?: TaxRegistration | null;
  /** Payments (when the invoices table has them): with amount_paid > 0, "Paid" and "Balance due" rows print. */
  amount_paid?: number | null;
  balance?: number | null;
  payment_status?: string | null;
}

// Privacy ---------------------------------------------------------------------------------------------------------------

/** "403 471 7769" -> "403 471 xxxx": the last four digits become x, formatting kept. */
export function maskPhone(phone: string | null | undefined): string {
  const s = (phone ?? '').trim();
  if (!s) return '';
  let left = 4;
  const out = s.split('').reverse().map((c) => {
    if (left > 0 && /\d/.test(c)) {
      left--;
      return 'x';
    }
    return c;
  });
  return out.reverse().join('');
}

/** "vikcanada90@gmail.com" -> "vixxx0@gmail.com": the middle of the name becomes xxx. */
export function maskEmail(email: string | null | undefined): string {
  const s = (email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? 'xxx' : '';
  const name = s.slice(0, at);
  const domain = s.slice(at);
  if (name.length <= 3) return `${name[0]}xxx${domain}`;
  return `${name.slice(0, 2)}xxx${name.slice(-1)}${domain}`;
}

// Formatting ------------------------------------------------------------------------------------------------------------

export function invoiceVehicleName(v: InvoiceVehicle | null | undefined): string {
  return [v?.year, v?.make, v?.model].filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' ') || 'Vehicle';
}

function money(n: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);
}

function dateOnly(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone, year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

function dateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-CA', { timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** Standard PDF fonts only know Latin-1. */
function latin1(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/•/g, '·')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

function hexColor(hex: string | null | undefined, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** The accent mixed toward white (t = 0..1), for soft backgrounds. */
function tint(c: RGB, t: number): RGB {
  return rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of latin1(text).split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

const KIND_ORDER = ['service', 'labour', 'part', 'fee'];
const KIND_TITLE: Record<string, string> = { service: 'Services', labour: 'Labour', part: 'Parts', fee: 'Fees' };

async function loadLogo(pdf: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

// Rendering -------------------------------------------------------------------------------------------------------------

const W = 612; // US Letter
const H = 792;
const M = 44;
const INK = rgb(0.07, 0.09, 0.15);
const BODY = rgb(0.22, 0.25, 0.32);
const MUTED = rgb(0.45, 0.48, 0.54);
const RULE = rgb(0.89, 0.9, 0.92);
const PANEL = rgb(0.965, 0.97, 0.98);

/** The invoice as PDF bytes. hideContact masks the customer's phone and email. */
export async function renderInvoicePdf(d: InvoiceDocument, opts: { hideContact: boolean }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin1(`Invoice ${d.number} - ${d.shop.name}`));
  pdf.setAuthor(latin1(d.shop.name));
  pdf.setCreator('EuroWerken');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const accent = hexColor(d.shop.accent, rgb(0.11, 0.44, 0.94));
  const accentSoft = tint(accent, 0.9);
  const logo = await loadLogo(pdf, d.shop.logoUrl);

  const lines = d.lines;
  const subtotal = d.subtotal ?? Math.round(lines.reduce((a, l) => a + l.quantity * l.unit_price, 0) * 100) / 100;
  const gst = d.gst ?? Math.round(subtotal * d.gst_rate * 100) / 100;
  const taxLines: TaxLine[] = d.taxes && d.taxes.length ? d.taxes : [{ code: 'GST', label: 'GST', rate: d.gst_rate, amount: gst }];
  const taxTotal = Math.round(taxLines.reduce((a, l) => a + Math.round(l.amount * 100), 0)) / 100;
  const total = d.total ?? Math.round((subtotal + taxTotal) * 100) / 100;
  const paid = Number(d.amount_paid) || 0;
  const showPaid = paid > 0;
  const balance = d.balance !== null && d.balance !== undefined && Number.isFinite(Number(d.balance))
    ? Number(d.balance)
    : Math.round((total - paid) * 100) / 100;

  let page: PDFPage = pdf.addPage([W, H]);
  let y = 0;

  const t = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = BODY) =>
    page.drawText(latin1(s), { x, y: yy, size, font: f, color });
  const tr = (s: string, xr: number, yy: number, size: number, f: PDFFont = font, color: RGB = BODY) => {
    const v = latin1(s);
    page.drawText(v, { x: xr - f.widthOfTextAtSize(v, size), y: yy, size, font: f, color });
  };
  const fit = (s: string, f: PDFFont, size: number, width: number) => {
    let v = latin1(s);
    if (f.widthOfTextAtSize(v, size) <= width) return v;
    while (v.length > 1 && f.widthOfTextAtSize(`${v}...`, size) > width) v = v.slice(0, -1);
    return `${v}...`;
  };

  const continuation = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: accent });
    t(d.shop.name, M, H - 30, 9, bold, INK);
    tr(`Invoice ${d.number} (continued)`, W - M, H - 30, 9, font, MUTED);
    page.drawLine({ start: { x: M, y: H - 40 }, end: { x: W - M, y: H - 40 }, thickness: 0.6, color: RULE });
    y = H - 62;
  };
  const room = (h: number) => {
    if (y - h < 70) continuation();
  };

  // 1. Header ---------------------------------------------------------------------------------------------
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: accent });
  y = H - 46;
  let textX = M;
  if (logo) {
    const s = Math.min(46 / logo.height, 120 / logo.width);
    const lw = logo.width * s;
    const lh = logo.height * s;
    page.drawImage(logo, { x: M, y: y - lh + 18, width: lw, height: lh });
    textX = M + lw + 12;
  }
  t(fit(d.shop.name, bold, 20, 300 - (textX - M)), textX, y, 20, bold, INK);
  if (d.shop.tagline) t(fit(d.shop.tagline, italic, 9, 300 - (textX - M)), textX, y - 15, 9, italic, MUTED);

  tr('INVOICE', W - M, y + 2, 24, bold, accent);
  tr(d.number, W - M, y - 18, 12, bold, INK);
  if (d.void) tr('VOID', W - M, y - 34, 12, bold, rgb(0.8, 0.15, 0.15));

  y -= logo ? 40 : 36;
  const shopContact = [d.shop.address, [d.shop.phone, d.shop.email].filter(Boolean).join('   '), d.shop.website].filter(Boolean) as string[];
  for (const line of shopContact) {
    t(fit(line, font, 8.5, 300), M, y, 8.5, font, MUTED);
    y -= 11.5;
  }
  for (const line of registrationLines(d.registration)) {
    t(fit(line, font, 8, 300), M, y, 8, font, MUTED);
    y -= 11;
  }
  const meta: [string, string][] = [
    ['Issued', dateOnly(d.issued_at, d.timeZone)],
    ['Repair order', d.repair.number],
    ['Payment', showPaid && balance <= 0 ? 'Paid' : 'Due at pickup'],
  ];
  let my = H - 46 - (d.void ? 52 : 38);
  for (const [k, v] of meta) {
    tr(v, W - M, my, 8.5, bold, INK);
    tr(`${k}   `, W - M - bold.widthOfTextAtSize(latin1(v), 8.5), my, 8.5, font, MUTED);
    my -= 11.5;
  }
  y = Math.min(y, my) - 12;

  // 2. Bill to / Vehicle / Job panels ---------------------------------------------------------------------------
  const v = d.vehicle ?? {};
  const phone = opts.hideContact ? maskPhone(d.bill_to.phone) : (d.bill_to.phone ?? '');
  const email = opts.hideContact ? maskEmail(d.bill_to.email) : (d.bill_to.email ?? '');
  const panels: { title: string; first: string; rest: string[] }[] = [
    { title: 'BILL TO', first: d.bill_to.name || 'Customer', rest: [phone, email].filter(Boolean) },
    { title: 'VEHICLE', first: invoiceVehicleName(v), rest: [v.vin ? `VIN ${v.vin}` : '', v.plate ? `Plate ${v.plate}` : ''].filter(Boolean) },
    {
      title: 'JOB',
      first: `Repair ${d.repair.number}`,
      rest: [
        d.repair.checked_in_at ? `In: ${dateOnly(d.repair.checked_in_at, d.timeZone)}` : '',
        d.repair.completed_at ? `Done: ${dateOnly(d.repair.completed_at, d.timeZone)}` : '',
        d.repair.technician ? `Technician: ${d.repair.technician}` : '',
      ].filter(Boolean),
    },
  ];
  const gap = 10;
  const pw = (W - 2 * M - 2 * gap) / 3;
  const ph = 22 + 13 + Math.max(...panels.map((p) => p.rest.length)) * 11.5 + 8;
  panels.forEach((p, i) => {
    const x = M + i * (pw + gap);
    page.drawRectangle({ x, y: y - ph, width: pw, height: ph, color: PANEL, borderColor: RULE, borderWidth: 0.6 });
    page.drawRectangle({ x, y: y - ph, width: 3, height: ph, color: accent });
    t(p.title, x + 12, y - 15, 7, bold, accent);
    t(fit(p.first, bold, 10, pw - 20), x + 12, y - 29, 10, bold, INK);
    p.rest.forEach((r, j) => t(fit(r, font, 8.5, pw - 20), x + 12, y - 42 - j * 11.5, 8.5, font, BODY));
  });
  y -= ph + 18;
  if (opts.hideContact && (d.bill_to.phone || d.bill_to.email)) {
    t('Contact details are partly hidden for privacy.', M, y + 6, 7, italic, MUTED);
    y -= 14;
  }

  // 3. Customer concern ---------------------------------------------------------------------------------------------
  const section = (title: string) => {
    room(40);
    t(title, M, y, 10, bold, INK);
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 1.2, color: accent });
    y -= 22;
  };
  if (d.repair.customer_notes?.trim()) {
    section('Your concern');
    for (const l of wrap(d.repair.customer_notes, italic, 9, W - 2 * M - 10)) {
      room(14);
      t(l, M + 4, y, 9, italic, BODY);
      y -= 12.5;
    }
    y -= 10;
  }

  // 4. Work performed ------------------------------------------------------------------------------------------------
  section('Work performed');
  const cQty = 392;
  const cUnit = 478;
  const cAmt = W - M - 8;
  const descW = cQty - M - 50;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: accentSoft });
    t('DESCRIPTION', M + 8, y + 1, 7, bold, accent);
    tr('QTY', cQty, y + 1, 7, bold, accent);
    tr('UNIT PRICE', cUnit, y + 1, 7, bold, accent);
    tr('AMOUNT', cAmt, y + 1, 7, bold, accent);
    y -= 22;
  };
  head();
  const groups = KIND_ORDER.map((k) => ({ k, items: lines.filter((l) => l.kind === k) }))
    .concat([{ k: 'other', items: lines.filter((l) => !KIND_ORDER.includes(l.kind)) }])
    .filter((g) => g.items.length);
  if (groups.length === 0) {
    t('No charged work on this repair.', M + 8, y, 9, italic, MUTED);
    y -= 18;
  }
  let zebra = false;
  for (const g of groups) {
    room(34);
    if (y > H - 70) head();
    t((KIND_TITLE[g.k] ?? 'Other').toUpperCase(), M + 8, y, 7, bold, MUTED);
    y -= 13;
    for (const l of g.items) {
      const desc = wrap(l.taxable === false ? `${l.description} (no tax)` : l.description, font, 9, descW);
      const h = desc.length * 11.5 + 9;
      if (y - h < 70) {
        continuation();
        head();
      }
      if (zebra) page.drawRectangle({ x: M, y: y - h + 9, width: W - 2 * M, height: h, color: PANEL });
      zebra = !zebra;
      desc.forEach((s, i) => t(s, M + 8, y - i * 11.5, 9, font, INK));
      tr(String(Number(l.quantity)), cQty, y, 9, font, BODY);
      tr(money(l.unit_price), cUnit, y, 9, font, BODY);
      tr(money(l.quantity * l.unit_price), cAmt, y, 9, bold, INK);
      y -= h;
    }
    y -= 4;
  }

  // 5. Totals --------------------------------------------------------------------------------------------------------------
  room(62 + 15 * (taxLines.length + 1) + (showPaid ? 34 : 0));
  y -= 6;
  const bx = W - M - 220;
  const row = (label: string, value: string) => {
    t(label, bx + 12, y, 9, font, MUTED);
    tr(value, cAmt, y, 9, font, INK);
    y -= 15;
  };
  page.drawLine({ start: { x: bx, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.6, color: RULE });
  row('Subtotal', money(subtotal));
  for (const l of taxLines) row(formatTaxLabel(l, 'paren'), money(l.amount));
  y -= 4;
  page.drawRectangle({ x: bx, y: y - 16, width: W - M - bx, height: 28, color: accent });
  t('TOTAL', bx + 12, y - 6, 10, bold, rgb(1, 1, 1));
  tr(money(total), cAmt, y - 7, 14, bold, rgb(1, 1, 1));
  y -= 36;
  if (showPaid) {
    row('Paid', `-${money(paid)}`);
    t('Balance due', bx + 12, y, 10, bold, INK);
    tr(money(Math.max(balance, 0)), cAmt, y, 10, bold, INK);
    y -= 19;
  }
  y -= 8;

  // 6. Technician notes --------------------------------------------------------------------------------------------------
  if (d.notes.length) {
    y -= 6;
    section("Technician's notes");
    for (const n of d.notes) {
      const body = n.body?.trim() ? wrap(n.body, font, 9, W - 2 * M - 16) : [];
      room(26 + Math.min(body.length, 3) * 12);
      page.drawCircle({ x: M + 3, y: y + 3, size: 2.2, color: accent });
      t(fit(n.title, bold, 9, 360), M + 12, y, 9, bold, INK);
      tr(dateTime(n.at, d.timeZone), W - M, y, 8, font, MUTED);
      y -= 13;
      for (const b of body) {
        room(14);
        t(b, M + 12, y, 9, font, BODY);
        y -= 12;
      }
      y -= 8;
    }
  }

  // 7. Declined work, as recommendations -------------------------------------------------------------------------------------
  if (d.declined.length) {
    y -= 4;
    section('Recommended, not done');
    t('You chose not to have this work done this time. Ask us about it on your next visit.', M, y, 8.5, italic, MUTED);
    y -= 16;
    for (const l of d.declined) {
      const desc = wrap(l.description, font, 9, descW);
      room(desc.length * 11.5 + 8);
      desc.forEach((s, i) => t(s, M + 8, y - i * 11.5, 9, font, BODY));
      tr(money(l.quantity * l.unit_price), cAmt, y, 9, font, MUTED);
      y -= desc.length * 11.5 + 6;
    }
  }

  // 8. Thank you ----------------------------------------------------------------------------------------------------------------
  room(60);
  y -= 14;
  page.drawRectangle({ x: M, y: y - 30, width: W - 2 * M, height: 40, color: accentSoft });
  t(`Thank you for choosing ${d.shop.name}.`, M + 14, y - 6, 11, bold, INK);
  const contactLine = ['Questions about this invoice?', d.shop.phone ? `Call ${d.shop.phone}` : '', d.shop.email ? `or email ${d.shop.email}` : '']
    .filter(Boolean)
    .join(' ');
  t(fit(contactLine, font, 8.5, W - 2 * M - 28), M + 14, y - 21, 8.5, font, BODY);

  // Footer on every page.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: RULE });
    p.drawText(latin1(`${d.shop.name}  |  Invoice ${d.number}`), { x: M, y: 30, size: 7.5, font, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7.5), y: 30, size: 7.5, font, color: MUTED });
  });

  return await pdf.save();
}

/** A safe file name: "Invoice-INV-0001-EuroWorks.pdf". */
export function invoicePdfName(d: Pick<InvoiceDocument, 'number' | 'shop'>): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Invoice-${clean(d.number)}-${clean(d.shop.name).slice(0, 40)}.pdf`;
}

/**
 * The logo for documents: the shop's document logo, else its website logo (used only if it is PNG or JPEG), or none
 * when the shop has turned the logo off. Works on a workshop_sites row (migration 025 adds the two document columns).
 */
export function documentLogoUrl(site: Record<string, unknown> | null | undefined): string | null {
  if (!site || site.document_show_logo === false) return null;
  const doc = typeof site.document_logo_url === 'string' ? site.document_logo_url : '';
  const web = typeof site.logo_url === 'string' ? site.logo_url : '';
  return doc || web || null;
}

// Loading ----------------------------------------------------------------------------------------------------------------

/** The part of a Supabase client this file uses (both apps pass their own client; RLS decides what is visible). */
interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

type Row = Record<string, unknown>;

/** A numeric column that may not exist yet (null when absent or not a number). */
function optionalNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Everything the invoice shows, read with the caller's own access: staff of the workshop, or the customer the
 * invoice belongs to. Throws with a short message when the invoice cannot be read.
 */
export async function loadInvoiceDocument(db: Db, invoiceId: string): Promise<InvoiceDocument> {
  const { data: inv, error } = await db.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error('Invoice not found.');
  const i = inv as Row;
  const [ro, items, events, site, booking, taxes] = await Promise.all([
    db.from('repair_orders').select('number, tracking_code, created_at, completed_at, customer_notes, technician_id').eq('id', i.repair_order_id).maybeSingle(),
    db.from('repair_order_items').select('kind, description, quantity, unit_price, approval, sort_order, created_at').eq('repair_order_id', i.repair_order_id),
    db.from('repair_order_events').select('kind, title, body, created_at, visible_to_customer').eq('repair_order_id', i.repair_order_id).eq('kind', 'note').eq('visible_to_customer', true).order('created_at'),
    db.from('workshop_sites').select('*').eq('workshop_id', i.workshop_id).maybeSingle(),
    db.from('booking_settings').select('time_zone').eq('workshop_id', i.workshop_id).maybeSingle(),
    // Migration 029; before it (or without access) the invoice simply prints no registration numbers.
    db.from('workshop_tax_settings').select('registration').eq('workshop_id', i.workshop_id).maybeSingle(),
  ]);
  const r = (ro.data ?? {}) as Row;
  let technician: string | null = null;
  if (r.technician_id) {
    const { data: tm } = await db.from('team_members').select('name').eq('id', r.technician_id).maybeSingle();
    technician = ((tm as Row | null)?.name as string) ?? null;
  }
  const s = (site.data ?? {}) as Row;
  const toLine = (l: Row): InvoiceLineItem => ({
    kind: String(l.kind ?? ''),
    description: String(l.description ?? ''),
    quantity: Number(l.quantity) || 0,
    unit_price: Number(l.unit_price) || 0,
    ...(l.taxable === false ? { taxable: false } : {}),
  });
  const allItems = ((items.data ?? []) as Row[]).sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.created_at).localeCompare(String(b.created_at)),
  );
  const bill = (i.bill_to ?? {}) as Row;
  return {
    shop: {
      name: String(s.display_name ?? 'Workshop'),
      tagline: (s.tagline as string) ?? null,
      address: (s.address as string) ?? null,
      phone: (s.phone as string) ?? null,
      email: (s.email as string) ?? null,
      accent: (s.accent_color as string) ?? null,
      logoUrl: documentLogoUrl(s),
    },
    number: String(i.number),
    issued_at: String(i.issued_at),
    void: i.status === 'void',
    timeZone: String(((booking.data ?? {}) as Row).time_zone ?? 'America/Edmonton'),
    bill_to: { name: (bill.name as string) ?? null, email: (bill.email as string) ?? null, phone: (bill.phone as string) ?? null },
    vehicle: (i.vehicle ?? {}) as InvoiceVehicle,
    repair: {
      number: String(r.number ?? ''),
      tracking_code: (r.tracking_code as string) ?? null,
      checked_in_at: (r.created_at as string) ?? null,
      completed_at: (r.completed_at as string) ?? null,
      technician,
      customer_notes: (r.customer_notes as string) ?? null,
    },
    lines: ((i.lines ?? []) as Row[]).map(toLine),
    declined: allItems.filter((l) => l.approval === 'declined').map(toLine),
    notes: ((events.data ?? []) as Row[]).map((e) => ({ title: String(e.title ?? ''), body: (e.body as string) ?? null, at: String(e.created_at) })),
    gst_rate: i.gst_rate === null || i.gst_rate === undefined ? 0.05 : Number(i.gst_rate) || 0,
    subtotal: Number(i.subtotal) || 0,
    gst: Number(i.gst) || 0,
    total: Number(i.total) || 0,
    taxes: invoiceTaxLines(i),
    registration: taxes && !taxes.error ? parseRegistration(((taxes.data ?? {}) as Row).registration) : null,
    amount_paid: optionalNumber(i.amount_paid),
    balance: optionalNumber(i.balance),
    payment_status: typeof i.payment_status === 'string' ? i.payment_status : null,
  };
}

// Browser helpers ----------------------------------------------------------------------------------------------------------

/** Save the PDF as a file. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Open the browser's print dialog for the PDF from a hidden frame. If the browser will not print the frame, the PDF
 * opens in a new tab to print from there; if that is blocked too, the promise rejects with a message to show.
 */
export function printPdf(bytes: Uint8Array): Promise<void> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  let settled = false;
  const cleanup = (delay: number) =>
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, delay);
  return new Promise<void>((resolve, reject) => {
    const fallback = () => {
      if (settled) return;
      settled = true;
      const tab = window.open(url, '_blank');
      if (!tab) {
        cleanup(0);
        reject(new Error('Your browser blocked printing. Allow pop-ups for this site, or use Download PDF and print the file.'));
        return;
      }
      cleanup(120_000);
      resolve();
    };
    const timer = window.setTimeout(fallback, 10_000);
    frame.onload = () => {
      window.clearTimeout(timer);
      if (settled) return;
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error('no frame');
        win.focus();
        win.print();
        settled = true;
        cleanup(120_000);
        resolve();
      } catch {
        fallback();
      }
    };
    frame.src = url;
    document.body.appendChild(frame);
  });
}
