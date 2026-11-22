/**
 * Canadian public holidays per province or territory, for adding as closed
 * dates. These are a convenience only: rules change and some days depend on
 * the employer or the industry, so the workshop should check its province's
 * official list of statutory (general) holidays.
 *
 * Dates are calendar days ('YYYY-MM-DD'); no time zone is involved.
 */

export const HOLIDAY_REGIONS = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT', 'CA'] as const;
export type HolidayRegion = (typeof HOLIDAY_REGIONS)[number];

export const HOLIDAY_REGION_NAMES: Record<HolidayRegion, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
  CA: 'Federal holidays only',
};

export interface Holiday {
  date: string;
  name: string;
  statutory: boolean;
}

export function isHolidayRegion(value: unknown): value is HolidayRegion {
  return typeof value === 'string' && (HOLIDAY_REGIONS as readonly string[]).includes(value);
}

const pad = (n: number) => String(n).padStart(2, '0');

function key(year: number, month: number, day: number): string {
  const t = new Date(Date.UTC(year, month - 1, day));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday ... 6 = Saturday. */
function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Day of the month of the nth given weekday (n = 1 is the first). */
function nthWeekday(year: number, month: number, wd: number, n: number): number {
  const first = weekday(year, month, 1);
  return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
}

/** Day of the month of the last given weekday. */
function lastWeekday(year: number, month: number, wd: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return days - ((weekday(year, month, days) - wd + 7) % 7);
}

/** Easter Sunday as [month, day], by the anonymous Gregorian algorithm. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const FEBRUARY_HOLIDAY: Partial<Record<HolidayRegion, string>> = {
  AB: 'Family Day',
  BC: 'Family Day',
  ON: 'Family Day',
  SK: 'Family Day',
  NB: 'Family Day',
  MB: 'Louis Riel Day',
  PE: 'Islander Day',
  NS: 'Heritage Day',
};

/** First Monday of August: its name and whether it is a statutory holiday. */
const AUGUST_HOLIDAY: Partial<Record<HolidayRegion, [string, boolean]>> = {
  AB: ['Heritage Day', false],
  BC: ['British Columbia Day', true],
  SK: ['Saskatchewan Day', true],
  NB: ['New Brunswick Day', true],
  NT: ['Civic Holiday', true],
  NU: ['Civic Holiday', true],
  MB: ['Terry Fox Day', false],
  NS: ['Natal Day', false],
  ON: ['Civic Holiday', false],
  PE: ['Civic Holiday', false],
  CA: ['Civic Holiday', false],
};

const TRUTH_AND_RECONCILIATION: HolidayRegion[] = ['CA', 'BC', 'PE', 'NT', 'NU', 'YT'];

/** The holidays of one year in a province or territory (CA: federal only), in date order. */
export function canadianHolidays(year: number, region: HolidayRegion): Holiday[] {
  const out: Holiday[] = [];
  const add = (month: number, day: number, name: string, statutory: boolean) => out.push({ date: key(year, month, day), name, statutory });
  const MON = 1;
  const SUN = 0;

  add(1, 1, "New Year's Day", true);

  const feb = FEBRUARY_HOLIDAY[region];
  if (feb) add(2, nthWeekday(year, 2, MON, 3), feb, true);
  // Yukon: the Friday before the last Sunday of February.
  if (region === 'YT') add(2, lastWeekday(year, 2, SUN) - 2, 'Yukon Heritage Day', true);

  const [em, ed] = easterSunday(year);
  add(em, ed - 2, 'Good Friday', true);
  // Federal public service only; not a general holiday under the Canada Labour Code.
  if (region === 'CA') add(em, ed + 1, 'Easter Monday', false);

  // The Monday before 25 May (18 to 24 May).
  const victoria = 24 - ((weekday(year, 5, 24) - MON + 7) % 7);
  if (region === 'QC') add(5, victoria, "National Patriots' Day", true);
  else add(5, victoria, 'Victoria Day', !['NS', 'NB', 'PE', 'NL'].includes(region));

  // Quebec moves the Fete nationale to 25 June when the 24th is a Sunday.
  if (region === 'QC') add(6, weekday(year, 6, 24) === SUN ? 25 : 24, 'Saint-Jean-Baptiste Day (Fete nationale)', true);

  add(7, weekday(year, 7, 1) === SUN ? 2 : 1, 'Canada Day', true);

  const aug = AUGUST_HOLIDAY[region];
  if (aug) add(8, nthWeekday(year, 8, MON, 1), aug[0], aug[1]);
  if (region === 'YT') add(8, nthWeekday(year, 8, MON, 3), 'Discovery Day', true);

  add(9, nthWeekday(year, 9, MON, 1), 'Labour Day', true);
  if (TRUTH_AND_RECONCILIATION.includes(region)) add(9, 30, 'National Day for Truth and Reconciliation', true);

  add(10, nthWeekday(year, 10, MON, 2), 'Thanksgiving', !['NS', 'NB', 'PE', 'NL'].includes(region));
  add(11, 11, 'Remembrance Day', !['ON', 'QC', 'NS', 'MB'].includes(region));
  add(12, 25, 'Christmas Day', true);
  add(12, 26, 'Boxing Day', region === 'ON' || region === 'CA');

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
