/**
 * Real bookings (supabase/migrations/008): the workshop's booking settings and
 * opening hours, free start times, booking, and a customer's own appointments.
 *
 * Every time is a timestamptz from the server. It is shown in the workshop's
 * time zone (booking_settings.time_zone), never the visitor's, and a chosen
 * slot is kept as the exact starts_at string the server sent.
 */
import { useMemo } from 'react';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useSite } from '@/site/SiteContext';
import { forgetCached, useLoadable } from './catalogue';
import type { Loadable } from './catalogue';

// Types ---------------------------------------------------------------------------------

export const DEFAULT_TIME_ZONE = 'America/Edmonton';

export interface BookingSettings {
  time_zone: string;
  slot_minutes: number;
  bays: number;
  min_notice_hours: number;
  max_days_ahead: number;
  auto_confirm: boolean;
}

export interface WorkshopHours {
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  closed: boolean;
  /** "08:00:00" (Postgres time), null when closed. */
  opens: string | null;
  closes: string | null;
  /** Optional second period the same day ("Add hours", migration 014), for example after a lunch break. */
  opens2?: string | null;
  closes2?: string | null;
}

export interface WorkshopClosure {
  /** YYYY-MM-DD, workshop-local. */
  day: string;
  reason: string | null;
}

export interface BookingSetup {
  settings: BookingSettings;
  /** Seven rows, Sunday first; a weekday the workshop never set up counts as closed. */
  hours: WorkshopHours[];
  /** Upcoming closed dates. */
  closures: WorkshopClosure[];
}

export interface Slot {
  /** timestamptz as the server sent it: store and send back exactly this. */
  starts_at: string;
  remaining: number;
}

export type AppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
export type BookingUrgency = 'routine' | 'soon' | 'urgent';

export interface BookingPayload {
  starts_at: string;
  vehicle: { make: string; model: string; year: string; vin: string | null; plate: string | null };
  vehicle_id: string | null;
  service_ids: string[];
  urgency: BookingUrgency;
  notes: string;
  technician_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  remind_email: boolean;
  remind_sms: boolean;
  deposit_requested: boolean;
}

export interface BookedAppointment {
  id: string;
  reference: string;
  status: AppointmentStatus;
  starts_at: string;
}

export interface Appointment {
  id: string;
  reference: string;
  status: AppointmentStatus;
  starts_at: string;
  duration_minutes: number;
  vehicle: { make?: string; model?: string; year?: string | number | null; vin?: string | null; plate?: string | null };
  services: { id: string; name: string; price_from: number | null }[];
  urgency: BookingUrgency;
  notes: string | null;
  technician_id: string | null;
  /** From the public team list; null when none was chosen or the member is not public. */
  technician_name: string | null;
  cancel_reason: string | null;
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

/** The server's message when someone else took the slot first. */
export const SLOT_TAKEN = 'That time is no longer available. Please choose another.';

export function isSlotTaken(message: string): boolean {
  return /no longer available/i.test(message);
}

// Fetching ----------------------------------------------------------------------------------

const DEFAULT_SETTINGS: BookingSettings = {
  time_zone: DEFAULT_TIME_ZONE,
  slot_minutes: 30,
  bays: 2,
  min_notice_hours: 2,
  max_days_ahead: 90,
  auto_confirm: false,
};

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function fetchBookingSetup(workshopId: string): Promise<BookingSetup> {
  const [s, h, c] = await Promise.all([
    supabase
      .from('booking_settings')
      .select('time_zone, slot_minutes, bays, min_notice_hours, max_days_ahead, auto_confirm')
      .eq('workshop_id', workshopId)
      .maybeSingle(),
    supabase.from('workshop_hours').select('*').eq('workshop_id', workshopId),
    supabase
      .from('workshop_closures')
      .select('day, reason')
      .eq('workshop_id', workshopId)
      .gte('day', todayIn(DEFAULT_TIME_ZONE, -1))
      .order('day', { ascending: true }),
  ]);
  const error = s.error ?? h.error ?? c.error;
  if (error) throw new Error(error.message);
  const row = (s.data ?? null) as BookingSettings | null;
  const settings: BookingSettings = row ? { ...DEFAULT_SETTINGS, ...row } : DEFAULT_SETTINGS;
  if (!isTimeZone(settings.time_zone)) settings.time_zone = DEFAULT_TIME_ZONE;
  const rows = (h.data ?? []) as WorkshopHours[];
  const hours = Array.from({ length: 7 }, (_, weekday) => {
    const r = rows.find((x) => x.weekday === weekday);
    return r && !r.closed && r.opens && r.closes ? r : { weekday, closed: true, opens: null, closes: null };
  });
  return { settings, hours, closures: (c.data ?? []) as WorkshopClosure[] };
}

export async function fetchAvailability(slug: string, from: string, to: string): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('available_slots', { p_slug: slug, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Slot[]).filter((x) => typeof x.starts_at === 'string');
}

export async function bookAppointment(slug: string, payload: BookingPayload): Promise<Result<BookedAppointment>> {
  const { data, error } = await supabase.rpc('book_appointment', { p_slug: slug, p: payload });
  if (error) return { data: null, error: isSlotTaken(error.message) ? SLOT_TAKEN : friendlyError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as BookedAppointment | undefined;
  if (!row?.reference) return { data: null, error: 'The booking could not be completed. Please try again or call the workshop.' };
  // Other people's free times changed too: load availability again next time.
  forgetCached('availability:');
  return { data: row, error: null };
}

const APPOINTMENT_COLUMNS =
  'id, reference, status, starts_at, duration_minutes, vehicle, services, urgency, notes, technician_id, cancel_reason, technician:team_members(name)';

/** The signed-in customer's appointments at this workshop, oldest first (RLS returns only their own). */
export async function listMyAppointments(customerId: string, workshopId: string): Promise<Result<Appointment[]>> {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('customer_id', customerId)
    .eq('workshop_id', workshopId)
    .order('starts_at', { ascending: true });
  if (error) return { data: null, error: friendlyError(error.message) };
  const rows = (data ?? []) as unknown as (Omit<Appointment, 'technician_name'> & { technician: { name: string } | { name: string }[] | null })[];
  return {
    data: rows.map(({ technician, ...a }) => ({
      ...a,
      vehicle: a.vehicle && typeof a.vehicle === 'object' ? a.vehicle : {},
      services: Array.isArray(a.services) ? a.services : [],
      technician_name: (Array.isArray(technician) ? technician[0]?.name : technician?.name) ?? null,
    })),
    error: null,
  };
}

/** Cancels the customer's own upcoming booking. The server refuses within 2 hours of the start; its message is returned as is. */
export async function cancelMyAppointment(id: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_my_appointment', { p_id: id, p_reason: reason.trim() || null });
  if (error) return friendlyError(error.message);
  forgetCached('availability:');
  return null;
}

// Hooks ------------------------------------------------------------------------------------

/** Settings, weekly hours and closures of the current site's workshop, cached per workshop. */
export function useBookingSettings(): Loadable<BookingSetup> {
  const { workshop_id: w } = useSite();
  return useLoadable(`booking-setup:${w}`, () => fetchBookingSetup(w));
}

export interface Availability extends Loadable<Slot[]> {
  /** Slots grouped by workshop-local date (YYYY-MM-DD), each day in time order. */
  byDay: Map<string, Slot[]>;
  /** Loads this range again (after a conflict, for example). */
  refresh: () => void;
}

/**
 * Free start times between two workshop-local dates (inclusive, YYYY-MM-DD),
 * cached per range. Pass null while the range or time zone is not known yet.
 */
export function useAvailability(fromDate: string | null, toDate: string | null, timeZone: string | null): Availability {
  const { slug, workshop_id: w } = useSite();
  const key = fromDate && toDate && timeZone ? `availability:${w}:${fromDate}:${toDate}` : null;
  const load = useLoadable(key, () => fetchAvailability(slug, fromDate ?? '', toDate ?? ''));
  const byDay = useMemo(() => groupByDay(load.data ?? [], timeZone ?? DEFAULT_TIME_ZONE), [load.data, timeZone]);
  return { ...load, byDay, refresh: load.retry };
}

/** Forgets every loaded availability range, so the When step asks the server again. */
export function forgetAvailability(): void {
  forgetCached('availability:');
}

// Time zone helpers ----------------------------------------------------------------------------

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar parts of an instant in a time zone. */
export function zonedParts(iso: string | Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(typeof iso === 'string' ? new Date(iso) : iso)) p[part.type] = part.value;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: Math.max(0, weekdays.indexOf(p.weekday ?? 'Sun')),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The workshop-local date of an instant, as YYYY-MM-DD. */
export function zonedDate(iso: string | Date, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today in the time zone (plus offsetDays), as YYYY-MM-DD. */
export function todayIn(timeZone: string, offsetDays = 0): string {
  return zonedDate(new Date(Date.now() + offsetDays * 86_400_000), timeZone);
}

/** The workshop-local hour (0 to 23) of an instant. */
export function zonedHour(iso: string, timeZone: string): number {
  return zonedParts(iso, timeZone).hour;
}

/** "9:00 a.m." in the time zone. */
export function formatZonedTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', { timeZone, hour: 'numeric', minute: '2-digit' });
}

/** "Saturday, 12 December" in the time zone. */
export function formatZonedDay(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-CA', { timeZone, weekday: 'long' });
  const month = d.toLocaleDateString('en-CA', { timeZone, month: 'long' });
  return `${weekday}, ${zonedParts(d, timeZone).day} ${month}`;
}

/** "Saturday, 12 December at 10:30 a.m." in the time zone. */
export function formatZonedDateTime(iso: string, timeZone: string): string {
  return `${formatZonedDay(iso, timeZone)} at ${formatZonedTime(iso, timeZone)}`;
}

/** Slots grouped by workshop-local date, each day in time order. */
export function groupByDay(slots: Slot[], timeZone: string): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  for (const s of [...slots].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
    const day = zonedDate(s.starts_at, timeZone);
    const list = out.get(day);
    if (list) list.push(s);
    else out.set(day, [s]);
  }
  return out;
}

/** "Mountain Time" for America/Edmonton; the zone id when the browser has no name for it. */
export function timeZoneName(timeZone: string): string {
  for (const style of ['longGeneric', 'long'] as const) {
    try {
      const part = new Intl.DateTimeFormat('en-CA', { timeZone, timeZoneName: style }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
      if (part?.value) return part.value;
    } catch {
      // Older browsers without longGeneric: try the next style.
    }
  }
  return timeZone.replace(/_/g, ' ');
}

/** True when the visitor's clock shows a different local time from the workshop's (now). */
export function browserZoneDiffers(timeZone: string): boolean {
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!mine || mine === timeZone) return false;
  const now = new Date();
  const a = zonedParts(now, timeZone);
  const b = zonedParts(now, mine);
  return a.day !== b.day || a.hour !== b.hour || a.minute !== b.minute;
}

/** "08:00:00" as "8:00 a.m.". */
export function formatClock(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

const PLURAL_DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The week as short lines for a footer, Monday first, joining consecutive days with the same hours:
 * ["Mon to Fri: 8:00 a.m. to 6:00 p.m.", "Sat: 9:00 a.m. to 2:00 p.m.", "Sun: Closed"].
 */
export function weeklyHoursLines(hours: WorkshopHours[]): string[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const label = (h: WorkshopHours | undefined) =>
    !h || h.closed || !h.opens || !h.closes
      ? 'Closed'
      : `${formatClock(h.opens)} to ${formatClock(h.closes)}` +
        (h.opens2 && h.closes2 ? `, ${formatClock(h.opens2)} to ${formatClock(h.closes2)}` : '');
  const runs: { from: number; to: number; text: string }[] = [];
  for (const wd of order) {
    const text = label(hours.find((h) => h.weekday === wd));
    const last = runs[runs.length - 1];
    if (last && last.text === text) last.to = wd;
    else runs.push({ from: wd, to: wd, text });
  }
  return runs.map((r) => `${SHORT_DAYS[r.from]}${r.from === r.to ? '' : ` to ${SHORT_DAYS[r.to]}`}: ${r.text}`);
}

function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The opening hours in a sentence or three, for example
 * "Closed Sundays. Saturdays 9:00 a.m. to 2:00 p.m. Other days 8:00 a.m. to 6:00 p.m."
 */
export function hoursSummary(hours: WorkshopHours[]): string {
  // Monday first, as people read a week.
  const week = [1, 2, 3, 4, 5, 6, 0].map((wd) => hours.find((h) => h.weekday === wd) ?? { weekday: wd, closed: true, opens: null, closes: null });
  const closed = week.filter((h) => h.closed || !h.opens || !h.closes);
  const open = week.filter((h) => !closed.includes(h));
  if (open.length === 0) return 'Online booking is not open at the moment.';
  const groups = new Map<string, number[]>();
  for (const h of open) {
    const range =
      `${formatClock(h.opens ?? '')} to ${formatClock(h.closes ?? '')}` +
      (h.opens2 && h.closes2 ? ` and ${formatClock(h.opens2)} to ${formatClock(h.closes2)}` : '');
    groups.set(range, [...(groups.get(range) ?? []), h.weekday]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const sentences: string[] = [];
  if (closed.length > 0) sentences.push(`Closed ${joinList(closed.map((h) => PLURAL_DAYS[h.weekday]!))}.`);
  const [main, ...others] = sorted;
  for (const [range, days] of others) sentences.push(`${joinList(days.map((d) => PLURAL_DAYS[d]!))} ${range}`);
  if (main) sentences.push(others.length > 0 ? `Other days ${main[0]}` : `Open ${main[0]}`);
  // "6:00 p.m." already ends a sentence.
  return sentences.map((x) => (x.endsWith('.') ? x : `${x}.`)).join(' ');
}
