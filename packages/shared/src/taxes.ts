/**
 * Canadian sales taxes (supabase/migrations/029_canadian_taxes.sql).
 *
 * A shop charges 1 to 3 taxes (components), each on the taxable subtotal (no tax on tax), each rounded half-up to
 * the cent. computeTaxes does exactly what the database does (round(numeric, 2)), with integer arithmetic so binary
 * floating point never changes a cent. The checks here mirror the database's; the database has the last word.
 *
 * Default rates checked 2026-11-27 on canada.ca (GST/HST rates page, modified 2025-04-01). Nova Scotia's HST is 14%
 * since 1 April 2025.
 */

export type TaxCode = 'GST' | 'HST' | 'PST' | 'QST' | 'RST';
export type ProvinceCode = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

export interface TaxComponent {
  code: TaxCode;
  /** What the customer reads, for example "GST" or "TVQ". */
  label: string;
  /** 0.05 for 5%. 0 to 0.25, at most 6 decimals (4 as a percentage). */
  rate: number;
}

/** One tax as charged: the component and its amount. */
export interface TaxLine extends TaxComponent {
  amount: number;
}

export interface TaxRegistration {
  /** 9 digits, RT, 4 digits: "123456789RT0001". */
  gst_hst_number?: string | null;
  /** Free text, at most 30 characters. */
  pst_number?: string | null;
  /** 10 digits, TQ, 4 digits: "1234567890TQ0001". */
  qst_number?: string | null;
}

export interface TaxSettings {
  workshop_id: string;
  province: ProvinceCode;
  components: TaxComponent[];
  registration: TaxRegistration;
  updated_at: string | null;
}

export const TAX_CODES: TaxCode[] = ['GST', 'HST', 'PST', 'QST', 'RST'];
export const TAX_CODE_NAME: Record<TaxCode, string> = {
  GST: 'Goods and Services Tax',
  HST: 'Harmonized Sales Tax',
  PST: 'Provincial Sales Tax',
  QST: 'Quebec Sales Tax',
  RST: 'Retail Sales Tax (Manitoba)',
};
export const MAX_TAX_COMPONENTS = 3;
export const MAX_TAX_RATE = 0.25;
export const MAX_TAX_LABEL = 30;
export const MAX_PST_NUMBER = 30;

const gst: TaxComponent = { code: 'GST', label: 'GST', rate: 0.05 };
const hst = (rate: number): TaxComponent[] => [{ code: 'HST', label: 'HST', rate }];

export interface Province {
  code: ProvinceCode;
  name: string;
  components: TaxComponent[];
}

/** Every province and territory, alphabetical by name, with its usual taxes (same as default_tax_components()). */
export const PROVINCES: Province[] = [
  { code: 'AB', name: 'Alberta', components: [gst] },
  { code: 'BC', name: 'British Columbia', components: [gst, { code: 'PST', label: 'PST', rate: 0.07 }] },
  { code: 'MB', name: 'Manitoba', components: [gst, { code: 'RST', label: 'RST', rate: 0.07 }] },
  { code: 'NB', name: 'New Brunswick', components: hst(0.15) },
  { code: 'NL', name: 'Newfoundland and Labrador', components: hst(0.15) },
  { code: 'NT', name: 'Northwest Territories', components: [gst] },
  { code: 'NS', name: 'Nova Scotia', components: hst(0.14) },
  { code: 'NU', name: 'Nunavut', components: [gst] },
  { code: 'ON', name: 'Ontario', components: hst(0.13) },
  { code: 'PE', name: 'Prince Edward Island', components: hst(0.15) },
  { code: 'QC', name: 'Quebec', components: [gst, { code: 'QST', label: 'QST', rate: 0.09975 }] },
  { code: 'SK', name: 'Saskatchewan', components: [gst, { code: 'PST', label: 'PST', rate: 0.06 }] },
  { code: 'YT', name: 'Yukon', components: [gst] },
];

export function isProvinceCode(v: unknown): v is ProvinceCode {
  return typeof v === 'string' && PROVINCES.some((p) => p.code === v);
}

/** A copy of the province's usual taxes (Alberta's for an unknown code). */
export function defaultTaxComponents(province: string): TaxComponent[] {
  const p = PROVINCES.find((x) => x.code === province.trim().toUpperCase()) ?? PROVINCES[0];
  return p.components.map((c) => ({ ...c }));
}

/** What every workshop starts with, and what to use when the settings cannot be read. */
export const FALLBACK_TAX_COMPONENTS: TaxComponent[] = [{ ...gst }];

// Math ---------------------------------------------------------------------------------------------------------------

const RATE_SCALE = 1_000_000n; // rates are stored with at most 6 decimals

function toCents(amount: number): bigint {
  // Amounts are already cents-exact in practice; the database rounds the taxable base to the cent first too.
  return BigInt(Math.round((Number(amount) || 0) * 100));
}

function rateUnits(rate: number): bigint {
  return BigInt(Math.round((Number(rate) || 0) * 1_000_000));
}

/** round(cents * units / 1e6) half away from zero, like Postgres round(numeric). */
function roundDiv(n: bigint, d: bigint): bigint {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = (a * 2n + d) / (2n * d);
  return neg ? -q : q;
}

/** The taxes on a taxable subtotal: each component on the full amount, rounded half-up to the cent. */
export function computeTaxes(taxableSubtotal: number, components: readonly TaxComponent[]): TaxLine[] {
  const base = toCents(taxableSubtotal);
  return components.map((c) => ({
    code: c.code,
    label: c.label,
    rate: c.rate,
    amount: Number(roundDiv(base * rateUnits(c.rate), RATE_SCALE)) / 100,
  }));
}

/** The sum of the tax lines, to the cent. */
export function sumTaxes(lines: readonly Pick<TaxLine, 'amount'>[]): number {
  return Math.round(lines.reduce((a, l) => a + Math.round((Number(l.amount) || 0) * 100), 0)) / 100;
}

/** The combined rate (0.12 for GST 5% + PST 7%). */
export function combinedTaxRate(components: readonly Pick<TaxComponent, 'rate'>[]): number {
  return Number(components.reduce((a, c) => a + rateUnits(c.rate), 0n)) / 1_000_000;
}

/** Tax on one line or amount: zero when it is exempt. */
export function taxOnAmount(amount: number, components: readonly TaxComponent[], taxable = true): number {
  return taxable ? sumTaxes(computeTaxes(amount, components)) : 0;
}

// Labels -------------------------------------------------------------------------------------------------------------

/** 0.09975 -> "9.975%", 0.05 -> "5%". */
export function formatTaxRate(rate: number): string {
  const pct = Number(rateUnits(rate)) / 10_000;
  return `${Number(pct.toFixed(4))}%`;
}

/** "GST 5%", or with style 'paren' "GST (5%)". */
export function formatTaxLabel(c: Pick<TaxComponent, 'label' | 'rate'> & { code?: string }, style: 'plain' | 'paren' = 'plain'): string {
  const name = (c.label || c.code || 'Tax').trim();
  return style === 'paren' ? `${name} (${formatTaxRate(c.rate)})` : `${name} ${formatTaxRate(c.rate)}`;
}

/** "123456789RT0001" -> "123456789 RT0001"; "1234567890TQ0001" -> "1234567890 TQ0001". Other text as is. */
export function formatRegistrationNumber(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  const m = /^(\d{9,10})(RT|TQ)(\d{4})$/.exec(s);
  return m ? `${m[1]} ${m[2]}${m[3]}` : s;
}

/** The lines to print under the shop's details: "GST/HST No. 123456789 RT0001", "PST No. ...", "QST No. ...". */
export function registrationLines(r: TaxRegistration | null | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.gst_hst_number?.trim()) out.push(`GST/HST No. ${formatRegistrationNumber(r.gst_hst_number)}`);
  if (r.pst_number?.trim()) out.push(`PST No. ${r.pst_number.trim()}`);
  if (r.qst_number?.trim()) out.push(`QST No. ${formatRegistrationNumber(r.qst_number)}`);
  return out;
}

// Validation (mirrors the database) ------------------------------------------------------------------------------------

const HAS_CONTROL = /[\u0000-\u001f\u007f]/;

/** GST/HST and QST numbers are stored without spaces or dashes, in capitals. */
export function normalizeRegistrationNumber(v: string): string {
  return v.replace(/[\s-]/g, '').toUpperCase();
}

export function gstHstNumberProblem(v: string | null | undefined): string | null {
  const s = normalizeRegistrationNumber(v ?? '');
  if (!s) return null;
  return /^\d{9}RT\d{4}$/.test(s) ? null : 'The GST/HST number is 9 digits, RT and 4 digits, for example 123456789 RT0001.';
}

export function qstNumberProblem(v: string | null | undefined): string | null {
  const s = normalizeRegistrationNumber(v ?? '');
  if (!s) return null;
  return /^\d{10}TQ\d{4}$/.test(s) ? null : 'The QST number is 10 digits, TQ and 4 digits, for example 1234567890 TQ0001.';
}

export function pstNumberProblem(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (s.length > MAX_PST_NUMBER || HAS_CONTROL.test(s)) return `The PST number can be at most ${MAX_PST_NUMBER} characters.`;
  return null;
}

/** The registration numbers as the database stores them (empty ones left out). */
export function normalizeRegistration(r: TaxRegistration): TaxRegistration {
  const out: TaxRegistration = {};
  const g = normalizeRegistrationNumber(r.gst_hst_number ?? '');
  const q = normalizeRegistrationNumber(r.qst_number ?? '');
  const p = (r.pst_number ?? '').trim();
  if (g) out.gst_hst_number = g;
  if (p) out.pst_number = p;
  if (q) out.qst_number = q;
  return out;
}

export function registrationProblem(r: TaxRegistration): string | null {
  return gstHstNumberProblem(r.gst_hst_number) ?? pstNumberProblem(r.pst_number) ?? qstNumberProblem(r.qst_number);
}

/** The first problem with a list of taxes, or null. Same rules and sentences as tax_components_problem(). */
export function taxComponentsProblem(components: readonly TaxComponent[]): string | null {
  if (!Array.isArray(components)) return 'The taxes must be a list.';
  if (components.length < 1) return 'Add at least one tax.';
  if (components.length > MAX_TAX_COMPONENTS) return `A shop can charge at most ${MAX_TAX_COMPONENTS} taxes.`;
  const seen = new Set<string>();
  let total = 0n;
  for (const c of components) {
    if (!TAX_CODES.includes(c.code)) return 'Each tax type must be GST, HST, PST, QST or RST.';
    if (seen.has(c.code)) return `${c.code} is listed twice.`;
    seen.add(c.code);
    const label = c.label ?? '';
    if (label !== label.trim() || label.length < 1 || label.length > MAX_TAX_LABEL || HAS_CONTROL.test(label)) {
      return `The label of ${c.code} must be 1 to ${MAX_TAX_LABEL} characters.`;
    }
    if (typeof c.rate !== 'number' || !Number.isFinite(c.rate)) return `The rate of ${label} must be a number.`;
    if (c.rate < 0 || c.rate > MAX_TAX_RATE) return `The rate of ${label} must be between 0% and 25%.`;
    if (Math.abs(c.rate * 1_000_000 - Math.round(c.rate * 1_000_000)) > 1e-6) {
      return `The rate of ${label} can have at most 4 decimals as a percentage (for example 9.975%).`;
    }
    total += rateUnits(c.rate);
  }
  if (seen.has('HST') && components.length > 1) return 'HST already combines GST and the provincial tax: charge HST on its own.';
  if (total > 250_000n) return 'The taxes add up to more than 25%.';
  return null;
}

// Reading rows -----------------------------------------------------------------------------------------------------------

/** Tax components from a jsonb value; null when they are not a valid list. */
export function parseTaxComponents(v: unknown): TaxComponent[] | null {
  if (!Array.isArray(v)) return null;
  const out: TaxComponent[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') return null;
    const o = x as Record<string, unknown>;
    const code = String(o.code ?? '') as TaxCode;
    if (!TAX_CODES.includes(code)) return null;
    const rate = Number(o.rate);
    if (!Number.isFinite(rate)) return null;
    out.push({ code, label: String(o.label ?? code) || code, rate });
  }
  return out.length ? out : null;
}

/** Tax lines stored on an invoice (invoices.taxes); empty when there are none. */
export function parseTaxLines(v: unknown): TaxLine[] {
  if (!Array.isArray(v)) return [];
  const out: TaxLine[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const code = String(o.code ?? 'GST') as TaxCode;
    out.push({ code, label: String(o.label ?? code) || code, rate: Number(o.rate) || 0, amount: Number(o.amount) || 0 });
  }
  return out;
}

/**
 * The tax lines of an invoice row: invoices.taxes (migration 029), or one GST line from the old gst / gst_rate
 * columns for invoices made before it.
 */
export function invoiceTaxLines(row: Record<string, unknown>): TaxLine[] {
  const lines = parseTaxLines(row.taxes);
  if (lines.length) return lines;
  const g = Number(row.gst) || 0;
  const rate = Number(row.gst_rate);
  return [{ code: 'GST', label: 'GST', rate: Number.isFinite(rate) && row.gst_rate !== null && row.gst_rate !== undefined ? rate : 0.05, amount: g }];
}

/** The components (no amounts) behind an invoice's tax lines. */
export function invoiceTaxComponents(row: Record<string, unknown>): TaxComponent[] {
  return invoiceTaxLines(row).map(({ code, label, rate }) => ({ code, label, rate }));
}

export function parseRegistration(v: unknown): TaxRegistration {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : undefined);
  const out: TaxRegistration = {};
  const g = s('gst_hst_number');
  const p = s('pst_number');
  const q = s('qst_number');
  if (g) out.gst_hst_number = g;
  if (p) out.pst_number = p;
  if (q) out.qst_number = q;
  return out;
}

/** A workshop_tax_settings row; null when it is not usable. */
export function parseTaxSettings(row: Record<string, unknown> | null | undefined): TaxSettings | null {
  if (!row) return null;
  const components = parseTaxComponents(row.components);
  if (!components) return null;
  return {
    workshop_id: String(row.workshop_id ?? ''),
    province: isProvinceCode(row.province) ? row.province : 'AB',
    components,
    registration: parseRegistration(row.registration),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}
