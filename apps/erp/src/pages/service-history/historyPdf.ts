/**
 * The service history as a PDF (jsPDF, loaded on demand so it stays out of the main bundle).
 *
 * The PDF may be handed to the customer, so it leaves out everything the team keeps to itself: team-only
 * timeline entries, staff notes and the notes on phone approvals. It also leaves out photos and conversations:
 * the record is the work, the approvals and the timeline. The shop's document logo (Settings, Documents) heads it.
 *
 * buildHistoryPdf lays the whole document out first (so the caller can read the page count and warn about a
 * very long one), then a second pass writes "Page X of Y" and a running header on every page.
 */
import type { jsPDF } from 'jspdf';
import { dayKeyOf, formatDateTime } from '@/api/appointments';
import { REPAIR_STATUS_LABEL, lineTotal, repairTotals } from '@/api/repairOrders';
import { HISTORY_ITEM_LABEL } from '@/api/serviceHistory';
import type { HistoryRepair, HistorySummary, ServiceHistory } from '@/api/serviceHistory';
import { formatCurrency } from '@/lib/format';

export interface BuiltPdf {
  doc: jsPDF;
  pages: number;
}

// Page geometry (points; Letter is 612 x 792) ----------------------------------------------------------

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Where content starts on pages after the first (below the running header). */
const TOP = MARGIN + 22;
/** Content stops here; the footer sits below. */
const BOTTOM = PAGE_H - MARGIN - 14;

type Rgb = [number, number, number];
const INK: Rgb = [24, 28, 36];
const MUTED: Rgb = [100, 108, 120];
const RULE: Rgb = [214, 219, 226];
const SHADE: Rgb = [241, 243, 246];
const OK: Rgb = [21, 128, 61];
const BAD: Rgb = [185, 28, 28];
const WARN: Rgb = [180, 83, 9];
const STATE_COLOR = { approved: OK, declined: BAD, pending: WARN } as const;

// Text -----------------------------------------------------------------------------------------------

const REPLACE: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '•': '-',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
};

/** Helvetica in jsPDF knows Latin-1 only: map common punctuation, replace anything else. */
function clean(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’“”–—…•   ]/g, (c) => REPLACE[c] ?? ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?');
}

// Logo -----------------------------------------------------------------------------------------------

interface LoadedLogo {
  data: string;
  width: number;
  height: number;
}

/** The shop's document logo as a PNG data URL (any image the browser can draw), or null. */
async function loadLogo(url: string | null | undefined): Promise<LoadedLogo | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const objectUrl = URL.createObjectURL(await res.blob());
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      const scale = Math.min(1, 400 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);
      return { data: canvas.toDataURL('image/png'), width, height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

// Layout ---------------------------------------------------------------------------------------------

interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: Rgb;
  x?: number;
  width?: number;
  /** Extra space after the block. */
  after?: number;
  align?: 'left' | 'right' | 'center';
}

class Writer {
  y: number;

  constructor(readonly doc: jsPDF) {
    this.y = MARGIN;
  }

  newPage() {
    this.doc.addPage('letter', 'portrait');
    this.y = TOP;
  }

  /** Starts a new page when the next h points do not fit. */
  ensure(h: number) {
    if (this.y + h > BOTTOM) this.newPage();
  }

  gap(h: number) {
    this.y += h;
  }

  font(size: number, bold = false, color: Rgb = INK) {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  lineHeight(size: number) {
    return size * 1.32;
  }

  /** Wrapped lines of text at the current font. */
  wrap(text: string, width: number): string[] {
    const out: string[] = [];
    for (const para of clean(text).split('\n')) {
      if (para.trim() === '') out.push('');
      else out.push(...(this.doc.splitTextToSize(para, width) as string[]));
    }
    return out;
  }

  /** Writes wrapped text, breaking pages between lines. */
  text(text: string, style: TextStyle = {}) {
    const size = style.size ?? 9.5;
    const x = style.x ?? MARGIN;
    const width = style.width ?? CONTENT_W - (x - MARGIN);
    this.font(size, style.bold, style.color);
    const lh = this.lineHeight(size);
    for (const line of this.wrap(text, width)) {
      if (this.y + lh > BOTTOM) {
        this.newPage();
        this.font(size, style.bold, style.color);
      }
      const ax = style.align === 'right' ? x + width : style.align === 'center' ? x + width / 2 : x;
      this.doc.text(line, ax, this.y, { baseline: 'top', align: style.align ?? 'left' });
      this.y += lh;
    }
    this.y += style.after ?? 0;
  }

  /** "Label: value" with a bold label, wrapped. */
  field(label: string, value: string, style: TextStyle = {}) {
    const size = style.size ?? 9.5;
    const x = style.x ?? MARGIN;
    const width = style.width ?? CONTENT_W - (x - MARGIN);
    this.font(size, true, style.color);
    const lw = this.doc.getTextWidth(`${clean(label)}: `);
    this.font(size, false, style.color);
    const lines = this.wrap(value, width - lw);
    const lh = this.lineHeight(size);
    lines.forEach((line, i) => {
      if (this.y + lh > BOTTOM) this.newPage();
      if (i === 0) {
        this.font(size, true, style.color);
        this.doc.text(`${clean(label)}:`, x, this.y, { baseline: 'top' });
      }
      this.font(size, false, style.color);
      this.doc.text(line, x + lw, this.y, { baseline: 'top' });
      this.y += lh;
    });
    this.y += style.after ?? 0;
  }

  rule(color: Rgb = RULE, width = 0.6) {
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(width);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
  }

  /** A small section heading that never sits alone at the foot of a page. */
  heading(text: string) {
    this.ensure(40);
    this.gap(6);
    this.text(text.toUpperCase(), { size: 8, bold: true, color: MUTED, after: 3 });
  }
}

// Items table ----------------------------------------------------------------------------------------

const COLS = [
  { key: 'desc', label: 'Item', w: 232, align: 'left' },
  { key: 'state', label: 'Status', w: 64, align: 'left' },
  { key: 'qty', label: 'Qty', w: 46, align: 'right' },
  { key: 'unit', label: 'Unit price', w: 80, align: 'right' },
  { key: 'total', label: 'Total', w: CONTENT_W - 232 - 64 - 46 - 80, align: 'right' },
] as const;
const CELL_PAD = 5;
const TABLE_SIZE = 8.5;

function colX(index: number): number {
  let x = MARGIN;
  for (let i = 0; i < index; i += 1) x += COLS[i].w;
  return x;
}

function tableHeader(w: Writer) {
  const { doc } = w;
  const h = 16;
  doc.setFillColor(SHADE[0], SHADE[1], SHADE[2]);
  doc.rect(MARGIN, w.y, CONTENT_W, h, 'F');
  w.font(7.5, true, MUTED);
  COLS.forEach((c, i) => {
    const x = c.align === 'right' ? colX(i) + c.w - CELL_PAD : colX(i) + CELL_PAD;
    doc.text(c.label.toUpperCase(), x, w.y + 4.5, { baseline: 'top', align: c.align });
  });
  w.y += h;
}

function itemsTable(w: Writer, r: HistoryRepair) {
  const { doc } = w;
  const lh = w.lineHeight(TABLE_SIZE);
  w.ensure(16 + lh + 10);
  tableHeader(w);
  for (const item of r.items) {
    w.font(TABLE_SIZE);
    const lines = w.wrap(item.description || 'Item', COLS[0].w - CELL_PAD * 2);
    const declined = item.approval === 'declined';
    // A very long description is split across pages; each part gets the header again.
    let start = 0;
    while (start < lines.length) {
      const room = Math.floor((BOTTOM - w.y - 8) / lh);
      if (room < 1) {
        w.newPage();
        tableHeader(w);
        continue;
      }
      const part = lines.slice(start, start + room);
      const rowH = part.length * lh + 8;
      const top = w.y + 4;
      w.font(TABLE_SIZE, false, declined ? MUTED : INK);
      part.forEach((line, i) => {
        const ly = top + i * lh;
        doc.text(line, MARGIN + CELL_PAD, ly, { baseline: 'top' });
        if (declined && line.trim()) {
          const tw = doc.getTextWidth(line);
          doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2]);
          doc.setLineWidth(0.6);
          doc.line(MARGIN + CELL_PAD, ly + TABLE_SIZE * 0.55, MARGIN + CELL_PAD + tw, ly + TABLE_SIZE * 0.55);
        }
      });
      if (start === 0) {
        const color = STATE_COLOR[item.approval];
        w.font(TABLE_SIZE, true, color);
        doc.text(HISTORY_ITEM_LABEL[item.approval], colX(1) + CELL_PAD, top, { baseline: 'top' });
        w.font(TABLE_SIZE, false, declined ? MUTED : INK);
        const right = (i: number, s: string) => doc.text(s, colX(i) + COLS[i].w - CELL_PAD, top, { baseline: 'top', align: 'right' });
        right(2, clean(String(item.quantity)));
        right(3, clean(formatCurrency(item.unit_price)));
        right(4, clean(formatCurrency(lineTotal(item))));
      }
      w.y += rowH;
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, w.y, PAGE_W - MARGIN, w.y);
      start += part.length;
    }
  }

  const t = repairTotals(r.items);
  const rows: [string, string, boolean][] = [
    ['Approved work', formatCurrency(t.subtotal), false],
    ['GST (5%)', formatCurrency(t.gst), false],
    ['Total', formatCurrency(t.total), true],
  ];
  if (t.pending > 0) rows.push(['Waiting for approval (not included)', formatCurrency(t.pending), false]);
  w.ensure(rows.length * 13 + 8);
  w.gap(5);
  for (const [label, value, strong] of rows) {
    w.font(strong ? 9.5 : 8.5, strong, strong ? INK : MUTED);
    doc.text(clean(label), PAGE_W - MARGIN - 110, w.y, { baseline: 'top', align: 'right' });
    w.font(strong ? 9.5 : 8.5, strong, INK);
    doc.text(clean(value), PAGE_W - MARGIN - CELL_PAD, w.y, { baseline: 'top', align: 'right' });
    w.y += 13;
  }
}

// The document ---------------------------------------------------------------------------------------

function firstPageHeader(w: Writer, history: ServiceHistory, summary: HistorySummary, tz: string, logo: LoadedLogo | null) {
  const ws = history.workshop;
  const top = w.y;
  let logoBottom = top;
  if (logo) {
    const s = Math.min(40 / logo.height, 140 / logo.width);
    w.doc.addImage(logo.data, 'PNG', PAGE_W - MARGIN - logo.width * s, top, logo.width * s, logo.height * s, undefined, 'FAST');
    logoBottom = top + logo.height * s;
  }
  w.text(ws.name || 'Workshop', { size: 13, bold: true });
  const contact = [ws.address, ws.phone, ws.email].filter(Boolean).join('  |  ');
  if (contact) w.text(contact, { size: 8.5, color: MUTED });
  // The rule below the header clears the logo.
  if (w.y < logoBottom) w.y = logoBottom;
  w.gap(10);
  w.rule(INK, 1);
  w.gap(14);
  w.text('Service history', { size: 20, bold: true, after: 6 });
  w.text(summary.label, { size: 12, bold: true, after: 3 });
  const ids = [summary.vin && `VIN ${summary.vin}`, summary.plate && `Plate ${summary.plate}`].filter(Boolean).join('    ');
  if (ids) w.text(ids, { size: 9.5, after: 2 });
  if (summary.owner) w.field('Owner', summary.owner, { after: 2 });
  w.field('Visits', String(summary.visits), { after: 2 });
  w.text(`Generated ${formatDateTime(new Date().toISOString(), tz)}`, { size: 8.5, color: MUTED });
  w.gap(10);
}

function repairSection(w: Writer, r: HistoryRepair, tz: string) {
  const { doc } = w;
  w.ensure(90);
  w.rule();
  w.gap(10);

  // Number and status on one line.
  w.font(13, true);
  const number = clean(r.number || 'Repair');
  doc.text(number, MARGIN, w.y, { baseline: 'top' });
  w.font(9, true, r.status === 'cancelled' ? MUTED : r.status === 'completed' ? OK : WARN);
  doc.text(clean(REPAIR_STATUS_LABEL[r.status] ?? r.status), PAGE_W - MARGIN, w.y + 2, { baseline: 'top', align: 'right' });
  w.y += 19;

  const facts = [
    `Checked in ${formatDateTime(r.created_at, tz)}`,
    r.completed_at ? `Completed ${formatDateTime(r.completed_at, tz)}` : null,
    r.technician ? `Technician ${r.technician}` : null,
  ].filter(Boolean);
  w.text(facts.join('   |   '), { size: 8.5, color: MUTED, after: 4 });
  if (r.customer_notes) w.field('Customer notes', r.customer_notes, { size: 9, after: 2 });

  if (r.items.length > 0) {
    w.heading('Work');
    itemsTable(w, r);
  }

  if (r.approvals.length > 0) {
    w.heading('Approvals');
    for (const a of r.approvals) {
      const how = a.method === 'phone' ? 'by phone' : 'online';
      const who = a.method === 'online' && a.customer_email ? `, ${a.customer_email}` : '';
      // Phone approvals carry a staff note: left out of the PDF.
      w.text(`${a.decision === 'approved' ? 'Approved' : 'Declined'} ${how}: ${a.item_description} (${formatDateTime(a.decided_at, tz)}${who})`, {
        size: 8.5,
        after: 1.5,
      });
    }
  }

  const events = r.events.filter((e) => e.visible_to_customer);
  if (events.length > 0) {
    w.heading('Timeline');
    for (const e of events) {
      w.ensure(26);
      w.text(`${formatDateTime(e.created_at, tz)}  ${e.title}`, { size: 8.5, bold: true });
      if (e.body) w.text(e.body, { size: 8.5, x: MARGIN + 10, color: MUTED });
      w.gap(2);
    }
  }

  w.gap(14);
}

/** Running header (pages 2 on) and "Page X of Y" on every page. Done after layout, when Y is known. */
function decorate(doc: jsPDF, history: ServiceHistory, summary: HistorySummary) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    if (i > 1) {
      const left = clean(`${history.workshop.name || 'Workshop'}  |  Service history`);
      const right = clean([summary.label, summary.plate || summary.vin].filter(Boolean).join('  |  '));
      doc.text(left, MARGIN, MARGIN, { baseline: 'top' });
      doc.text(right, PAGE_W - MARGIN, MARGIN, { baseline: 'top', align: 'right' });
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, MARGIN + 12, PAGE_W - MARGIN, MARGIN + 12);
    }
    doc.text(`Page ${i} of ${total}`, PAGE_W / 2, PAGE_H - MARGIN + 6, { baseline: 'top', align: 'center' });
  }
}

/** Lays out the whole history: the work, approvals and timeline of each repair (no photos or conversations). */
export async function buildHistoryPdf(
  history: ServiceHistory,
  summary: HistorySummary,
  tz: string,
  opts: { logoUrl?: string | null } = {},
): Promise<BuiltPdf> {
  const [{ jsPDF: JsPdf }, logo] = await Promise.all([import('jspdf'), loadLogo(opts.logoUrl)]);
  const doc = new JsPdf({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
  doc.setProperties({ title: clean(`Service history - ${summary.label}`), creator: clean(history.workshop.name || 'EuroWerken') });
  const w = new Writer(doc);
  firstPageHeader(w, history, summary, tz, logo);
  if (history.repairs.length === 0) w.text('No repairs on record.', { color: MUTED });
  for (const r of history.repairs) repairSection(w, r, tz);
  decorate(doc, history, summary);
  return { doc, pages: doc.getNumberOfPages() };
}

// Saving and printing --------------------------------------------------------------------------------

/** service-history-<plate, VIN or RO number>-<YYYY-MM-DD>.pdf, letters, digits and dashes only. */
export function historyFileName(summary: HistorySummary, tz: string): string {
  const id = (summary.plate || summary.vin || summary.latestNumber || 'vehicle')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `service-history-${id || 'vehicle'}-${dayKeyOf(new Date(), tz)}.pdf`;
}

/** Saves the PDF through a temporary link; the object URL is revoked afterwards. */
export function downloadPdf(doc: jsPDF, fileName: string) {
  const url = URL.createObjectURL(doc.output('blob'));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Opens the print dialog for the PDF from a hidden frame. When the browser will not print the frame (some
 * block it, or never load PDFs in frames), the PDF opens in a new tab instead, to print from there.
 */
export function printPdf(doc: jsPDF): Promise<void> {
  const url = URL.createObjectURL(doc.output('blob'));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
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
        reject(new Error('The PDF could not be opened for printing. Allow pop-ups for this site, or use Download PDF and print the file.'));
        return;
      }
      // Give the new tab time to load the PDF before the URL is released.
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
        // The dialog may stay open a while; keep the frame until it is surely done with.
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
