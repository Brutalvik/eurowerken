/**
 * Import from another shop system (supabase/migrations/033, import_rows): read a CSV, map its columns, check each
 * row, ask the database for a dry run, then import in batches of at most 500 rows.
 *
 * The database is the judge: it merges customers by the old system's id, email, then phone, links customers who
 * already have an online account, merges cars by VIN then plate, and makes re-imports add nothing. The checks here
 * only show problems early, in the preview, and turn dates and miles into what the database expects.
 */
import { supabase } from '@/lib/supabase';
import { toCsv } from './dataExport';

// Reading the file ------------------------------------------------------------------------------------------

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: ',' | ';' | '\t';
  /** The text encoding the file was read with. */
  encoding: string;
}

/** Decodes the file: UTF-8 (with or without BOM), UTF-16 (Excel "Unicode text"), else Windows-1252 (older Excel). */
export async function readCsvFile(file: File): Promise<ParsedCsv> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let text: string;
  let encoding = 'UTF-8';
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(buf);
    encoding = 'UTF-16';
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(buf);
    encoding = 'UTF-16';
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1252').decode(buf);
      encoding = 'Windows-1252';
    }
  }
  return { ...parseCsv(text), encoding };
}

/** Picks the delimiter that splits the first line into the most columns (outside quotes). */
function detectDelimiter(text: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length && i < 20000; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
}

/**
 * RFC 4180 parser that also takes what real exports do: a BOM, ; or tab delimiters, \r\n, \n or \r line ends,
 * quoted cells with embedded delimiters, quotes ("") and line breaks, an Excel "sep=;" first line, blank lines.
 */
export function parseCsv(input: string): Omit<ParsedCsv, 'encoding'> {
  let text = input.replace(/^﻿/, '');
  let forced: ',' | ';' | '\t' | null = null;
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep) {
    forced = sep[1] === ';' ? ';' : sep[1] === '\t' ? '\t' : ',';
    text = text.slice(sep[0].length);
  }
  const delimiter = forced ?? detectDelimiter(text);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quotedCell = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && (cell === '' || /^\s*$/.test(cell)) && !quotedCell) {
      inQuotes = true;
      quotedCell = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
      quotedCell = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      quotedCell = false;
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  const nonEmpty = out.filter((r) => r.some((c) => c.trim() !== ''));
  const [head = [], ...rows] = nonEmpty;
  const seen = new Map<string, number>();
  const headers = head.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  // Rows longer than the header get extra unnamed columns so no value is dropped.
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  for (let i = headers.length; i < width; i++) headers.push(`Column ${i + 1}`);
  return { headers, rows: rows.map((r) => headers.map((_, i) => (r[i] ?? '').trim())), delimiter };
}

// What can be imported ------------------------------------------------------------------------------------------

/** customers: customers with their cars (one row per customer or per car); vehicles: a separate vehicle file. */
export type ImportKind = 'customers' | 'vehicles' | 'history';

const RPC_KIND: Record<ImportKind, 'contacts' | 'vehicles' | 'history'> = {
  customers: 'contacts',
  vehicles: 'vehicles',
  history: 'history',
};

export type FieldKey =
  | 'customer_ref' | 'name' | 'first_name' | 'last_name' | 'company' | 'email' | 'phone' | 'phone2'
  | 'address' | 'address2' | 'city' | 'state' | 'zip' | 'notes'
  | 'vehicle_ref' | 'year' | 'make' | 'model' | 'submodel' | 'vin' | 'plate' | 'odometer_km' | 'vehicle_notes'
  | 'record_ref' | 'service_date' | 'ro_number' | 'description' | 'mileage_km' | 'total';

export interface ImportField {
  key: FieldKey;
  label: string;
  group: 'Customer' | 'Vehicle' | 'Visit';
  hint?: string;
}

const CUSTOMER_FIELDS: ImportField[] = [
  { key: 'customer_ref', label: 'Customer id (old system)', group: 'Customer', hint: 'Links vehicles and history to this customer.' },
  { key: 'name', label: 'Full name', group: 'Customer' },
  { key: 'first_name', label: 'First name', group: 'Customer' },
  { key: 'last_name', label: 'Last name', group: 'Customer' },
  { key: 'company', label: 'Company', group: 'Customer' },
  { key: 'email', label: 'Email', group: 'Customer' },
  { key: 'phone', label: 'Phone', group: 'Customer' },
  { key: 'phone2', label: 'Other phone', group: 'Customer', hint: 'Kept in the notes.' },
  { key: 'address', label: 'Address', group: 'Customer' },
  { key: 'address2', label: 'Address line 2', group: 'Customer' },
  { key: 'city', label: 'City', group: 'Customer' },
  { key: 'state', label: 'Province / state', group: 'Customer' },
  { key: 'zip', label: 'Postal / ZIP code', group: 'Customer' },
  { key: 'notes', label: 'Customer notes', group: 'Customer' },
];
const VEHICLE_FIELDS: ImportField[] = [
  { key: 'vehicle_ref', label: 'Vehicle id (old system)', group: 'Vehicle' },
  { key: 'year', label: 'Year', group: 'Vehicle' },
  { key: 'make', label: 'Make', group: 'Vehicle' },
  { key: 'model', label: 'Model', group: 'Vehicle' },
  { key: 'submodel', label: 'Submodel / trim', group: 'Vehicle' },
  { key: 'vin', label: 'VIN', group: 'Vehicle' },
  { key: 'plate', label: 'Licence plate', group: 'Vehicle' },
  { key: 'odometer_km', label: 'Odometer', group: 'Vehicle' },
  { key: 'vehicle_notes', label: 'Vehicle notes', group: 'Vehicle' },
];
const VISIT_FIELDS: ImportField[] = [
  { key: 'record_ref', label: 'Visit / invoice id (old system)', group: 'Visit', hint: 'Makes importing the same file again add nothing.' },
  { key: 'service_date', label: 'Service date', group: 'Visit' },
  { key: 'ro_number', label: 'RO / invoice number', group: 'Visit' },
  { key: 'description', label: 'Work done / description', group: 'Visit' },
  { key: 'mileage_km', label: 'Mileage at the visit', group: 'Visit' },
  { key: 'total', label: 'Total', group: 'Visit' },
];

export function fieldsFor(kind: ImportKind): ImportField[] {
  if (kind === 'customers') return [...CUSTOMER_FIELDS, ...VEHICLE_FIELDS];
  if (kind === 'vehicles') return [...CUSTOMER_FIELDS.filter((f) => ['customer_ref', 'name', 'first_name', 'last_name', 'email', 'phone'].includes(f.key)), ...VEHICLE_FIELDS];
  return [...VISIT_FIELDS, ...CUSTOMER_FIELDS.filter((f) => ['customer_ref', 'name', 'first_name', 'last_name', 'email', 'phone'].includes(f.key)), ...VEHICLE_FIELDS.filter((f) => f.key !== 'vehicle_notes' && f.key !== 'odometer_km')];
}

/** Which mapped fields a kind needs. Each entry is "one of these". */
export function requiredFor(kind: ImportKind): { label: string; anyOf: FieldKey[] }[] {
  const who = { label: 'A customer name, email or phone', anyOf: ['name', 'first_name', 'last_name', 'company', 'email', 'phone', 'customer_ref'] as FieldKey[] };
  const car = { label: 'A vehicle make, VIN or plate', anyOf: ['make', 'vin', 'plate'] as FieldKey[] };
  if (kind === 'customers') return [who];
  if (kind === 'vehicles') return [{ ...who, label: 'The customer (id, email, phone or name)' }, car];
  return [
    { label: 'The service date', anyOf: ['service_date'] },
    { label: 'An RO number, description or total', anyOf: ['ro_number', 'description', 'total'] },
    { label: 'The customer or the vehicle', anyOf: [...who.anyOf, ...car.anyOf] },
  ];
}

export type Mapping = Partial<Record<FieldKey, string>>;

// Presets ----------------------------------------------------------------------------------------------------
//
// None of these vendors publishes its export columns. Each preset lists the header names it is known or expected
// to use (see the report in the help section); the generic synonyms below catch the rest. The wizard always shows
// the mapping for the user to check, and a shop can save its own corrections as the preset for next time.

export type SourceId = 'shopmonkey' | 'tekmetric' | 'autoleap' | 'protractor' | 'mitchell1' | 'generic';

export interface Preset {
  id: SourceId;
  label: string;
  /** How to export from that system, shown in the wizard. */
  howTo: string;
  /** Header names this system uses, per field (first is the most likely). */
  headers: Partial<Record<FieldKey, string[]>>;
  /** Mileage unit the system usually exports. */
  unit: 'km' | 'mi';
}

export const PRESETS: Preset[] = [
  {
    id: 'shopmonkey',
    label: 'Shopmonkey',
    howTo: 'Lists > Customers (and Vehicles) > Export. Orders: Reports > export to CSV.',
    unit: 'mi',
    headers: {
      customer_ref: ['Customer ID', 'Customer Id', 'id'],
      first_name: ['First Name'], last_name: ['Last Name'], company: ['Company Name', 'Company'],
      email: ['Email', 'Email Address'], phone: ['Phone Number', 'Phone', 'Mobile Phone'],
      address: ['Address', 'Address 1'], address2: ['Address 2'], city: ['City'], state: ['State'], zip: ['Zip', 'Postal Code'],
      notes: ['Note', 'Notes'],
      vehicle_ref: ['Vehicle ID'], year: ['Year'], make: ['Make'], model: ['Model'], submodel: ['Submodel'],
      vin: ['VIN'], plate: ['License Plate', 'License'], odometer_km: ['Mileage', 'Odometer'],
      record_ref: ['Order ID'], service_date: ['Created Date', 'Completed Date', 'Date'], ro_number: ['Order #', 'Order Number'],
      description: ['Complaint', 'Recommendation', 'Description'], mileage_km: ['Mileage In', 'Mileage'], total: ['Total', 'Total Cost'],
    },
  },
  {
    id: 'tekmetric',
    label: 'Tekmetric',
    howTo: 'Customers > Export > Download CSV (tick every column). Repair orders: Reports > export.',
    unit: 'mi',
    headers: {
      customer_ref: ['Customer Id', 'customerId', 'Customer ID'],
      first_name: ['First Name', 'firstName'], last_name: ['Last Name', 'lastName'], company: ['Company'],
      email: ['Email', 'email'], phone: ['Phone', 'Primary Phone', 'phone'],
      address: ['Billing Address', 'Billing Address 1', 'address1', 'Address'], address2: ['Billing Address 2', 'address2'],
      city: ['Billing City', 'city', 'City'], state: ['Billing State', 'state', 'State'], zip: ['Billing Zip', 'zip', 'Zip'],
      notes: ['Notes', 'notes'],
      vehicle_ref: ['Vehicle Id', 'vehicleId'], year: ['Year', 'year'], make: ['Make', 'make'], model: ['Model', 'model'],
      submodel: ['Sub Model', 'subModel'], vin: ['VIN', 'vin'], plate: ['License Plate', 'licensePlate'],
      record_ref: ['Repair Order Id', 'repairOrderId'], service_date: ['Posted Date', 'Completed Date', 'Created Date', 'postedDate'],
      ro_number: ['RO #', 'Repair Order Number', 'repairOrderNumber'], description: ['Customer Concerns', 'Concern', 'customerConcerns'],
      mileage_km: ['Miles In', 'milesIn', 'Odometer'], total: ['Total Sales', 'Total', 'totalSales'],
    },
  },
  {
    id: 'autoleap',
    label: 'AutoLeap',
    howTo: 'Customers > Export (CSV). Ask AutoLeap support for repair order history.',
    unit: 'mi',
    headers: {
      first_name: ['First Name'], last_name: ['Last Name'], email: ['Email'], phone: ['Phone', 'Mobile'],
      address: ['Address'], city: ['City'], state: ['State'], zip: ['Zip', 'Zip Code'],
      year: ['Year'], make: ['Make'], model: ['Model'], vin: ['VIN'], plate: ['License Plate'], odometer_km: ['Mileage'],
      service_date: ['Date', 'Invoice Date'], ro_number: ['RO #', 'RO Number', 'Invoice #'], total: ['Total', 'Grand Total'],
    },
  },
  {
    id: 'protractor',
    label: 'Protractor',
    howTo: 'Run the Contact / Service History report and save it as CSV, or use a data conversion file.',
    unit: 'km',
    headers: {
      customer_ref: ['Contact ID', 'Client ID'], name: ['Name', 'Contact Name', 'Client'], company: ['Company'],
      email: ['Email', 'E-mail'], phone: ['Cell Phone', 'Cell', 'Home Phone', 'Phone'], phone2: ['Work Phone', 'Business Phone'],
      address: ['Address', 'Street'], city: ['City'], state: ['Province', 'State'], zip: ['Postal Code', 'Postal'],
      vehicle_ref: ['Unit #', 'Unit'], year: ['Year'], make: ['Make'], model: ['Model'], submodel: ['Submodel'],
      vin: ['VIN', 'Serial'], plate: ['Plate', 'License'], odometer_km: ['Odometer', 'Odometer In'],
      service_date: ['Invoice Date', 'Date'], ro_number: ['Invoice #', 'Invoice Number', 'Work Order #'],
      description: ['Description', 'Work Performed'], mileage_km: ['Odometer In', 'Odometer'], total: ['Grand Total', 'Total'],
    },
  },
  {
    id: 'mitchell1',
    label: 'Mitchell 1',
    howTo: 'Manager SE: Reports > Follow Up > MM Create Data Export File (saves Followup.csv).',
    unit: 'mi',
    headers: {
      name: ['Customer Name', 'Name'], first_name: ['First Name'], last_name: ['Last Name'],
      email: ['Email', 'E-Mail'], phone: ['Phone', 'Home Phone', 'Cell Phone'], phone2: ['Work Phone'],
      address: ['Address', 'Address1'], address2: ['Address2'], city: ['City'], state: ['State'], zip: ['Zip', 'Zip Code'],
      year: ['Year'], make: ['Make'], model: ['Model'], vin: ['VIN'], plate: ['License', 'License Plate'], odometer_km: ['Mileage'],
      service_date: ['Last Service Date', 'Service Date', 'Date'], ro_number: ['RO Number', 'RO #', 'Invoice'],
      mileage_km: ['Mileage'], total: ['Total'],
    },
  },
  { id: 'generic', label: 'Other / any CSV', howTo: 'Any CSV with a header row. Excel: File > Save As > CSV UTF-8.', unit: 'km', headers: {} },
];

/** Generic header synonyms (compared without case, spaces or punctuation). */
const SYNONYMS: Record<FieldKey, string[]> = {
  customer_ref: ['customerid', 'customerno', 'customernumber', 'custid', 'custno', 'clientid', 'contactid', 'accountnumber', 'accountno'],
  name: ['name', 'fullname', 'customername', 'customer', 'clientname', 'contactname', 'client'],
  first_name: ['firstname', 'first', 'givenname', 'fname'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  company: ['company', 'companyname', 'business', 'businessname', 'organization', 'fleet'],
  email: ['email', 'emailaddress', 'mail', 'customeremail', 'primaryemail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilephone', 'cell', 'cellphone', 'primaryphone', 'telephone', 'tel', 'homephone', 'customerphone'],
  phone2: ['workphone', 'businessphone', 'otherphone', 'phone2', 'secondaryphone', 'altphone'],
  address: ['address', 'address1', 'addressline1', 'street', 'streetaddress', 'billingaddress', 'billingaddress1'],
  address2: ['address2', 'addressline2', 'billingaddress2', 'suite', 'unit'],
  city: ['city', 'town', 'billingcity'],
  state: ['state', 'province', 'region', 'billingstate', 'prov'],
  zip: ['zip', 'zipcode', 'postalcode', 'postcode', 'postal', 'billingzip'],
  notes: ['notes', 'note', 'comments', 'customernotes', 'remarks'],
  vehicle_ref: ['vehicleid', 'vehicleno', 'unitnumber', 'unitno', 'stockno'],
  year: ['year', 'vehicleyear', 'modelyear', 'yr'],
  make: ['make', 'vehiclemake', 'manufacturer', 'brand'],
  model: ['model', 'vehiclemodel'],
  submodel: ['submodel', 'trim', 'series', 'engine'],
  vin: ['vin', 'vinnumber', 'vehiclevin', 'serial', 'serialnumber', 'chassis'],
  plate: ['plate', 'licenseplate', 'licenceplate', 'license', 'licence', 'tag', 'platenumber', 'registration', 'rego'],
  odometer_km: ['odometer', 'mileage', 'miles', 'kms', 'km', 'kilometres', 'kilometers', 'currentmileage'],
  vehicle_notes: ['vehiclenotes', 'vehiclenote'],
  record_ref: ['orderid', 'invoiceid', 'roid', 'repairorderid', 'workorderid', 'visitid'],
  service_date: ['date', 'servicedate', 'invoicedate', 'rodate', 'orderdate', 'completeddate', 'posteddate', 'closeddate', 'createddate', 'visitdate'],
  ro_number: ['ro', 'ronumber', 'rono', 'repairorder', 'repairordernumber', 'invoice', 'invoicenumber', 'invoiceno', 'ordernumber', 'orderno', 'workorder', 'workordernumber', 'wo'],
  description: ['description', 'workdone', 'workperformed', 'services', 'complaint', 'concern', 'customerconcerns', 'jobs', 'labor', 'labour', 'summary'],
  mileage_km: ['mileagein', 'milesin', 'odometerin', 'mileage', 'odometer', 'kmsin', 'miles'],
  total: ['total', 'grandtotal', 'invoicetotal', 'amount', 'totalsales', 'totalamount', 'totalcost'],
};

export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const SAVED_KEY = (source: SourceId, kind: ImportKind) => `ew.import.mapping.${source}.${kind}`;

/** A mapping the shop saved for this system and kind, or null. */
export function savedMapping(source: SourceId, kind: ImportKind): Mapping | null {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY(source, kind));
    return raw ? (JSON.parse(raw) as Mapping) : null;
  } catch {
    return null;
  }
}

/** Saves the mapping as this system's preset (by header name), for the next import. */
export function saveMapping(source: SourceId, kind: ImportKind, mapping: Mapping): void {
  try {
    window.localStorage.setItem(SAVED_KEY(source, kind), JSON.stringify(mapping));
  } catch {
    /* private mode: nothing saved */
  }
}

export function forgetMapping(source: SourceId, kind: ImportKind): void {
  try {
    window.localStorage.removeItem(SAVED_KEY(source, kind));
  } catch {
    /* ignore */
  }
}

/** The system a file most likely comes from: the preset whose own header names match the most columns. */
export function detectSource(headers: string[]): { id: SourceId; matches: number } {
  const set = new Set(headers.map(normHeader));
  let best: { id: SourceId; matches: number } = { id: 'generic', matches: 0 };
  for (const p of PRESETS) {
    if (p.id === 'generic') continue;
    let n = 0;
    for (const names of Object.values(p.headers)) if (names?.some((h) => set.has(normHeader(h)))) n += 1;
    // Distinctive names count double.
    if (p.id === 'tekmetric' && (set.has('totalsales') || set.has('milesin') || set.has('customerconcerns') || set.has('firstname') && set.has('licenseplate') && set.has('billingcity'))) n += 3;
    if (p.id === 'shopmonkey' && (set.has('order') || set.has('mileagein') || set.has('phonenumber') && set.has('companyname'))) n += 3;
    if (p.id === 'protractor' && (set.has('unit') || set.has('odometerin') || set.has('cellphone') && set.has('postalcode'))) n += 3;
    if (p.id === 'mitchell1' && (set.has('lastservicedate') || set.has('customername') && set.has('license'))) n += 3;
    if (n > best.matches) best = { id: p.id, matches: n };
  }
  // Generic headers alone (Year, Make, Email) do not prove a system.
  return best.matches >= 6 ? best : { id: 'generic', matches: best.matches };
}

/** Matches columns to fields: the saved mapping, then the preset's names, then synonyms. Each column is used once. */
export function autoMap(headers: string[], kind: ImportKind, source: SourceId): Mapping {
  const fields = fieldsFor(kind).map((f) => f.key);
  const preset = PRESETS.find((p) => p.id === source);
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  const used = new Set<string>();
  const out: Mapping = {};
  const take = (f: FieldKey, header: string | undefined) => {
    if (!header || used.has(header) || out[f]) return;
    out[f] = header;
    used.add(header);
  };
  const saved = savedMapping(source, kind);
  if (saved) for (const f of fields) if (saved[f] && headers.includes(saved[f] as string)) take(f, saved[f]);
  for (const f of fields) for (const name of preset?.headers[f] ?? []) take(f, byNorm.get(normHeader(name)));
  for (const f of fields) for (const name of SYNONYMS[f]) take(f, byNorm.get(name));
  // A full name column wins over first/last only when there is no first/last.
  if (out.name && (out.first_name || out.last_name) && normHeader(out.name) !== 'name') delete out.name;
  return out;
}

// Checking and shaping rows ---------------------------------------------------------------------------------------

export type DateOrder = 'YMD' | 'MDY' | 'DMY';

export interface ImportOptions {
  /** How dates like 03/04/2021 are read. */
  dateOrder: DateOrder;
  /** Unit of odometer and mileage columns; miles are turned into km. */
  unit: 'km' | 'mi';
}

/** Guesses the date order from the values: a first part over 12 means day first, a second part over 12 month first. */
export function guessDateOrder(values: string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  if (dmy > mdy) return 'DMY';
  if (mdy > 0 || values.some((v) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v.trim()))) return 'MDY';
  return 'YMD';
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A date as YYYY-MM-DD: ISO, 03/04/2021 in the chosen order, "Mar 4, 2021", "4 Mar 2021" or an Excel day number. */
export function parseDate(raw: string, order: DateOrder): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(v);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y > 50 ? 1900 : 2000;
    if (order === 'DMY') return iso(y, +m[2], +m[1]);
    return iso(y, +m[1], +m[2]);
  }
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(v);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(v);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    // Excel serial day (1900 system): 25569 is 1970-01-01.
    const d = new Date((Math.floor(Number(v)) - 25569) * 86400000);
    if (d.getUTCFullYear() >= 1950 && d.getUTCFullYear() <= 2100) return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumber(raw: string): number | null {
  const v = raw.replace(/[\s,]/g, '').replace(/(km|kms|mi|miles)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

/** A money value the database accepts: $1,234.50 or (12.00); null when blank, undefined when not money. */
export function parseMoney(raw: string): string | null | undefined {
  let v = raw.replace(/[\s$€£]|CAD|USD|EUR/gi, '');
  if (!v) return null;
  let neg = false;
  if (/^\(.*\)$/.test(v)) {
    neg = true;
    v = v.slice(1, -1);
  }
  // 1.234,56 (European) -> 1234.56
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d{1,2}$/.test(v)) v = v.replace(',', '.');
  else v = v.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(v)) return undefined;
  return neg ? `-${v}` : v;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface CheckedRow {
  /** Line in the file (the header is line 1). */
  line: number;
  /** What is sent to the database. */
  values: Record<string, string>;
  /** Will stop the row from importing. */
  errors: string[];
  /** Imported, with this note. */
  warnings: string[];
}

/** Shapes and checks every row with the mapping. Problems shown here are checked again by the database. */
export function checkRows(parsed: ParsedCsv, kind: ImportKind, mapping: Mapping, opts: ImportOptions): CheckedRow[] {
  const col = new Map(parsed.headers.map((h, i) => [h, i]));
  const firstEmail = new Map<string, number>();
  const firstPhone = new Map<string, number>();
  const firstVin = new Map<string, number>();
  return parsed.rows.map((cells, idx) => {
    const line = idx + 2;
    const get = (f: FieldKey) => {
      const h = mapping[f];
      if (!h) return '';
      const i = col.get(h);
      return i === undefined ? '' : (cells[i] ?? '').trim();
    };
    const values: Record<string, string> = { _row: String(line) };
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const f of fieldsFor(kind)) {
      const v = get(f.key);
      if (v) values[f.key] = v;
    }

    // Customer
    const email = (values.email ?? '').toLowerCase();
    if (email && !EMAIL.test(email)) warnings.push(`Email "${values.email}" is not valid; it will be kept in the notes.`);
    const digits = (values.phone ?? '').replace(/\D/g, '');
    if (values.phone && digits.length < 10) warnings.push(`Phone "${values.phone}" has fewer than 10 digits; it will be kept in the notes.`);
    if (email && EMAIL.test(email)) {
      const first = firstEmail.get(email);
      if (first) warnings.push(`Same email as line ${first}: the two rows will be merged into one customer.`);
      else firstEmail.set(email, line);
    } else if (digits.length >= 10) {
      const p = digits.slice(-10);
      const first = firstPhone.get(p);
      if (first) warnings.push(`Same phone as line ${first}: the two rows will be merged into one customer.`);
      else firstPhone.set(p, line);
    }

    // Vehicle
    if (values.vin) {
      const vin = values.vin.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (vin.length !== 17 || /[IOQ]/.test(vin)) warnings.push(`VIN ${vin} does not look right (17 characters, no I, O or Q); it will be kept as given.`);
      if (kind !== 'history' && vin) {
        const key = `${email || digits.slice(-10) || values.customer_ref || values.name || ''}|${vin}`;
        const first = firstVin.get(key);
        if (first) warnings.push(`Same vehicle as line ${first}: it will be merged.`);
        else firstVin.set(key, line);
      }
    }
    if (values.year && !/^\d{4}$/.test(values.year)) warnings.push(`Year "${values.year}" is not a 4-digit year; it will be left blank.`);
    for (const k of ['odometer_km', 'mileage_km'] as const) {
      if (!values[k]) continue;
      const n = parseNumber(values[k]);
      if (n === null) {
        warnings.push(`${k === 'odometer_km' ? 'Odometer' : 'Mileage'} "${values[k]}" is not a number; it will be left blank.`);
        delete values[k];
      } else values[k] = String(Math.round(opts.unit === 'mi' ? n * 1.609344 : n));
    }

    // Visit
    if (kind === 'history') {
      if (!values.service_date) errors.push('The service date is missing.');
      else {
        const d = parseDate(values.service_date, opts.dateOrder);
        if (!d) errors.push(`The service date "${values.service_date}" is not a date this import understands.`);
        else values.service_date = d;
      }
      if (values.total) {
        const m = parseMoney(values.total);
        if (m === undefined) warnings.push(`Total "${values.total}" is not an amount; it will be left blank.`);
        else if (m === null) delete values.total;
        else values.total = m;
      }
      if (!values.ro_number && !values.description && !values.total && !values.record_ref) errors.push('No RO number, description or total.');
    }

    for (const req of requiredFor(kind)) {
      // The visit's date and its RO number / description / total are checked above, with clearer messages.
      if (kind === 'history' && (req.anyOf.includes('service_date') || req.anyOf.includes('ro_number'))) continue;
      // Lower-case only the first letter, so "VIN" and "RO" stay as written.
      if (!req.anyOf.some((f) => values[f])) errors.push(`Missing: ${req.label.charAt(0).toLowerCase()}${req.label.slice(1)}.`);
    }
    return { line, values, errors, warnings };
  });
}

// Talking to the database ---------------------------------------------------------------------------------------

export interface Counts {
  created: number;
  updated: number;
  merged: number;
  unchanged: number;
}

export interface RowProblem {
  row: number;
  message: string;
}

export interface ImportSummary extends Counts {
  linked: number;
  skipped: number;
  errors: RowProblem[];
  warnings: RowProblem[];
  contacts: Counts;
  vehicles: Counts;
  history: Counts;
  rowsSent: number;
}

const zero = (): Counts => ({ created: 0, updated: 0, merged: 0, unchanged: 0 });

export function emptySummary(): ImportSummary {
  return { ...zero(), linked: 0, skipped: 0, errors: [], warnings: [], contacts: zero(), vehicles: zero(), history: zero(), rowsSent: 0 };
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function counts(v: unknown): Counts {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { created: num(o.created), updated: num(o.updated), merged: num(o.merged), unchanged: num(o.unchanged) };
}

function problems(v: unknown): RowProblem[] {
  return Array.isArray(v) ? v.map((p) => ({ row: num((p as RowProblem).row), message: String((p as RowProblem).message ?? '') })) : [];
}

function addCounts(a: Counts, b: Counts): Counts {
  return { created: a.created + b.created, updated: a.updated + b.updated, merged: a.merged + b.merged, unchanged: a.unchanged + b.unchanged };
}

export function addSummary(a: ImportSummary, b: ImportSummary): ImportSummary {
  return {
    ...addCounts(a, b),
    linked: a.linked + b.linked,
    skipped: a.skipped + b.skipped,
    errors: [...a.errors, ...b.errors],
    warnings: [...a.warnings, ...b.warnings],
    contacts: addCounts(a.contacts, b.contacts),
    vehicles: addCounts(a.vehicles, b.vehicles),
    history: addCounts(a.history, b.history),
    rowsSent: a.rowsSent + b.rowsSent,
  };
}

export const BATCH = 500;

function importError(err: { message: string; code?: string }): Error {
  if (err.code === 'PGRST202' || /import_rows|could not find the function/i.test(err.message)) {
    return new Error('The database is not set up for imports yet. Apply migration 033 (npm run db:migrate).');
  }
  if (/failed to fetch|network/i.test(err.message)) return new Error('Could not reach the server. Check your connection, then resume.');
  return new Error(err.message || 'The import could not run.');
}

/** Sends one batch (at most 500 rows). A dry run changes nothing. */
export async function importBatch(kind: ImportKind, rows: Record<string, string>[], source: string, dryRun: boolean): Promise<ImportSummary> {
  if (rows.length > BATCH) throw new Error(`At most ${BATCH} rows per batch.`);
  const { data, error } = await supabase.rpc('import_rows', { p_kind: RPC_KIND[kind], p_rows: rows, p_source: source, p_dry_run: dryRun });
  if (error) throw importError(error);
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    ...counts(d),
    linked: num(d.linked),
    skipped: num(d.skipped),
    errors: problems(d.errors),
    warnings: problems(d.warnings),
    contacts: counts(d.contacts),
    vehicles: counts(d.vehicles),
    history: counts(d.history),
    rowsSent: rows.length,
  };
}

/** Splits rows into batches of at most 500. */
export function batches<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

/** The rows that had a problem, with the original columns and what happened: for the shop to fix and import again. */
export function problemRowsCsv(parsed: ParsedCsv, checked: CheckedRow[], summary: ImportSummary | null): string {
  const byLine = new Map<number, { status: string; messages: string[] }>();
  const add = (line: number, status: string, message: string) => {
    const cur = byLine.get(line) ?? { status, messages: [] };
    if (status === 'Not imported') cur.status = status;
    if (!cur.messages.includes(message)) cur.messages.push(message);
    byLine.set(line, cur);
  };
  for (const c of checked) {
    for (const e of c.errors) add(c.line, 'Not imported', e);
    if (!summary) for (const w of c.warnings) add(c.line, 'Imported with a note', w);
  }
  for (const e of summary?.errors ?? []) add(e.row, 'Not imported', e.message);
  for (const w of summary?.warnings ?? []) add(w.row, 'Imported with a note', w.message);
  const rows = [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, p]) => {
      const cells = parsed.rows[line - 2] ?? [];
      const r: Record<string, unknown> = { Line: line, Status: p.status, Problem: p.messages.join(' | ') };
      parsed.headers.forEach((h, i) => (r[h] = cells[i] ?? ''));
      return r;
    });
  return toCsv(rows, ['Line', 'Status', 'Problem', ...parsed.headers]);
}
