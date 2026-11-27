/**
 * The purchase order PDF, in the same style as the invoice (packages/shared/src/invoicePdf.ts): accent bar, shop
 * header with logo, panels, a lines table and a total. Used for Download PDF and for the copy emailed to the
 * supplier. Load it lazily (api/purchaseOrders.ts does), so pdf-lib only loads when someone asks for a PDF.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import { documentLogoUrl, downloadPdf } from '@eurowerken/shared/invoice-pdf';

// Data ---------------------------------------------------------------------------------------------------------

export interface PoDocument {
  shop: {
    name: string;
    tagline?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    accent?: string | null;
    logoUrl?: string | null;
  };
  number: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  /** yyyy-mm-dd */
  expected_at: string | null;
  timeZone: string;
  supplier: {
    name: string;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    account_number?: string | null;
    address?: string | null;
  };
  repair: { number: string; vehicle: string | null; vin: string | null } | null;
  lines: { description: string; part_number: string | null; quantity: number; unit_cost: number }[];
  notes: string | null;
}

// The part of a Supabase client this file uses (RLS decides what is visible).
interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

type Row = Record<string, unknown>;

/** Everything the PDF shows, read with the user's own access. */
export async function loadPoDocument(db: Db, poId: string): Promise<PoDocument> {
  const { data: po, error } = await db.from('purchase_orders').select('*').eq('id', poId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!po) throw new Error('Purchase order not found.');
  const p = po as Row;
  const [sup, lines, site, booking, ro] = await Promise.all([
    db.from('suppliers').select('*').eq('id', p.supplier_id).maybeSingle(),
    db.from('purchase_order_lines').select('description, part_number, quantity, unit_cost, sort_order, created_at').eq('po_id', poId),
    db.from('workshop_sites').select('*').eq('workshop_id', p.workshop_id).maybeSingle(),
    db.from('booking_settings').select('time_zone').eq('workshop_id', p.workshop_id).maybeSingle(),
    p.repair_order_id
      ? db.from('repair_orders').select('number, vehicle').eq('id', p.repair_order_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (lines.error) throw new Error(lines.error.message);
  const s = (site.data ?? {}) as Row;
  const su = (sup.data ?? {}) as Row;
  const r = ro.data as Row | null;
  const v = (r?.vehicle ?? {}) as Row;
  const car = [v.year, v.make, v.model].filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' ');
  const sorted = ((lines.data ?? []) as Row[]).sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.created_at).localeCompare(String(b.created_at)),
  );
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
    number: String(p.number),
    status: String(p.status),
    created_at: String(p.created_at),
    sent_at: (p.sent_at as string) ?? null,
    expected_at: (p.expected_at as string) ?? null,
    timeZone: String(((booking.data ?? {}) as Row).time_zone ?? 'America/Edmonton'),
    supplier: {
      name: String(su.name ?? 'Supplier'),
      contact_name: (su.contact_name as string) ?? null,
      email: (su.email as string) ?? null,
      phone: (su.phone as string) ?? null,
      account_number: (su.account_number as string) ?? null,
      address: (su.address as string) ?? null,
    },
    repair: r ? { number: String(r.number ?? ''), vehicle: car || null, vin: (v.vin as string) || null } : null,
    lines: sorted.map((l) => ({
      description: String(l.description ?? ''),
      part_number: (l.part_number as string) ?? null,
      quantity: Number(l.quantity) || 0,
      unit_cost: Number(l.unit_cost) || 0,
    })),
    notes: (p.notes as string) ?? null,
  };
}

// Formatting -----------------------------------------------------------------------------------------------------

function money(n: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function dateOnly(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  // A bare date (yyyy-mm-dd) is read at noon UTC so no time zone moves it to another day.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  try {
    return d.toLocaleDateString('en-CA', { timeZone, year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
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

// Rendering --------------------------------------------------------------------------------------------------------

const W = 612; // US Letter
const H = 792;
const M = 44;
const INK = rgb(0.07, 0.09, 0.15);
const BODY = rgb(0.22, 0.25, 0.32);
const MUTED = rgb(0.45, 0.48, 0.54);
const RULE = rgb(0.89, 0.9, 0.92);
const PANEL = rgb(0.965, 0.97, 0.98);

export async function renderPoPdf(d: PoDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin1(`Purchase order ${d.number} - ${d.shop.name}`));
  pdf.setAuthor(latin1(d.shop.name));
  pdf.setCreator('EuroWerken');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const accent = hexColor(d.shop.accent, rgb(0.11, 0.44, 0.94));
  const accentSoft = tint(accent, 0.9);
  const logo = await loadLogo(pdf, d.shop.logoUrl);
  const total = Math.round(d.lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0) * 100) / 100;

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
    tr(`Purchase order ${d.number} (continued)`, W - M, H - 30, 9, font, MUTED);
    page.drawLine({ start: { x: M, y: H - 40 }, end: { x: W - M, y: H - 40 }, thickness: 0.6, color: RULE });
    y = H - 62;
  };
  const room = (h: number) => {
    if (y - h < 70) continuation();
  };

  // 1. Header
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
  tr('PURCHASE ORDER', W - M, y + 2, 20, bold, accent);
  tr(d.number, W - M, y - 18, 12, bold, INK);
  if (d.status === 'cancelled') tr('CANCELLED', W - M, y - 34, 12, bold, rgb(0.8, 0.15, 0.15));

  y -= logo ? 40 : 36;
  const shopContact = [d.shop.address, [d.shop.phone, d.shop.email].filter(Boolean).join('   ')].filter(Boolean) as string[];
  for (const line of shopContact) {
    t(fit(line, font, 8.5, 300), M, y, 8.5, font, MUTED);
    y -= 11.5;
  }
  const meta: [string, string][] = [
    ['Date', dateOnly(d.sent_at ?? d.created_at, d.timeZone)],
    ...(d.expected_at ? ([['Needed by', dateOnly(d.expected_at, d.timeZone)]] as [string, string][]) : []),
    ...(d.supplier.account_number ? ([['Account', d.supplier.account_number]] as [string, string][]) : []),
  ];
  let my = H - 46 - (d.status === 'cancelled' ? 52 : 38);
  for (const [k, v] of meta) {
    tr(v, W - M, my, 8.5, bold, INK);
    tr(`${k}   `, W - M - bold.widthOfTextAtSize(latin1(v), 8.5), my, 8.5, font, MUTED);
    my -= 11.5;
  }
  y = Math.min(y, my) - 12;

  // 2. Supplier / Ship to / For panels
  const panels: { title: string; first: string; rest: string[] }[] = [
    {
      title: 'SUPPLIER',
      first: d.supplier.name,
      rest: [d.supplier.contact_name ? `Attn: ${d.supplier.contact_name}` : '', d.supplier.phone ?? '', d.supplier.email ?? ''].filter(Boolean),
    },
    { title: 'DELIVER TO', first: d.shop.name, rest: [d.shop.address ?? '', d.shop.phone ?? ''].filter(Boolean) },
  ];
  if (d.repair) {
    panels.push({
      title: 'FOR',
      first: `Repair ${d.repair.number}`,
      rest: [d.repair.vehicle ?? '', d.repair.vin ? `VIN ${d.repair.vin}` : ''].filter(Boolean),
    });
  }
  const gap = 10;
  const pw = (W - 2 * M - (panels.length - 1) * gap) / panels.length;
  const ph = 22 + 13 + Math.max(...panels.map((p) => p.rest.length)) * 11.5 + 8;
  panels.forEach((p, i) => {
    const x = M + i * (pw + gap);
    page.drawRectangle({ x, y: y - ph, width: pw, height: ph, color: PANEL, borderColor: RULE, borderWidth: 0.6 });
    page.drawRectangle({ x, y: y - ph, width: 3, height: ph, color: accent });
    t(p.title, x + 12, y - 15, 7, bold, accent);
    t(fit(p.first, bold, 10, pw - 20), x + 12, y - 29, 10, bold, INK);
    p.rest.forEach((r, j) => t(fit(r, font, 8.5, pw - 20), x + 12, y - 42 - j * 11.5, 8.5, font, BODY));
  });
  y -= ph + 22;

  // 3. Lines
  t('Parts ordered', M, y, 10, bold, INK);
  page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 1.2, color: accent });
  y -= 22;
  const cPn = 300;
  const cQty = 420;
  const cUnit = 490;
  const cAmt = W - M - 8;
  const descW = cPn - M - 16;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: accentSoft });
    t('DESCRIPTION', M + 8, y + 1, 7, bold, accent);
    t('PART NUMBER', cPn, y + 1, 7, bold, accent);
    tr('QTY', cQty, y + 1, 7, bold, accent);
    tr('UNIT COST', cUnit, y + 1, 7, bold, accent);
    tr('AMOUNT', cAmt, y + 1, 7, bold, accent);
    y -= 22;
  };
  head();
  if (d.lines.length === 0) {
    t('No lines yet.', M + 8, y, 9, italic, MUTED);
    y -= 18;
  }
  let zebra = false;
  for (const l of d.lines) {
    const desc = wrap(l.description, font, 9, descW);
    const h = desc.length * 11.5 + 9;
    if (y - h < 70) {
      continuation();
      head();
    }
    if (zebra) page.drawRectangle({ x: M, y: y - h + 9, width: W - 2 * M, height: h, color: PANEL });
    zebra = !zebra;
    desc.forEach((s, i) => t(s, M + 8, y - i * 11.5, 9, font, INK));
    if (l.part_number) t(fit(l.part_number, font, 8.5, cQty - cPn - 40), cPn, y, 8.5, font, BODY);
    tr(qty(l.quantity), cQty, y, 9, font, BODY);
    tr(l.unit_cost > 0 ? money(l.unit_cost) : '-', cUnit, y, 9, font, BODY);
    tr(l.unit_cost > 0 ? money(l.quantity * l.unit_cost) : '-', cAmt, y, 9, bold, INK);
    y -= h;
  }

  // 4. Total
  room(60);
  y -= 6;
  const bx = W - M - 220;
  page.drawRectangle({ x: bx, y: y - 16, width: W - M - bx, height: 28, color: accent });
  t('ESTIMATED TOTAL', bx + 12, y - 6, 9, bold, rgb(1, 1, 1));
  tr(money(total), cAmt, y - 7, 14, bold, rgb(1, 1, 1));
  y -= 30;
  tr('Before tax. Prices as quoted by the supplier.', W - M, y, 7.5, italic, MUTED);
  y -= 20;

  // 5. Notes
  if (d.notes?.trim()) {
    room(40);
    t('Notes', M, y, 10, bold, INK);
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 1.2, color: accent });
    y -= 22;
    for (const l of wrap(d.notes, font, 9, W - 2 * M - 10)) {
      room(14);
      t(l, M + 4, y, 9, font, BODY);
      y -= 12.5;
    }
    y -= 10;
  }

  // 6. Closing
  room(60);
  y -= 6;
  page.drawRectangle({ x: M, y: y - 30, width: W - 2 * M, height: 40, color: accentSoft });
  t(`Please quote ${d.number} on your invoice and packing slip.`, M + 14, y - 6, 11, bold, INK);
  const contactLine = ['Questions about this order?', d.shop.phone ? `Call ${d.shop.phone}` : '', d.shop.email ? `or email ${d.shop.email}` : '']
    .filter(Boolean)
    .join(' ');
  t(fit(contactLine, font, 8.5, W - 2 * M - 28), M + 14, y - 21, 8.5, font, BODY);

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: RULE });
    p.drawText(latin1(`${d.shop.name}  |  Purchase order ${d.number}`), { x: M, y: 30, size: 7.5, font, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7.5), y: 30, size: 7.5, font, color: MUTED });
  });
  return await pdf.save();
}

/** "Purchase-order-PO-0001-EuroWerken.pdf" (the mailer names the emailed copy the same way). */
export function poPdfName(d: Pick<PoDocument, 'number' | 'shop'>): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Purchase-order-${clean(d.number)}-${clean(d.shop.name).slice(0, 40)}.pdf`;
}

export async function savePdf(bytes: Uint8Array, fileName: string): Promise<void> {
  downloadPdf(bytes, fileName);
}
