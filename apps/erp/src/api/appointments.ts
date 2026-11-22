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
}

/** One weekday's opening hours. weekday 0 = Sunday. Times are 'HH:MM'. */
export interface WorkshopHours {
  weekday: number;
  closed: boolean;
  opens: string | null;
  closes: string | null;
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

function fillHours(rows: { weekday: number; closed: boolean; opens: string | null; closes: string | null }[]): WorkshopHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const r = rows.find((x) => x.weekday === wd);
    // A weekday with no row is not bookable (available_slots skips it), so it shows as closed.
    if (!r) return { weekday: wd, closed: true, opens: null, closes: null };
    return { weekday: wd, closed: r.closed, opens: shortTime(r.opens), closes: shortTime(r.closes) };
  });
}

export async function getBookingContext(workshopId: string): Promise<BookingContext> {
  const [s, h, c] = await Promise.all([
    supabase
      .from('booking_settings')
      .select('time_zone, slot_minutes, bays, min_notice_hours, max_days_ahead, auto_confirm')
      .eq('workshop_id', workshopId)
      .maybeSingle(),
    supabase.from('workshop_hours').select('weekday, closed, opens, closes').eq('workshop_id', workshopId),
    supabase.from('workshop_closures').select('id, day, reason').eq('workshop_id', workshopId).order('day'),
  ]);
  if (s.error) fail(s.error);
  if (h.error) fail(h.error);
  if (c.error) fail(c.error);
  const row = s.data as BookingSettings | null;
  return {
    settings: row ? { ...row, time_zone: safeTimeZone(row.time_zone) } : DEFAULT_SETTINGS,
    settingsSaved: Boolean(row),
    hours: fillHours((h.data ?? []) as WorkshopHours[]),
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
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

export async function saveBookingSettings(workshopId: string, s: BookingSettings): Promise<BookingSettings> {
  const { data, error } = await supabase
    .from('booking_settings')
    .upsert({ workshop_id: workshopId, ...s }, { onConflict: 'workshop_id' })
    .select('time_zone, slot_minutes, bays, min_notice_hours, max_days_ahead, auto_confirm')
    .single();
  if (error) fail(error);
  return data as BookingSettings;
}

export function validateHours(rows: WorkshopHours[]): Validated<WorkshopHours[]> {
  const errors: string[] = [];
  const value = rows.map((r) => {
    const name = WEEKDAY_NAMES[r.weekday];
    const opens = r.opens && isTimeText(r.opens) ? r.opens : null;
    const closes = r.closes && isTimeText(r.closes) ? r.closes : null;
    if (!r.closed) {
      if (!opens || !closes) errors.push(`${name}: enter an opening and a closing time, or mark the day closed.`);
      else if (timeToMinutes(opens) >= timeToMinutes(closes)) errors.push(`${name}: the opening time must be before the closing time.`);
    }
    return { weekday: r.weekday, closed: r.closed, opens, closes };
  });
  if (value.every((r) => r.closed)) errors.push('Every day is closed, so nobody can book. Open at least one day.');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

export async function saveHours(workshopId: string, rows: WorkshopHours[]): Promise<WorkshopHours[]> {
  const { data, error } = await supabase
    .from('workshop_hours')
    .upsert(
      rows.map((r) => ({ workshop_id: workshopId, weekday: r.weekday, closed: r.closed, opens: r.opens, closes: r.closes })),
      { onConflict: 'workshop_id,weekday' },
    )
    .select('weekday, closed, opens, closes');
  if (error) fail(error);
  return fillHours((data ?? []) as WorkshopHours[]);
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

export function visibleDays(view: CalendarView, anchor: string): string[] {
  if (view === 'day') return [anchor];
  const start = weekStart(anchor);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
}

export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  return addDays(anchor, direction * (view === 'day' ? 1 : 7));
}

export interface DayInfo {
  key: string;
  hours: WorkshopHours;
  closure: Closure | null;
  /** Closed by the weekly hours or by a closure. */
  closed: boolean;
}

export function dayInfo(key: string, ctx: Pick<BookingContext, 'hours' | 'closures'>): DayInfo {
  const hours = ctx.hours[weekdayOf(key)] ?? { weekday: weekdayOf(key), closed: true, opens: null, closes: null };
  const closure = ctx.closures.find((c) => c.day === key) ?? null;
  return { key, hours, closure, closed: hours.closed || closure !== null };
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
  const open = hours.filter((h) => !h.closed && h.opens && h.closes);
  let start = open.length ? Math.min(...open.map((h) => timeToMinutes(h.opens!))) : 8 * 60;
  let end = open.length ? Math.max(...open.map((h) => timeToMinutes(h.closes!))) : 18 * 60;
  for (const a of appts) {
    const s = minutesOfDay(a.starts_at, tz);
    start = Math.min(start, s);
    end = Math.max(end, Math.min(24 * 60, s + a.duration_minutes));
  }
  start = Math.floor(start / 60) * 60;
  end = Math.max(start + 60, Math.ceil(end / 60) * 60);
  return { start, end };
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

// Checking a time ---------------------------------------------------------------------------------

/**
 * Warnings for booking a time: outside opening hours, a closed day, in the
 * past, or more overlapping bookings than the workshop has bays. Staff may
 * still go ahead; the warnings only inform.
 */
export async function checkTime(args: {
  workshopId: string;
  startsAt: Date;
  durationMinutes: number;
  excludeId: string | null;
  ctx: BookingContext;
}): Promise<string[]> {
  const { workshopId, startsAt, durationMinutes, excludeId, ctx } = args;
  const tz = ctx.settings.time_zone;
  const warnings: string[] = [];
  if (Number.isNaN(startsAt.getTime())) return warnings;
  const start = startsAt.getTime();
  const end = start + durationMinutes * 60_000;

  if (start < Date.now()) warnings.push('This time is in the past.');
  const key = dayKeyOf(startsAt, tz);
  const info = dayInfo(key, ctx);
  if (info.closure) warnings.push(`The workshop is closed that day${info.closure.reason ? ` (${info.closure.reason})` : ''}.`);
  else if (info.hours.closed) warnings.push(`The workshop is closed on ${WEEKDAY_NAMES[info.hours.weekday]}s.`);
  else if (info.hours.opens && info.hours.closes) {
    const s = minutesOfDay(startsAt, tz);
    if (s < timeToMinutes(info.hours.opens) || s + durationMinutes > timeToMinutes(info.hours.closes)) {
      warnings.push(`This is outside opening hours (${info.hours.opens} to ${info.hours.closes}).`);
    }
  }

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
}

/** The length a booking gets from its services, as online bookings do. */
export function suggestedDuration(serviceCount: number, slotMinutes: number): number {
  return slotMinutes * Math.max(1, Math.min(8, serviceCount));
}

export function newBookingDraft(day: string, slotMinutes: number): StaffBookingDraft {
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
    time: '09:00',
    duration: String(Math.max(60, slotMinutes)),
    durationEdited: false,
    technician_id: '',
    notes: '',
    status: 'confirmed',
  };
}

function text(label: string, value: string, max: number, errors: string[], min = 0): string {
  const t = value.trim();
  if (min > 0 && t.length < min) errors.push(min === 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`);
  if (t.length > max) errors.push(`${label} can be at most ${max} characters (now ${t.length}).`);
  return t;
}

export function validateStaffBooking(d: StaffBookingDraft, services: ServiceRow[], tz: string): Validated<StaffBookingInput> {
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
      vehicle: { make, model, year: yearText || null, vin: null, plate: plate || null },
      services: chosen,
      estimate_low: low > 0 ? Math.round(low * 100) / 100 : null,
      estimate_high: low > 0 ? Math.round(low * 150) / 100 : null,
      technician_id: d.technician_id || null,
      notes: notes || null,
      status: d.status,
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
