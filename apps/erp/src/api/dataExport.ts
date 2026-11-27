/**
 * "Download all your data": every table of the workshop as UTF-8 CSV files in one .zip, with a README.txt that
 * says what each file holds. Reads go through row level security with the signed-in user's own access, page by
 * page (1000 rows a request) so nothing is cut off. Tables that are not in the database yet (an optional module
 * whose migration has not been applied) are skipped and listed in the README.
 *
 * CSV: RFC 4180 (comma, double quotes doubled, CRLF line ends) with a byte order mark so Excel reads UTF-8. A text
 * cell that starts with = + - @ (or a tab / carriage return) gets a leading apostrophe so a spreadsheet does not run
 * it as a formula. Numbers are written as numbers and never prefixed.
 */
import { strToU8, zipSync } from 'fflate';
import { supabase } from '@/lib/supabase';

// CSV -------------------------------------------------------------------------------------------------

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, quoted when needed and safe to open in a spreadsheet. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** A CSV file: header row, then one line per row. Columns default to every key seen, in first-seen order. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? columnsOf(rows);
  const lines = [cols.map(csvCell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function columnsOf(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  return Array.from(seen);
}

// Paged reads -----------------------------------------------------------------------------------------

const PAGE = 1000;

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

/** The table is not in the database (or not exposed): an optional module that is not set up. */
function isMissingTable(err: DbError): boolean {
  return err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(err.message);
}

/** A column we filter or sort by does not exist on this table. */
function isMissingColumn(err: DbError): boolean {
  return err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist|could not find .* column/i.test(err.message);
}

export class ExportError extends Error {}

interface ReadOptions {
  workshopId: string;
  /** Filter on workshop_id (default true). Tables without it rely on row level security alone. */
  byWorkshop?: boolean;
  /** Sort columns tried in order; the first one the table has is used, so pages never overlap. */
  order?: string[];
  /** Extra filter, for example customer_id in (...). */
  inFilter?: { column: string; values: string[] };
  select?: string;
  onPage?: (rowsSoFar: number) => void;
}

type ReadResult = { missing: true } | { missing: false; rows: Record<string, unknown>[] };

/** Every row of a table this user may see. */
export async function readAll(table: string, opts: ReadOptions): Promise<ReadResult> {
  const orders = [...(opts.order ?? ['id']), 'created_at', ''];
  let byWorkshop = opts.byWorkshop ?? true;
  for (let attempt = 0; attempt < orders.length; ) {
    const order = orders[attempt];
    const rows: Record<string, unknown>[] = [];
    let failed: DbError | null = null;
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select(opts.select ?? '*');
      if (byWorkshop) q = q.eq('workshop_id', opts.workshopId);
      if (opts.inFilter) q = q.in(opts.inFilter.column, opts.inFilter.values);
      if (order) q = q.order(order, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) {
        failed = error;
        break;
      }
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      opts.onPage?.(rows.length);
      if (page.length < PAGE) break;
    }
    if (!failed) return { missing: false, rows };
    if (isMissingTable(failed)) return { missing: true };
    if (isMissingColumn(failed)) {
      if (byWorkshop && /workshop_id/.test(`${failed.message} ${failed.details ?? ''}`)) {
        byWorkshop = false; // retry the same order without the workshop filter
        continue;
      }
      attempt += 1; // try the next sort column
      continue;
    }
    throw new ExportError(`${table} could not be read: ${failed.message}`);
  }
  throw new ExportError(`${table} could not be read.`);
}

// What goes in the export --------------------------------------------------------------------------------

interface TableSpec {
  file: string;
  /** Table names to try, first match wins (optional modules may use either name). */
  tables: string[];
  about: string;
  order?: string[];
  /** Part of the core app: a missing table is an error, not a skip. */
  core?: boolean;
  byWorkshop?: boolean;
  /** Columns to read, for tables where staff may read only some columns (select * is refused there). */
  select?: string;
}

const TABLES: TableSpec[] = [
  { file: 'appointments.csv', tables: ['appointments'], about: 'Bookings: requested, confirmed, checked in, cancelled, with contact and vehicle.', core: true },
  { file: 'repair_orders.csv', tables: ['repair_orders'], about: 'Repair orders: number, status, customer contact, vehicle (JSON), notes, dates.', core: true },
  { file: 'repair_order_items.csv', tables: ['repair_order_items'], about: 'Labour and part lines of each repair order, with price and approval.', core: true },
  { file: 'approvals.csv', tables: ['repair_item_approvals'], about: 'Customer approvals and declines of repair lines (online or by phone).', core: true },
  { file: 'messages.csv', tables: ['repair_order_messages'], about: 'Messages between the shop and the customer on each repair order.', core: true },
  { file: 'repair_order_timeline.csv', tables: ['repair_order_events'], about: 'Timeline of each repair order: check-in, status changes, notes.', core: true },
  { file: 'repair_order_media.csv', tables: ['repair_order_media'], about: 'Photos and videos on repair orders (storage paths; the files themselves are not in the zip).', core: true },
  { file: 'invoices.csv', tables: ['invoices'], about: 'Invoices: number, totals, tax, status, dates.' },
  { file: 'payments.csv', tables: ['payments'], about: 'Payments and refunds on invoices: amount, method, date, card brand and last 4 digits (never full card numbers).',
    // Staff may read only these columns of payments (migration 030), so select * is refused.
    select: 'id, workshop_id, invoice_id, repair_order_id, kind, amount, currency, method, status, provider, provider_transaction_id, card_brand, card_last4, refund_of, note, failure_reason, received_at, recorded_by, customer_id, created_at, updated_at' },
  { file: 'tax_settings.csv', tables: ['workshop_tax_settings'], about: 'The shop\'s province, sales tax rates and tax registration numbers.' },
  { file: 'parts.csv', tables: ['parts'], about: 'Parts inventory: SKU, name, price, stock.' },
  { file: 'part_costs.csv', tables: ['part_costs'], about: 'What each part costs the shop (staff only).', order: ['part_id'] },
  { file: 'suppliers.csv', tables: ['suppliers'], about: 'Suppliers the shop buys from.' },
  { file: 'purchase_orders.csv', tables: ['purchase_orders'], about: 'Purchase orders sent to suppliers.' },
  { file: 'purchase_order_lines.csv', tables: ['purchase_order_lines'], about: 'Lines of each purchase order: part, quantity, cost, received.' },
  { file: 'purchase_order_receipts.csv', tables: ['purchase_order_receipts'], about: 'Every delivery received against a purchase order.' },
  { file: 'inspections.csv', tables: ['inspections'], about: 'Vehicle inspections on repair orders: status, who and when.' },
  { file: 'inspection_items.csv', tables: ['inspection_items'], about: 'Checklist results of each inspection: condition, measurement, note.' },
  { file: 'inspection_templates.csv', tables: ['inspection_templates'], about: 'The shop\'s inspection checklists (items as JSON).' },
  { file: 'services.csv', tables: ['services'], about: 'Services offered on the website, with starting prices.' },
  { file: 'team.csv', tables: ['team_members'], about: 'Team members shown on the website.' },
  { file: 'imported_service_history.csv', tables: ['imported_service_records'], about: 'Past visits imported from your previous shop system.', order: ['service_date', 'id'] },
];

export interface ExportProgress {
  /** 0 to 1. */
  fraction: number;
  label: string;
}

export interface ExportFile {
  file: string;
  rows: number;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  files: ExportFile[];
  skipped: string[];
}

function slug(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'shop'
  );
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function exportFileName(shopName: string): string {
  return `eurowerken-export-${slug(shopName)}-${today()}.zip`;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const CUSTOMER_COLUMNS = [
  'type', 'id', 'name', 'email', 'phone', 'address', 'notes', 'has_online_account', 'linked_account_id',
  'imported_from', 'external_id', 'customer_since', 'created_at', 'updated_at',
];
const VEHICLE_COLUMNS = [
  'owner_type', 'owner_id', 'id', 'year', 'make', 'model', 'vin', 'plate', 'nickname', 'odometer_km', 'notes',
  'imported_from', 'external_id', 'created_at', 'updated_at',
];

/** Customers: the accounts linked to the shop and the shop's own contacts (imported or added by staff). */
async function readCustomers(workshopId: string, onPage: (n: number) => void) {
  const links = await readAll('workshop_customers', {
    workshopId,
    order: ['customer_id'],
    select: 'customer_id, created_at, customer:customer_accounts ( id, email, full_name, phone, created_at, updated_at )',
    onPage,
  });
  if (links.missing) throw new ExportError('Customer accounts could not be read (migration 005 missing).');
  const customers: Record<string, unknown>[] = [];
  const accountIds: string[] = [];
  for (const l of links.rows) {
    const a = l.customer as Record<string, unknown> | null;
    if (!a) continue;
    accountIds.push(String(a.id));
    customers.push({
      type: 'online account', id: a.id, name: a.full_name, email: a.email, phone: a.phone, has_online_account: true,
      customer_since: l.created_at, created_at: a.created_at, updated_at: a.updated_at,
    });
  }
  const contacts = await readAll('workshop_contacts', { workshopId, onPage });
  if (!contacts.missing) {
    for (const c of contacts.rows) {
      customers.push({
        type: c.source === 'manual' ? 'contact (added by staff)' : 'contact (imported)', id: c.id, name: c.name, email: c.email,
        phone: c.phone, address: c.address, notes: c.notes, has_online_account: Boolean(c.customer_id),
        linked_account_id: c.customer_id, imported_from: c.source_system, external_id: c.external_id,
        customer_since: c.created_at, created_at: c.created_at, updated_at: c.updated_at,
      });
    }
  }

  const vehicles: Record<string, unknown>[] = [];
  for (const ids of chunks(accountIds, 100)) {
    const res = await readAll('customer_vehicles', { workshopId, byWorkshop: false, inFilter: { column: 'customer_id', values: ids }, onPage });
    if (res.missing) break;
    for (const v of res.rows) vehicles.push({ owner_type: 'online account', owner_id: v.customer_id, ...pick(v, VEHICLE_COLUMNS) });
  }
  const cv = await readAll('contact_vehicles', { workshopId, onPage });
  if (!cv.missing) {
    for (const v of cv.rows) {
      vehicles.push({ owner_type: 'contact', owner_id: v.contact_id, ...pick(v, VEHICLE_COLUMNS), imported_from: v.source_system });
    }
  }
  return { customers, vehicles, contactsMissing: contacts.missing };
}

function pick(row: Record<string, unknown>, cols: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

/** Reads everything and builds the zip. onProgress is called as each table is read. */
export async function exportAllData(
  workshop: { id: string; name: string },
  onProgress: (p: ExportProgress) => void,
): Promise<ExportResult> {
  const steps = TABLES.length + 1;
  let step = 0;
  const report = (label: string) => onProgress({ fraction: Math.min(1, step / steps), label });

  const zipFiles: Record<string, Uint8Array> = {};
  const files: ExportFile[] = [];
  const skipped: string[] = [];

  report('Customers and vehicles');
  const { customers, vehicles, contactsMissing } = await readCustomers(workshop.id, (n) => report(`Customers and vehicles (${n} rows)`));
  zipFiles['customers.csv'] = strToU8(toCsv(customers, CUSTOMER_COLUMNS));
  zipFiles['vehicles.csv'] = strToU8(toCsv(vehicles, VEHICLE_COLUMNS));
  files.push({ file: 'customers.csv', rows: customers.length }, { file: 'vehicles.csv', rows: vehicles.length });
  if (contactsMissing) skipped.push('Imported contacts (migration 033 not applied)');
  step += 1;

  for (const spec of TABLES) {
    report(spec.file.replace('.csv', '').replace(/_/g, ' '));
    let result: ReadResult = { missing: true };
    for (const t of spec.tables) {
      result = await readAll(t, {
        workshopId: workshop.id,
        order: spec.order,
        byWorkshop: spec.byWorkshop,
        select: spec.select,
        onPage: (n) => report(`${spec.file.replace('.csv', '').replace(/_/g, ' ')} (${n} rows)`),
      });
      if (!result.missing) break;
    }
    if (result.missing) {
      if (spec.core) throw new ExportError(`${spec.tables[0]} is missing from the database.`);
      skipped.push(`${spec.file} (not set up in this shop's database)`);
    } else {
      zipFiles[spec.file] = strToU8(toCsv(result.rows));
      files.push({ file: spec.file, rows: result.rows.length });
    }
    step += 1;
  }

  zipFiles['README.txt'] = strToU8(readme(workshop.name, files, skipped));
  onProgress({ fraction: 1, label: 'Packing the zip' });
  const zipped = zipSync(zipFiles, { level: 6 });
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    fileName: exportFileName(workshop.name),
    files,
    skipped,
  };
}

function readme(shop: string, files: ExportFile[], skipped: string[]): string {
  const about: Record<string, string> = {
    'customers.csv':
      'Every customer: online accounts linked to the shop (type "online account") and contacts imported from another system or added by staff. linked_account_id is set when a contact is the same person as an online account.',
    'vehicles.csv': 'Every vehicle: cars customers added on the website (owner_type "online account") and imported cars (owner_type "contact"). owner_id is the id in customers.csv.',
  };
  for (const t of TABLES) about[t.file] = t.about;
  const lines = [
    `EuroWerken data export for ${shop}`,
    `Made ${new Date().toISOString()}`,
    '',
    'Each .csv file is UTF-8, comma separated, with a header row (RFC 4180). Open them in Excel, Google Sheets or',
    'Numbers, or import them into another system. Ids (uuid) connect the files: repair_order_id, customer_id, part_id.',
    'Dates and times are ISO 8601 in UTC. Money is in the shop currency. Vehicle columns in JSON form ({"make": ...})',
    'are exactly as stored. A text cell that started with = + - or @ has a leading apostrophe so spreadsheets do not',
    'run it as a formula; remove it if you need the raw text.',
    '',
    'The export holds every row your role is allowed to see. A Manager sees everything.',
    '',
    'Files',
    '-----',
    ...files.map((f) => `${f.file} (${f.rows} ${f.rows === 1 ? 'row' : 'rows'})\n    ${about[f.file] ?? ''}`),
  ];
  if (skipped.length) lines.push('', 'Not included', '------------', ...skipped.map((s) => `- ${s}`));
  lines.push('', 'Photos and videos are stored separately; repair_order_media.csv lists their paths.');
  return lines.join('\r\n') + '\r\n';
}

/** Saves a Blob as a download in the browser. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
