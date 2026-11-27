/**
 * Typed data access for bookings (supabase/migrations/008): appointments, the
 * booking settings, weekly opening hours and closed dates. Row level security
 * decides who may read and change them (appointments follow the repair-orders
 * module; settings, hours and closures need full Settings access to change).
 *
 * Times are stored as UTC instants and shown in the workshop's own time zone
 * (booking_settings.time_zone). Calendar days are handled as 'YYYY-MM-DD'
 * keys in that time zone, so the browser's own zone never matters.
 */
import type { ServiceRow } from '@eurowerken/shared';
import { supabase } from '@/lib/supabase';
import { APPOINTMENT_STATUS_LABEL } from '@/lib/status';
import { canadianHolidays, isHolidayRegion } from '@/lib/holidays';
import type { Holiday, HolidayRegion } from '@/lib/holidays';
import { friendlyError } from './catalogue';
import type { Validated } from './catalogue';

// Types -----------------------------------------------------------------------------

export const APPOINTMENT_STATUSES = ['requested', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that hold a bay (the same list available_slots counts). */
export const ACTIVE_STATUSES: AppointmentStatus[] = ['requested', 'confirmed', 'checked_in'];

export type Urgency = 'routine' | 'soon' | 'urgent';

export interface AppointmentVehicle {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  vin?: string | null;
  plate?: string | null;
}

export interface AppointmentService {
  id: string;
  name: string;
  price_from: number;
}

export interface Appointment {
  id: string;
  workshop_id: string;
  reference: string;
  status: AppointmentStatus;
  starts_at: string;
  duration_minutes: number;
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle: AppointmentVehicle;
  services: AppointmentService[];
  urgency: Urgency;
  notes: string | null;
  technician_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  remind_email: boolean;
  remind_sms: boolean;
  estimate_low: number | null;
  estimate_high: number | null;
  deposit_requested: boolean;
  source: 'online' | 'staff';
  staff_notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
}

export interface BookingSettings {
  time_zone: string;
  slot_minutes: number;
  bays: number;
  min_notice_hours: number;
  max_days_ahead: number;
  auto_confirm: boolean;
  /** The standard hourly labour rate in CAD (migration 011). */
  labour_rate: number;
  /** Province or territory for the holiday list (CA: federal only). */
  holiday_region: HolidayRegion;
}

/**
 * One weekday's opening hours. weekday 0 = Sunday. Times are 'HH:MM'.
 * opens2 and closes2 are an optional second period the same day (migration
 * 014), after the first: opens < closes <= opens2 < closes2.
 */
export interface WorkshopHours {
  weekday: number;
  closed: boolean;
  opens: string | null;
  closes: string | null;
  opens2: string | null;
  closes2: string | null;
}

export interface Closure {
  id: string;
  day: string;
  reason: string | null;
}

export interface BookingContext {
  settings: BookingSettings;
  /** False when the workshop has no settings row yet (the defaults are shown). */
  settingsSaved: boolean;
  /** Always seven rows, Sunday first. */
  hours: WorkshopHours[];
  closures: Closure[];
}

export interface Technician {
  id: string;
  name: string;
  role_title: string | null;
}

export interface FreeTime {
  starts_at: string;
  remaining: number;
}

export const DEFAULT_SETTINGS: BookingSettings = {
  time_zone: 'America/Edmonton',
  slot_minutes: 30,
  bays: 2,
  min_notice_hours: 2,
  max_days_ahead: 90,
  auto_confirm: false,
  labour_rate: 0,
  holiday_region: 'AB',
};

export const SLOT_MINUTES = [15, 20, 30, 45, 60] as const;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Common North American time zones for the settings picker. */
export const COMMON_TIME_ZONES: { id: string; label: string }[] = [
  { id: 'America/St_Johns', label: 'Newfoundland (St. John\'s)' },
  { id: 'America/Halifax', label: 'Atlantic (Halifax)' },
  { id: 'America/Toronto', label: 'Eastern (Toronto)' },
  { id: 'America/New_York', label: 'Eastern (New York)' },
  { id: 'America/Winnipeg', label: 'Central (Winnipeg)' },
  { id: 'America/Chicago', label: 'Central (Chicago)' },
  { id: 'America/Regina', label: 'Saskatchewan (Regina, no DST)' },
  { id: 'America/Edmonton', label: 'Mountain (Edmonton)' },
  { id: 'America/Denver', label: 'Mountain (Denver)' },
  { id: 'America/Phoenix', label: 'Arizona (Phoenix, no DST)' },
  { id: 'America/Vancouver', label: 'Pacific (Vancouver)' },
  { id: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { id: 'America/Whitehorse', label: 'Yukon (Whitehorse)' },
  { id: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { id: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600];

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Errors ----------------------------------------------------------------------------

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

function fail(err: DbError): never {
  const text = `${err.message} ${err.details ?? ''}`;
  // Raised by a database trigger (for example a booking outside opening hours): its message names the problem.
  if (err.code === 'P0001') throw new Error(err.message);
  if (/workshop_hours_second_period_check/i.test(text)) {
    throw new Error('The second opening period must start at or after the first one closes, and close after it opens.');
  }
  if (/(opens2|closes2)/i.test(text)) throw new Error('Apply database migration 014 to use split hours.');
  if (err.code === 'PGRST204' || /column .*(labour_rate|holiday_region)|(labour_rate|holiday_region).*column/i.test(text)) {
    throw new Error('The database does not have the labour rate and holiday settings yet. Apply migration 011 (npm run db:migrate).');
  }
  if (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    err.code === 'PGRST202' ||
    /relation .* does not exist|schema cache|could not find the function/i.test(text)
  ) {
    throw new Error('The database is not set up for bookings yet. Apply migration 008 (npm run db:migrate).');
  }
  if ((err.code === '23505' || /duplicate key/i.test(text)) && /closure/i.test(text)) {
    throw new Error('That date is already in the closed dates list.');
  }
  if (/contact_email/i.test(text)) throw new Error('Enter a valid email address.');
  if (/opens.*closes|workshop_hours_check/i.test(text)) throw new Error('Each open day needs an opening time before its closing time.');
  throw new Error(friendlyError(err));
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Time zones and day keys -------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** True when the browser knows the IANA time zone name. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** A time zone that is safe to format with (falls back to the default). */
export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_SETTINGS.time_zone;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(date: Date, tz: string): WallClock {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function zoneOffset(date: Date, tz: string): number {
  const w = wallClock(date, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

/** The instant a wall-clock time on a day happens in the zone. */
export function zonedToUtc(dayKey: string, time: string, tz: string): Date {
  const [y, m, d] = parseKey(dayKey);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const first = zoneOffset(new Date(guess), tz);
  let t = guess - first;
  const second = zoneOffset(new Date(t), tz);
  if (second !== first) t = guess - second;
  return new Date(t);
}

/** The day key ('YYYY-MM-DD') of an instant in the zone. */
export function dayKeyOf(iso: string | Date, tz: string): string {
  const w = wallClock(typeof iso === 'string' ? new Date(iso) : iso, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Minutes since midnight of an instant in the zone. */
export function minutesOfDay(iso: string | Date, tz: string): number {
  const w = wallClock(typeof iso === 'string' ? new Date(iso) : iso, tz);
  return w.hour * 60 + w.minute;
}

/** 'HH:MM' of an instant in the zone, for a time input. */
export function timeInputOf(iso: string | Date, tz: string): string {
  const m = minutesOfDay(iso, tz);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function todayKey(tz: string): string {
  return dayKeyOf(new Date(), tz);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday ... 6 = Saturday, as in workshop_hours. */
export function weekdayOf(key: string): number {
  const [y, m, d] = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday of the week the day is in. */
export function weekStart(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

export function isDayKey(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && addDays(text, 0) === text;
}

export function isTimeText(text: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

function timeToMinutes(text: string): number {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

/** Database times come as 'HH:MM:SS'. */
function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

// Formatting -----------------------------------------------------------------------------

const displayFormatters = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string, options: Intl.DateTimeFormatOptions, id: string): Intl.DateTimeFormat {
  const k = `${tz}|${id}`;
  let f = displayFormatters.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...options });
    displayFormatters.set(k, f);
  }
  return f;
}

/** 9:30 a.m. */
export function formatTime(iso: string, tz: string): string {
  return fmt(tz, { hour: 'numeric', minute: '2-digit' }, 'time').format(new Date(iso));
}

/** Mon, Nov 24, 2026, 9:30 a.m. */
export function formatDateTime(iso: string | null, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return fmt(tz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }, 'dt').format(d);
}

/** Time range: 9:30 a.m. to 10:30 a.m. */
export function formatTimeRange(a: Pick<Appointment, 'starts_at' | 'duration_minutes'>, tz: string): string {
  const end = new Date(new Date(a.starts_at).getTime() + a.duration_minutes * 60_000).toISOString();
  return `${formatTime(a.starts_at, tz)} to ${formatTime(end, tz)}`;
}

function keyToNoon(key: string): Date {
  const [y, m, d] = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** A day key in words. style long: Monday, November 24; short: Mon 24. */
export function formatDayKey(key: string, style: 'long' | 'short' | 'medium' = 'long'): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
      : style === 'medium'
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { weekday: 'short', day: 'numeric' };
  return fmt('UTC', options, `day-${style}`).format(keyToNoon(key));
}

/** The visible range in words, for the toolbar. */
export function formatRange(days: string[]): string {
  if (days.length === 1) return formatDayKey(days[0], 'long');
  const first = keyToNoon(days[0]);
  const last = keyToNoon(days[days.length - 1]);
  const f = fmt('UTC', { month: 'short', day: 'numeric' }, 'md');
  return `${f.format(first)} to ${f.format(last)}, ${last.getUTCFullYear()}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function vehicleLabel(v: AppointmentVehicle): string {
  return [v.year, v.make, v.model].filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' ');
}

export function servicesLabel(a: Pick<Appointment, 'services'>): string {
  return a.services.map((s) => s.name).join(', ');
}

/** tel: wants the digits and a leading plus only. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function endOf(a: Pick<Appointment, 'starts_at' | 'duration_minutes'>): Date {
  return new Date(new Date(a.starts_at).getTime() + a.duration_minutes * 60_000);
}

// Rows ------------------------------------------------------------------------------------

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined || v === '' ? null : num(v);
}

function normalize(row: Record<string, unknown>): Appointment {
  const services = Array.isArray(row.services) ? (row.services as Record<string, unknown>[]) : [];
  const vehicle = row.vehicle && typeof row.vehicle === 'object' ? (row.vehicle as AppointmentVehicle) : {};
  return {
    ...(row as unknown as Appointment),
    vehicle,
    services: services.map((s) => ({ id: String(s.id ?? ''), name: String(s.name ?? ''), price_from: num(s.price_from) })),
    estimate_low: numOrNull(row.estimate_low),
    estimate_high: numOrNull(row.estimate_high),
    duration_minutes: num(row.duration_minutes) || 60,
  };
}

// Booking settings, hours, closures ---------------------------------------------------------

interface HoursRow {
  weekday: number;
  closed: boolean;
  opens: string | null;
  closes: string | null;
  /** Missing before migration 014. */
  opens2?: string | null;
  closes2?: string | null;
}

/** A weekday with no hours: closed. */
export function closedHours(weekday: number): WorkshopHours {
  return { weekday, closed: true, opens: null, closes: null, opens2: null, closes2: null };
}

function fillHours(rows: HoursRow[]): WorkshopHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const r = rows.find((x) => x.weekday === wd);
    // A weekday with no row is not bookable (available_slots skips it), so it shows as closed.
    if (!r) return closedHours(wd);
    const opens2 = shortTime(r.opens2 ?? null);
    const closes2 = shortTime(r.closes2 ?? null);
    const second = opens2 !== null && closes2 !== null;
    return {
      weekday: wd,
      closed: r.closed,
      opens: shortTime(r.opens),
      closes: shortTime(r.closes),
      opens2: second ? opens2 : null,
      closes2: second ? closes2 : null,
    };
  });
}

/** A settings row, with defaults for columns an older database does not have yet. */
function normalizeSettings(row: Record<string, unknown>): BookingSettings {
  const rate = num(row.labour_rate);
  return {
    time_zone: safeTimeZone(row.time_zone as string | null),
    slot_minutes: num(row.slot_minutes) || DEFAULT_SETTINGS.slot_minutes,
    bays: num(row.bays) || DEFAULT_SETTINGS.bays,
    min_notice_hours: num(row.min_notice_hours),
    max_days_ahead: num(row.max_days_ahead) || DEFAULT_SETTINGS.max_days_ahead,
    auto_confirm: Boolean(row.auto_confirm),
    labour_rate: Number.isFinite(rate) ? rate : 0,
    holiday_region: isHolidayRegion(row.holiday_region) ? row.holiday_region : DEFAULT_SETTINGS.holiday_region,
  };
}

export async function getBookingContext(workshopId: string): Promise<BookingContext> {
  const [s, h, c] = await Promise.all([
    supabase
      .from('booking_settings')
      .select('*')
      .eq('workshop_id', workshopId)
      .maybeSingle(),
    // '*' so a database without migration 014 (no opens2 / closes2 yet) still loads.
    supabase.from('workshop_hours').select('*').eq('workshop_id', workshopId),
    supabase.from('workshop_closures').select('id, day, reason').eq('workshop_id', workshopId).order('day'),
  ]);
  if (s.error) fail(s.error);
  if (h.error) fail(h.error);
  if (c.error) fail(c.error);
  const row = s.data as Record<string, unknown> | null;
  return {
    settings: row ? normalizeSettings(row) : DEFAULT_SETTINGS,
    settingsSaved: Boolean(row),
    hours: fillHours((h.data ?? []) as HoursRow[]),
    closures: (c.data ?? []) as Closure[],
  };
}

/** The workshop's time zone alone (for the dashboard card). */
export async function getTimeZone(workshopId: string): Promise<string> {
  const { data, error } = await supabase.from('booking_settings').select('time_zone').eq('workshop_id', workshopId).maybeSingle();
  if (error) fail(error);
  return safeTimeZone((data as { time_zone: string } | null)?.time_zone);
}

export interface SettingsDraft {
  /** A zone from the list, or 'other' to type one. */
  zone_choice: string;
  zone_other: string;
  slot_minutes: string;
  bays: string;
  min_notice_hours: string;
  max_days_ahead: string;
  auto_confirm: boolean;
  labour_rate: string;
  holiday_region: HolidayRegion;
}

export function settingsDraft(s: BookingSettings): SettingsDraft {
  const listed = COMMON_TIME_ZONES.some((z) => z.id === s.time_zone);
  return {
    zone_choice: listed ? s.time_zone : 'other',
    zone_other: listed ? '' : s.time_zone,
    slot_minutes: String(s.slot_minutes),
    bays: String(s.bays),
    min_notice_hours: String(s.min_notice_hours),
    max_days_ahead: String(s.max_days_ahead),
    auto_confirm: s.auto_confirm,
    labour_rate: s.labour_rate.toFixed(2),
    holiday_region: s.holiday_region,
  };
}

function wholeNumber(label: string, text: string, min: number, max: number, errors: string[]): number {
  const t = text.trim();
  const n = /^\d+$/.test(t) ? Number(t) : Number.NaN;
  if (Number.isNaN(n) || n < min || n > max) errors.push(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function validateSettings(d: SettingsDraft): Validated<BookingSettings> {
  const errors: string[] = [];
  const zone = (d.zone_choice === 'other' ? d.zone_other : d.zone_choice).trim();
  if (!isValidTimeZone(zone)) {
    errors.push('Time zone: use an IANA name such as America/Edmonton. This one is not recognised.');
  }
  const slot = Number(d.slot_minutes);
  if (!(SLOT_MINUTES as readonly number[]).includes(slot)) errors.push('Slot length must be 15, 20, 30, 45 or 60 minutes.');
  const value: BookingSettings = {
    time_zone: zone,
    slot_minutes: slot,
    bays: wholeNumber('Bays', d.bays, 1, 50, errors),
    min_notice_hours: wholeNumber('Minimum notice', d.min_notice_hours, 0, 168, errors),
    max_days_ahead: wholeNumber('Booking window', d.max_days_ahead, 1, 365, errors),
    auto_confirm: d.auto_confirm,
    labour_rate: labourRate(d.labour_rate, errors),
    holiday_region: d.holiday_region,
  };
  if (!isHolidayRegion(d.holiday_region)) errors.push('Choose a province or territory for the holiday list.');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** CAD with at most two decimals, 0 to 1000. A leading dollar sign and spaces are ignored. */
function labourRate(text: string, errors: string[]): number {
  const t = text.trim().replace(/^\$\s*/, '');
  const n = /^\d{1,4}(\.\d{1,2})?$/.test(t) ? Number(t) : Number.NaN;
  if (Number.isNaN(n) || n < 0 || n > 1000) {
    errors.push('Standard hourly labour rate must be an amount from 0 to 1000, with at most two decimals (for example 145.00).');
  }
  return Math.round(n * 100) / 100;
}

export async function saveBookingSettings(workshopId: string, s: BookingSettings): Promise<BookingSettings> {
  const { data, error } = await supabase
    .from('booking_settings')
    .upsert({ workshop_id: workshopId, ...s }, { onConflict: 'workshop_id' })
    .select('*')
    .single();
  if (error) fail(error);
  return normalizeSettings(data as Record<string, unknown>);
}

/** Opening and closing times are on the hour or the half hour. */
export const HOURS_STEP = 30;

/** '00:00', '00:30' ... '23:30', for the opening hours selects. */
export const HALF_HOUR_TIMES: string[] = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

/** 'HH:MM' as 9:30 a.m. (no time zone involved). */
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${pad(m)} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

function cleanTime(t: string | null): string | null {
  return t && isTimeText(t) ? t : null;
}

function offGrid(t: string): boolean {
  return timeToMinutes(t) % HOURS_STEP !== 0;
}

/** What is wrong with one day's hours, per period, for inline messages (null when fine or closed). */
export function hoursRowProblems(r: WorkshopHours): { first: string | null; second: string | null } {
  if (r.closed) return { first: null, second: null };
  const opens = cleanTime(r.opens);
  const closes = cleanTime(r.closes);
  let first: string | null = null;
  if (!opens || !closes) first = 'Choose an opening and a closing time.';
  else if (offGrid(opens) || offGrid(closes)) first = 'Use times on the hour or half hour.';
  else if (timeToMinutes(closes) <= timeToMinutes(opens)) first = 'Closing time must be after opening time.';
  let second: string | null = null;
  const hasSecond = r.opens2 !== null || r.closes2 !== null;
  if (hasSecond) {
    const opens2 = cleanTime(r.opens2);
    const closes2 = cleanTime(r.closes2);
    if (!opens2 || !closes2) second = 'Choose an opening and a closing time for the second period, or remove it.';
    else if (offGrid(opens2) || offGrid(closes2)) second = 'Use times on the hour or half hour.';
    else if (timeToMinutes(closes2) <= timeToMinutes(opens2)) second = 'Closing time must be after opening time.';
    else if (closes && timeToMinutes(opens2) < timeToMinutes(closes)) second = 'The second period must start after the first one closes.';
  }
  return { first, second };
}

export function validateHours(rows: WorkshopHours[]): Validated<WorkshopHours[]> {
  const errors: string[] = [];
  const value = rows.map((r) => {
    const name = WEEKDAY_NAMES[r.weekday];
    const p = hoursRowProblems(r);
    if (p.first) errors.push(`${name}: ${p.first}`);
    if (p.second) errors.push(`${name}, second period: ${p.second}`);
    const opens2 = cleanTime(r.opens2);
    const closes2 = cleanTime(r.closes2);
    const second = !r.closed && opens2 !== null && closes2 !== null;
    return {
      weekday: r.weekday,
      closed: r.closed,
      opens: cleanTime(r.opens),
      closes: cleanTime(r.closes),
      opens2: second ? opens2 : null,
      closes2: second ? closes2 : null,
    };
  });
  if (value.every((r) => r.closed)) errors.push('Every day is closed, so nobody can book. Open at least one day.');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** True when any day has a second opening period. */
export function usesSplitHours(rows: WorkshopHours[]): boolean {
  return rows.some((r) => r.opens2 !== null && r.closes2 !== null);
}

/**
 * Saves all seven days at once. opens2 and closes2 are written only when a
 * day uses a second period now or did before (`saved`), so a database
 * without migration 014 can still save single-period hours.
 */
export async function saveHours(workshopId: string, rows: WorkshopHours[], saved: WorkshopHours[] = []): Promise<WorkshopHours[]> {
  const withSecond = usesSplitHours(rows) || usesSplitHours(saved);
  const { data, error } = await supabase
    .from('workshop_hours')
    .upsert(
      rows.map((r) => {
        const base = { workshop_id: workshopId, weekday: r.weekday, closed: r.closed, opens: r.opens, closes: r.closes };
        return withSecond ? { ...base, opens2: r.opens2, closes2: r.closes2 } : base;
      }),
      { onConflict: 'workshop_id,weekday' },
    )
    .select('*');
  if (error) fail(error);
  return fillHours((data ?? []) as HoursRow[]);
}

/** The open periods of a day in minutes since midnight, in order (none when closed). */
export function openPeriods(h: WorkshopHours): TimeWindow[] {
  if (h.closed || !h.opens || !h.closes) return [];
  const out: TimeWindow[] = [{ start: timeToMinutes(h.opens), end: timeToMinutes(h.closes) }];
  if (h.opens2 && h.closes2) out.push({ start: timeToMinutes(h.opens2), end: timeToMinutes(h.closes2) });
  return out;
}

/** '8:00 a.m. to 12:00 p.m. and 1:00 p.m. to 6:00 p.m.', or 'Closed'. */
export function formatHours(h: WorkshopHours): string {
  if (h.closed || !h.opens || !h.closes) return 'Closed';
  const first = `${formatClock(h.opens)} to ${formatClock(h.closes)}`;
  return h.opens2 && h.closes2 ? `${first} and ${formatClock(h.opens2)} to ${formatClock(h.closes2)}` : first;
}

export async function addClosure(workshopId: string, day: string, reason: string): Promise<Closure> {
  if (!isDayKey(day)) throw new Error('Choose a date.');
  const r = reason.trim();
  if (r.length > 80) throw new Error(`The reason can be at most 80 characters (now ${r.length}).`);
  const { data, error } = await supabase
    .from('workshop_closures')
    .insert({ workshop_id: workshopId, day, reason: r || null })
    .select('id, day, reason')
    .single();
  if (error) fail(error);
  return data as Closure;
}

/**
 * Adds several closed dates at once (the holiday picker), skipping dates
 * that are already closed. Returns the rows added.
 */
export async function addClosures(workshopId: string, items: { day: string; reason: string }[], existing: Closure[]): Promise<Closure[]> {
  const taken = new Set(existing.map((c) => c.day));
  const rows = items
    .filter((i) => isDayKey(i.day) && !taken.has(i.day) && (taken.add(i.day), true))
    .map((i) => ({ workshop_id: workshopId, day: i.day, reason: i.reason.trim().slice(0, 80) || null }));
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('workshop_closures')
    .upsert(rows, { onConflict: 'workshop_id,day', ignoreDuplicates: true })
    .select('id, day, reason');
  if (error) fail(error);
  return (data ?? []) as Closure[];
}

/** A year's holidays for the picker, each marked when its date is already closed. */
export function holidayChoices(year: number, region: HolidayRegion, closures: Closure[]): (Holiday & { added: boolean })[] {
  const closed = new Set(closures.map((c) => c.day));
  return canadianHolidays(year, region).map((h) => ({ ...h, added: closed.has(h.date) }));
}

export async function removeClosure(id: string): Promise<void> {
  const { data, error } = await supabase.from('workshop_closures').delete().eq('id', id).select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new Error('Nothing was removed. It may be gone already, or you do not have permission.');
}

/** Closures from today on (in the zone), soonest first. */
export function upcomingClosures(closures: Closure[], tz: string): Closure[] {
  const today = todayKey(tz);
  return closures.filter((c) => c.day >= today).sort((a, b) => a.day.localeCompare(b.day));
}

// Days and the calendar layout ----------------------------------------------------------------

export type CalendarView = 'day' | 'week';

/**
 * Week view is a rolling seven days starting at the anchor (today by default), so upcoming bookings are always on
 * screen, even late in a calendar week.
 */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  if (view === 'day') return [anchor];
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(anchor, i));
}

export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  return addDays(anchor, direction * (view === 'day' ? 1 : 7));
}

export interface DayInfo {
  key: string;
  hours: WorkshopHours;
  closure: Closure | null;
  /** A public holiday in the workshop's region that day (shown as a label; only a closure closes the day). */
  holiday: Holiday | null;
  /** Closed by the weekly hours or by a closure. */
  closed: boolean;
}

const holidayCache = new Map<string, Holiday[]>();

/** The public holiday on a day in the region, if any. */
export function holidayOn(key: string, region: HolidayRegion): Holiday | null {
  const year = Number(key.slice(0, 4));
  const k = `${year}|${region}`;
  let list = holidayCache.get(k);
  if (!list) {
    list = canadianHolidays(year, region);
    holidayCache.set(k, list);
  }
  return list.find((h) => h.date === key) ?? null;
}

export function dayInfo(key: string, ctx: Pick<BookingContext, 'hours' | 'closures'> & { settings?: Pick<BookingSettings, 'holiday_region'> }): DayInfo {
  const hours = ctx.hours[weekdayOf(key)] ?? closedHours(weekdayOf(key));
  const closure = ctx.closures.find((c) => c.day === key) ?? null;
  const holiday = ctx.settings ? holidayOn(key, ctx.settings.holiday_region) : null;
  return { key, hours, closure, holiday, closed: hours.closed || closure !== null };
}

/** Why a day is closed, in words: the closure's reason, or the weekday. */
export function closedReason(info: DayInfo): string {
  if (info.closure) return info.closure.reason || 'closed date';
  return `closed on ${WEEKDAY_NAMES[info.hours.weekday]}s`;
}

export type StartTimes = { closed: true; reason: string } | { closed: false; times: string[] };

/**
 * The start times staff may choose on a day ('HH:MM', workshop time): every
 * slot_minutes from the opening of each period, never in the gap between
 * two periods. The first slot must fit in its period (as the database
 * checks) and the booking must end inside a period: in its own, or, for a
 * long job that runs on past the break, in the next one. Closed days and closures have
 * none. Day keys and times are in the workshop's time zone, which is how
 * the database checks them too.
 */
export function validStartTimes(dayKey: string, ctx: Pick<BookingContext, 'hours' | 'closures' | 'settings'>, durationMinutes: number): StartTimes {
  if (!isDayKey(dayKey)) return { closed: false, times: [] };
  const info = dayInfo(dayKey, ctx);
  const periods = openPeriods(info.hours);
  if (info.closed || periods.length === 0) return { closed: true, reason: closedReason(info) };
  const step = ctx.settings.slot_minutes > 0 ? ctx.settings.slot_minutes : 30;
  const length = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : step;
  const lastClose = periods[periods.length - 1].end;
  const times: string[] = [];
  periods.forEach((p, i) => {
    const next = periods[i + 1];
    for (let m = p.start; m + Math.min(length, step) <= p.end; m += step) {
      const end = m + length;
      // Ends in its own period, or runs on past the break and ends in the next one (never in the gap).
      if (end <= p.end || (next !== undefined && end >= next.start && end <= lastClose)) times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
  });
  return { closed: false, times };
}

/**
 * The empty slots of a day a click can book from (the calendar): the valid
 * start times for one slot length, from now on.
 */
export function bookableSlots(dayKey: string, ctx: Pick<BookingContext, 'hours' | 'closures' | 'settings'>, now: Date): string[] {
  const r = validStartTimes(dayKey, ctx, ctx.settings.slot_minutes);
  if (r.closed) return [];
  const tz = ctx.settings.time_zone;
  return r.times.filter((t) => zonedToUtc(dayKey, t, tz).getTime() > now.getTime());
}

/** The first start time on a day, or '' when there is none. */
export function firstStartTime(dayKey: string, ctx: Pick<BookingContext, 'hours' | 'closures' | 'settings'>, durationMinutes: number): string {
  const r = validStartTimes(dayKey, ctx, durationMinutes);
  return r.closed ? '' : (r.times[0] ?? '');
}

export interface TimeWindow {
  /** Minutes since midnight. */
  start: number;
  end: number;
}

/**
 * The hours a timeline shows: from the earliest opening to the latest
 * closing of the week, widened to whole hours and to fit any appointment
 * booked outside opening hours.
 */
export function timelineWindow(hours: WorkshopHours[], appts: Appointment[], tz: string): TimeWindow {
  const periods = hours.flatMap(openPeriods);
  let start = periods.length ? Math.min(...periods.map((p) => p.start)) : 8 * 60;
  let end = periods.length ? Math.max(...periods.map((p) => p.end)) : 18 * 60;
  for (const a of appts) {
    const s = minutesOfDay(a.starts_at, tz);
    start = Math.min(start, s);
    end = Math.max(end, Math.min(24 * 60, s + a.duration_minutes));
  }
  start = Math.floor(start / 60) * 60;
  end = Math.max(start + 60, Math.ceil(end / 60) * 60);
  return { start, end };
}

/**
 * The hours the calendar shows: from the earliest opening to the latest
 * closing (of either period) among the visible days that are open (the whole week's hours when
 * none is), widened to whole hours and to fit any appointment booked outside
 * opening hours before the database refused those.
 */
export function visibleWindow(days: DayInfo[], weekHours: WorkshopHours[], appts: Appointment[], tz: string): TimeWindow {
  const fromDays = days.filter((d) => !d.closed && d.hours.opens && d.hours.closes).map((d) => d.hours);
  return timelineWindow(fromDays.length > 0 ? fromDays : weekHours, appts, tz);
}

export interface PlacedAppointment {
  appt: Appointment;
  /** Minutes since midnight, clamped to the window. */
  start: number;
  end: number;
  /** Side-by-side position among overlapping appointments. */
  lane: number;
  lanes: number;
}

/** Places one day's appointments in lanes so overlapping ones sit side by side. */
export function layoutDay(appts: Appointment[], tz: string, window: TimeWindow): PlacedAppointment[] {
  const items = appts
    .map((appt) => {
      const s = minutesOfDay(appt.starts_at, tz);
      return {
        appt,
        start: Math.max(window.start, s),
        end: Math.min(window.end, Math.max(s + appt.duration_minutes, s + 15)),
      };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedAppointment[] = [];
  let cluster: PlacedAppointment[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const p of cluster) p.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) closeCluster();
  return placed;
}

/** Appointments grouped by their day key in the zone. */
export function groupByDay(appts: Appointment[], tz: string): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const a of appts) {
    const k = dayKeyOf(a.starts_at, tz);
    const list = map.get(k);
    if (list) list.push(a);
    else map.set(k, [a]);
  }
  for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return map;
}

export function matchesSearch(a: Appointment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && a.contact_phone && a.contact_phone.replace(/\D/g, '').includes(digits)) return true;
  const plate = (a.vehicle.plate ?? '').toLowerCase().replace(/[\s-]/g, '');
  if (plate && plate.includes(q.replace(/[\s-]/g, ''))) return true;
  return [a.contact_name, a.reference, a.contact_email, a.contact_phone].some((v) => v?.toLowerCase().includes(q));
}

export function countByStatus(appts: Appointment[]): Record<AppointmentStatus, number> {
  const out = Object.fromEntries(APPOINTMENT_STATUSES.map((s) => [s, 0])) as Record<AppointmentStatus, number>;
  for (const a of appts) out[a.status] += 1;
  return out;
}

// Appointments: reading ----------------------------------------------------------------------

/** Appointments that start on the given days (inclusive, in the zone), earliest first. */
export async function listAppointments(
  workshopId: string,
  range: { from: string; to: string },
  tz: string,
  statuses?: AppointmentStatus[],
): Promise<Appointment[]> {
  const start = zonedToUtc(range.from, '00:00', tz).toISOString();
  const end = zonedToUtc(addDays(range.to, 1), '00:00', tz).toISOString();
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('workshop_id', workshopId)
    .gte('starts_at', start)
    .lt('starts_at', end)
    .order('starts_at');
  if (statuses && statuses.length > 0) query = query.in('status', statuses);
  const { data, error } = await query;
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/** Every upcoming booking still waiting to be confirmed (any day), soonest first. */
export async function listAwaitingConfirmation(workshopId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('status', 'requested')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(50);
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const { data, error } = await supabase.from('appointments').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  return data ? normalize(data as Record<string, unknown>) : null;
}

/**
 * Today's appointments for the dashboard: the ones still to come or under
 * way (not cancelled, no-show or completed), soonest first.
 */
export async function getTodayAppointments(
  workshopId: string,
): Promise<{ tz: string; upcoming: Appointment[]; total: number }> {
  const tz = await getTimeZone(workshopId);
  const today = todayKey(tz);
  const all = await listAppointments(workshopId, { from: today, to: today }, tz);
  const now = Date.now();
  const upcoming = all.filter((a) => ACTIVE_STATUSES.includes(a.status) && endOf(a).getTime() > now);
  return { tz, upcoming, total: all.filter((a) => a.status !== 'cancelled').length };
}

// Appointments: changing ---------------------------------------------------------------------

export interface StatusAction {
  to: AppointmentStatus;
  label: string;
  /** Cancelling asks for a reason. */
  needsReason: boolean;
  /** Visual weight of the button. */
  kind: 'primary' | 'ghost' | 'danger';
}

/** The status changes that make sense from the current status. */
export function statusActions(status: AppointmentStatus): StatusAction[] {
  switch (status) {
    case 'requested':
      return [
        { to: 'confirmed', label: 'Confirm', needsReason: false, kind: 'primary' },
        { to: 'cancelled', label: 'Decline', needsReason: true, kind: 'danger' },
      ];
    case 'confirmed':
      return [
        { to: 'checked_in', label: 'Check in', needsReason: false, kind: 'primary' },
        { to: 'no_show', label: 'No-show', needsReason: false, kind: 'ghost' },
        { to: 'cancelled', label: 'Cancel', needsReason: true, kind: 'danger' },
      ];
    case 'checked_in':
      return [{ to: 'completed', label: 'Complete', needsReason: false, kind: 'primary' }];
    default:
      return [];
  }
}

/** Only upcoming bookings can be moved. */
export function canReschedule(status: AppointmentStatus): boolean {
  return status === 'requested' || status === 'confirmed';
}

const CHANGED_ELSEWHERE =
  'This appointment was changed by someone else in the meantime, or you do not have permission. Close it, reopen it and try again.';

async function updateWhere(id: string, fromStatuses: AppointmentStatus[], patch: Record<string, unknown>): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .in('status', fromStatuses)
    .select('*')
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error(CHANGED_ELSEWHERE);
  return normalize(data as Record<string, unknown>);
}

/**
 * Moves an appointment to a new status. Only the changes statusActions
 * offers are allowed, and only while the status is still the one shown.
 */
export async function updateAppointmentStatus(appt: Appointment, to: AppointmentStatus, reason?: string): Promise<Appointment> {
  const action = statusActions(appt.status).find((a) => a.to === to);
  if (!action) {
    throw new Error(
      `A booking that is ${APPOINTMENT_STATUS_LABEL[appt.status].toLowerCase()} cannot be changed to ${APPOINTMENT_STATUS_LABEL[to].toLowerCase()}.`,
    );
  }
  const patch: Record<string, unknown> = { status: to };
  if (action.needsReason) {
    const r = (reason ?? '').trim();
    if (r.length < 2) throw new Error('Give a short reason. The customer may see it.');
    if (r.length > 300) throw new Error(`The reason can be at most 300 characters (now ${r.length}).`);
    patch.cancel_reason = r;
  }
  return updateWhere(appt.id, [appt.status], patch);
}

export interface CheckInResult {
  appointment_id: string;
  repair_order_id: string;
  repair_order_number: string;
}

/**
 * Checks a confirmed booking in through the database (migration 012): the
 * appointment becomes checked in and a repair order is created from it, or
 * the existing one is returned when it was created already. The technician
 * is optional and can be set later. Returns the result and the fresh booking.
 */
export async function checkInAppointment(appt: Appointment, technicianId: string | null): Promise<{ result: CheckInResult; appt: Appointment }> {
  if (!statusActions(appt.status).some((a) => a.to === 'checked_in')) {
    throw new Error(`A booking that is ${APPOINTMENT_STATUS_LABEL[appt.status].toLowerCase()} cannot be checked in.`);
  }
  const { data, error } = await supabase.rpc('check_in_appointment', { p_id: appt.id, p_technician_id: technicianId || null });
  if (error) {
    const text = `${error.message} ${error.details ?? ''}`;
    if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|check_in_appointment.*does not exist/i.test(text)) {
      throw new Error(
        'Check-in could not run: the database does not have the check-in function yet (it comes with migration 012, repair orders). Apply it with npm run db:migrate and try again.',
      );
    }
    fail(error);
  }
  const row = (Array.isArray(data) ? data[0] : data) as CheckInResult | null | undefined;
  if (!row || !row.repair_order_id) throw new Error('Check-in did not return a repair order. Reload the page and look at the booking again.');
  const fresh = await getAppointment(appt.id);
  return {
    result: { appointment_id: String(row.appointment_id), repair_order_id: String(row.repair_order_id), repair_order_number: String(row.repair_order_number) },
    appt: fresh ?? { ...appt, status: 'checked_in' },
  };
}

export function validateDuration(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600) return 'Duration must be from 15 to 600 minutes.';
  return null;
}

export async function rescheduleAppointment(appt: Appointment, startsAt: Date, durationMinutes: number): Promise<Appointment> {
  if (!canReschedule(appt.status)) throw new Error('Only requested or confirmed bookings can be moved.');
  if (Number.isNaN(startsAt.getTime())) throw new Error('Choose a date and a time.');
  const bad = validateDuration(durationMinutes);
  if (bad) throw new Error(bad);
  return updateWhere(appt.id, ['requested', 'confirmed'], {
    starts_at: startsAt.toISOString(),
    duration_minutes: durationMinutes,
  });
}

export async function assignTechnician(appt: Appointment, technicianId: string | null): Promise<Appointment> {
  return updateWhere(appt.id, [...APPOINTMENT_STATUSES], { technician_id: technicianId || null });
}

export async function saveStaffNotes(appt: Appointment, notes: string): Promise<Appointment> {
  const t = notes.trim();
  if (t.length > 2000) throw new Error(`Staff notes can be at most 2000 characters (now ${t.length}).`);
  return updateWhere(appt.id, [...APPOINTMENT_STATUSES], { staff_notes: t || null });
}

/** Why a start time cannot be booked (closed, or not one of the valid start times), or null when it can. */
export function startTimeProblem(
  dayKey: string,
  time: string,
  durationMinutes: number,
  ctx: Pick<BookingContext, 'hours' | 'closures' | 'settings'>,
): string | null {
  const r = validStartTimes(dayKey, ctx, durationMinutes);
  if (r.closed) return `The workshop is closed that day (${r.reason}). Choose another date.`;
  if (r.times.length === 0) return `No start time that day leaves room for ${formatDuration(durationMinutes)} before closing. Choose another date or a shorter duration.`;
  if (!r.times.includes(time)) return 'Choose one of the start times offered for that day.';
  return null;
}

// Checking a time ---------------------------------------------------------------------------------

/**
 * Warnings for booking a valid start time: in the past, or more overlapping
 * bookings than the workshop has bays. Staff may still go ahead; the
 * warnings only inform. Times outside opening hours are not offered at all
 * (validStartTimes), and the database refuses them.
 */
export async function checkTime(args: {
  workshopId: string;
  startsAt: Date;
  durationMinutes: number;
  excludeId: string | null;
  ctx: BookingContext;
}): Promise<string[]> {
  const { workshopId, startsAt, durationMinutes, excludeId, ctx } = args;
  const warnings: string[] = [];
  if (Number.isNaN(startsAt.getTime())) return warnings;
  const start = startsAt.getTime();
  const end = start + durationMinutes * 60_000;

  if (start < Date.now()) warnings.push('This time is in the past.');

  // Others that overlap: anything starting before the end and up to 10 hours (the longest booking) before the start.
  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, duration_minutes')
    .eq('workshop_id', workshopId)
    .in('status', ACTIVE_STATUSES)
    .lt('starts_at', new Date(end).toISOString())
    .gt('starts_at', new Date(start - 600 * 60_000).toISOString());
  if (error) fail(error);
  const others = ((data ?? []) as { id: string; starts_at: string; duration_minutes: number }[])
    .filter((o) => o.id !== excludeId)
    .map((o) => {
      const s = new Date(o.starts_at).getTime();
      return { s: Math.max(s, start), e: Math.min(s + num(o.duration_minutes) * 60_000, end) };
    })
    .filter((o) => o.e > o.s);

  // The most bookings that run at the same moment within the new time.
  const edges = others.flatMap((o) => [
    { t: o.s, d: 1 },
    { t: o.e, d: -1 },
  ]);
  edges.sort((a, b) => a.t - b.t || a.d - b.d);
  let current = 0;
  let peak = 0;
  for (const e of edges) {
    current += e.d;
    peak = Math.max(peak, current);
  }
  const bays = ctx.settings.bays;
  if (peak >= bays) {
    warnings.push(
      `${peak} other ${peak === 1 ? 'booking runs' : 'bookings run'} at the same time and the workshop has ${bays} ${
        bays === 1 ? 'bay' : 'bays'
      }. This would overbook.`,
    );
  }
  return warnings;
}

// Suggestions --------------------------------------------------------------------------------------

export interface SiteSlug {
  slug: string;
  published: boolean;
}

export async function getSiteSlug(workshopId: string): Promise<SiteSlug | null> {
  const { data, error } = await supabase.from('workshop_sites').select('slug, published').eq('workshop_id', workshopId).maybeSingle();
  if (error) return null;
  return (data as SiteSlug | null) ?? null;
}

/**
 * Free start times on one day, from the public availability function. It
 * works only for a published site, applies the minimum notice and counts the
 * booking being moved as taken.
 */
export async function suggestFreeTimes(slug: string, day: string): Promise<FreeTime[]> {
  const { data, error } = await supabase.rpc('available_slots', { p_slug: slug, p_from: day, p_to: day });
  if (error) fail(error);
  return ((data ?? []) as FreeTime[]).map((r) => ({ starts_at: r.starts_at, remaining: num(r.remaining) }));
}

// Technicians ---------------------------------------------------------------------------------------

export async function listTechnicians(workshopId: string): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role_title')
    .eq('workshop_id', workshopId)
    .order('sort_order')
    .order('name');
  if (error) fail(error);
  return (data ?? []) as Technician[];
}

// Staff bookings -------------------------------------------------------------------------------------

export interface StaffBookingDraft {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  make: string;
  model: string;
  year: string;
  plate: string;
  service_ids: string[];
  day: string;
  time: string;
  duration: string;
  /** True once staff picked a duration, so choosing services stops changing it. */
  durationEdited: boolean;
  technician_id: string;
  notes: string;
  status: 'confirmed' | 'requested';
  /** The customer's account, when the booking was matched to one by email or phone. */
  customer_id: string | null;
  /** The car from their garage, while its details are used unchanged. */
  vehicle_id: string | null;
  /** The VIN of a car picked from the customer's cars (not typed in this form). */
  vin: string;
}

export interface StaffBookingInput {
  starts_at: string;
  duration_minutes: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  vehicle: AppointmentVehicle;
  services: AppointmentService[];
  estimate_low: number | null;
  estimate_high: number | null;
  technician_id: string | null;
  notes: string | null;
  status: 'confirmed' | 'requested';
  customer_id: string | null;
  vehicle_id: string | null;
}

/** The length a booking gets from its services, as online bookings do. */
export function suggestedDuration(serviceCount: number, slotMinutes: number): number {
  return slotMinutes * Math.max(1, Math.min(8, serviceCount));
}

export function newBookingDraft(day: string, slotMinutes: number, time = '09:00'): StaffBookingDraft {
  return {
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    make: '',
    model: '',
    year: '',
    plate: '',
    service_ids: [],
    day,
    time,
    duration: String(Math.max(60, slotMinutes)),
    durationEdited: false,
    technician_id: '',
    notes: '',
    status: 'confirmed',
    customer_id: null,
    vehicle_id: null,
    vin: '',
  };
}

function text(label: string, value: string, max: number, errors: string[], min = 0): string {
  const t = value.trim();
  if (min > 0 && t.length < min) errors.push(min === 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`);
  if (t.length > max) errors.push(`${label} can be at most ${max} characters (now ${t.length}).`);
  return t;
}

export function validateStaffBooking(
  d: StaffBookingDraft,
  services: ServiceRow[],
  tz: string,
  ctx?: Pick<BookingContext, 'hours' | 'closures' | 'settings'>,
): Validated<StaffBookingInput> {
  const errors: string[] = [];
  const contact_name = text('Name', d.contact_name, 120, errors, 1);
  const contact_email = d.contact_email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(contact_email)) errors.push('Enter a valid email address (the booking confirmation goes there).');
  const contact_phone = text('Phone', d.contact_phone, 40, errors);
  const make = text('Make', d.make, 40, errors);
  const model = text('Model', d.model, 60, errors);
  const plate = text('Plate', d.plate, 20, errors);
  const yearText = d.year.trim();
  const maxYear = new Date().getFullYear() + 1;
  if (yearText && !(/^\d{4}$/.test(yearText) && Number(yearText) >= 1950 && Number(yearText) <= maxYear)) {
    errors.push(`Year must be from 1950 to ${maxYear}.`);
  }
  const chosen = services
    .filter((s) => d.service_ids.includes(s.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({ id: s.id, name: s.name, price_from: s.price_from }));
  const notes = text('Notes', d.notes, 2000, errors);
  if (chosen.length === 0 && notes.length < 3) errors.push('Choose a service or describe the work in the notes.');
  let starts: Date | null = null;
  if (!isDayKey(d.day) || !isTimeText(d.time)) errors.push('Choose a date and a start time.');
  else starts = zonedToUtc(d.day, d.time, tz);
  const duration = Number(d.duration);
  const badDuration = validateDuration(duration);
  if (badDuration) errors.push(badDuration);
  if (ctx && starts && !badDuration) {
    const bad = startTimeProblem(d.day, d.time, duration, ctx);
    if (bad) errors.push(bad);
  }
  if (errors.length > 0 || !starts) return { ok: false, errors };
  const low = chosen.reduce((sum, s) => sum + s.price_from, 0);
  return {
    ok: true,
    value: {
      starts_at: starts.toISOString(),
      duration_minutes: duration,
      contact_name,
      contact_email,
      contact_phone: contact_phone || null,
      vehicle: { make, model, year: yearText || null, vin: d.vin.trim() || null, plate: plate || null },
      services: chosen,
      estimate_low: low > 0 ? Math.round(low * 100) / 100 : null,
      estimate_high: low > 0 ? Math.round(low * 150) / 100 : null,
      technician_id: d.technician_id || null,
      notes: notes || null,
      status: d.status,
      customer_id: d.customer_id,
      vehicle_id: d.customer_id ? d.vehicle_id : null,
    },
  };
}

const REFERENCE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** EW-BK- and six random uppercase letters and digits (no 0, O, 1 or I, which are easy to misread). */
export function newReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `EW-BK-${Array.from(bytes, (b) => REFERENCE_CHARS[b % REFERENCE_CHARS.length]).join('')}`;
}

/** Creates a booking entered by staff. A clash on the reference is retried once with a new one. */
export async function createStaffBooking(workshopId: string, userId: string, input: StaffBookingInput): Promise<Appointment> {
  const row = {
    workshop_id: workshopId,
    status: input.status,
    starts_at: input.starts_at,
    duration_minutes: input.duration_minutes,
    vehicle: input.vehicle,
    services: input.services,
    urgency: 'routine',
    notes: input.notes,
    technician_id: input.technician_id,
    contact_name: input.contact_name,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    remind_email: true,
    remind_sms: false,
    estimate_low: input.estimate_low,
    estimate_high: input.estimate_high,
    deposit_requested: false,
    source: 'staff',
    created_by: userId,
    customer_id: input.customer_id,
    vehicle_id: input.vehicle_id,
    // The trigger sets confirmed_at only on an update, so a booking created as confirmed sets it here.
    confirmed_at: input.status === 'confirmed' ? new Date().toISOString() : null,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase
      .from('appointments')
      .insert({ ...row, reference: newReference() })
      .select('*')
      .single();
    if (!error) return normalize(data as Record<string, unknown>);
    const clash = (error.code === '23505' || /duplicate key/i.test(error.message)) && /reference/i.test(`${error.message} ${error.details ?? ''}`);
    if (!clash || attempt === 1) fail(error);
  }
  throw new Error('The booking could not be saved. Try again.');
}

export { message as errorMessage };

// Customer lookup (migration 027) -----------------------------------------------------------------------

export interface KnownCar {
  vehicle_id: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  plate: string | null;
  vin: string | null;
  nickname: string | null;
  /** In the customer's garage on the website (else seen on a past booking or repair here). */
  from_garage: boolean;
  last_seen: string | null;
}

export interface KnownCustomer {
  customer_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  has_account: boolean;
  vehicles: KnownCar[];
}

/** "2011 BMW 550i" (or the nickname first when there is one). */
export function knownCarLabel(c: Pick<KnownCar, 'year' | 'make' | 'model' | 'nickname'>): string {
  const base = [c.year, c.make, c.model].filter(Boolean).join(' ') || 'Car';
  return c.nickname ? `${c.nickname} (${base})` : base;
}

/** The workshop's customer with this email or phone, and every car known for them; null when nobody matches. */
export async function findCustomer(email: string, phone: string): Promise<KnownCustomer | null> {
  const { data, error } = await supabase.rpc('staff_find_customer', { p_email: email || null, p_phone: phone || null });
  if (error) {
    if (/staff_find_customer/i.test(error.message)) throw new Error('Customer lookup needs migration 027 (npm run db:migrate).');
    fail(error);
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const cars = Array.isArray(d.vehicles) ? (d.vehicles as Record<string, unknown>[]) : [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    customer_id: str(d.customer_id),
    name: str(d.name),
    email: str(d.email),
    phone: str(d.phone),
    has_account: d.has_account === true,
    vehicles: cars.map((c) => ({
      vehicle_id: str(c.vehicle_id),
      make: str(c.make),
      model: str(c.model),
      year: c.year === null || c.year === undefined ? null : String(c.year),
      plate: str(c.plate),
      vin: str(c.vin),
      nickname: str(c.nickname),
      from_garage: c.from_garage === true,
      last_seen: str(c.last_seen),
    })),
  };
}
