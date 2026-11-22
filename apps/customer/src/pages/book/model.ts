/**
 * Booking flow data: the form, the steps, validation, slot grouping and the
 * estimate. Free times come from the server (api/booking.ts).
 */
import { SERVICE_CATEGORY_IDS } from '@eurowerken/shared';
import { formatZonedDateTime, zonedHour } from '@/api/booking';
import type { Slot } from '@/api/booking';
import type { Service, Technician } from '@/api/catalogue';
import { fromIsoDate } from './Calendar';

export type Urgency = 'routine' | 'soon' | 'urgent';
export const URGENCY: { id: Urgency; label: string; hint: string }[] = [
  { id: 'routine', label: 'Routine', hint: 'Regular service or a check. No rush.' },
  { id: 'soon', label: 'Needs attention soon', hint: 'Something feels off, but the car drives fine.' },
  { id: 'urgent', label: 'Urgent', hint: 'Warning light, brakes or unsafe to drive.' },
];

/** Team members who take bookings (service advisors do not). */
export function bookableExperts(team: Technician[]): Technician[] {
  return team.filter((t) => !/advisor/i.test(t.role));
}

export interface FormState {
  /** customer_vehicles id when the visitor picked one of their saved cars. */
  savedVehicleId: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  services: string[];
  notes: string;
  urgency: Urgency;
  /** Workshop-local date, YYYY-MM-DD. */
  date: string;
  /** The chosen slot: the exact starts_at (ISO timestamptz) the server sent. */
  time: string;
  expert: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  remindEmail: boolean;
  remindSms: boolean;
  deposit: boolean;
}

export const EMPTY_FORM: FormState = {
  savedVehicleId: '',
  make: '',
  model: '',
  year: '',
  vin: '',
  services: [],
  notes: '',
  urgency: 'routine',
  date: '',
  time: '',
  expert: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  remindEmail: true,
  remindSms: true,
  deposit: false,
};

export type Field = 'make' | 'model' | 'year' | 'vin' | 'services' | 'date' | 'time' | 'firstName' | 'lastName' | 'email' | 'phone';
export type Errors = Partial<Record<Field, string>>;

export type StepId = 'vehicle' | 'services' | 'when' | 'details';

export interface StepInfo {
  id: StepId;
  /** The step's name on the stepper and its card heading (focus moves here on each change). */
  label: string;
  blurb: string;
  /** Label of the primary button that leaves this step. */
  next: string;
  /** Fields checked before leaving the step, in focus order. */
  fields: Field[];
}

export const STEPS: StepInfo[] = [
  {
    id: 'vehicle',
    label: 'Your car',
    blurb: 'So the right parts and the right technician are ready.',
    next: 'Next: what it needs',
    fields: ['make', 'model', 'year', 'vin'],
  },
  {
    id: 'services',
    label: 'What does it need?',
    blurb: 'Pick one or more services, or describe the problem in your own words.',
    next: 'Next: choose a time',
    fields: ['services'],
  },
  {
    id: 'when',
    label: 'When suits you?',
    blurb: 'Pick a day, then one of the open times.',
    next: 'Next: your details',
    fields: ['date', 'time'],
  },
  {
    id: 'details',
    label: 'Your details',
    blurb: 'The workshop uses these to confirm your appointment.',
    next: 'Confirm booking',
    fields: ['firstName', 'lastName', 'email', 'phone'],
  },
];

/** Step ids from the earlier six-step flow, so old links and drafts still land somewhere sensible. */
const OLD_STEP_IDS: Record<string, StepId> = { expert: 'when', contact: 'details', review: 'details' };

export function stepIndex(id: string | null): number {
  const resolved = id ? (OLD_STEP_IDS[id] ?? id) : null;
  const i = STEPS.findIndex((s) => s.id === resolved);
  return i < 0 ? 0 : i;
}

/** hasServices: the workshop lists services to pick from; otherwise the notes must say what is needed. */
export function validate(f: FormState, hasServices: boolean): Errors {
  const e: Errors = {};
  if (!f.make) e.make = 'Select the make of your vehicle.';
  if (!f.model) e.model = f.make ? 'Select the model.' : 'Select a make first, then the model.';
  if (!f.year) e.year = 'Select the model year.';
  if (f.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(f.vin)) e.vin = 'A VIN is 17 letters and numbers (no I, O or Q). Leave it empty if unsure.';
  // Describing the problem alone is enough: the workshop quotes after inspection.
  if (hasServices && f.services.length === 0 && !f.notes.trim()) e.services = 'Select at least one service, or describe the problem below.';
  if (!hasServices && !f.notes.trim()) e.services = 'Describe the work your car needs in the notes.';
  if (!f.date) e.date = 'Choose a date for your appointment.';
  if (!f.time) e.time = f.date ? 'Choose a time.' : 'Choose a date first, then a time.';
  if (!f.firstName.trim()) e.firstName = 'Enter your first name.';
  if (!f.lastName.trim()) e.lastName = 'Enter your last name.';
  if (!f.email.trim()) e.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address, like name@example.com.';
  const digits = f.phone.replace(/\D/g, '');
  if (!digits) e.phone = 'Enter a phone number so the workshop can confirm.';
  else if (digits.length < 10) e.phone = 'Enter a 10-digit phone number, including the area code.';
  return e;
}

/** The errors that belong to one step, in focus order. */
export function errorsForStep(all: Errors, step: StepInfo): Errors {
  const e: Errors = {};
  for (const f of step.fields) if (all[f]) e[f] = all[f];
  return e;
}

/** Index of the first step with something missing; the last step when everything is filled in. */
export function firstIncompleteStep(all: Errors): number {
  const i = STEPS.findIndex((s) => s.fields.some((f) => all[f]));
  return i < 0 ? STEPS.length - 1 : i;
}

/** One short line for the action bar saying what is still needed on a step; null when the step is complete. */
export function remainingHint(step: StepId, e: Errors): string | null {
  switch (step) {
    case 'vehicle': {
      if (e.make) return 'Choose your car to continue';
      if (e.model && e.year) return 'Pick the model and year to continue';
      if (e.model) return 'Pick the model to continue';
      if (e.year) return 'Pick the year to continue';
      if (e.vin) return 'Check the VIN, or leave it empty, to continue';
      return null;
    }
    case 'services':
      return e.services ? 'Pick a service or describe the problem to continue' : null;
    case 'when':
      if (e.date) return 'Pick a date and time to continue';
      if (e.time) return 'Pick a time to continue';
      return null;
    case 'details': {
      const missing: string[] = [];
      if (e.firstName || e.lastName) missing.push('your name');
      if (e.email) missing.push(e.email.startsWith('Enter a valid') ? 'a valid email' : 'your email');
      if (e.phone) missing.push(e.phone.startsWith('Enter a 10') ? 'a full phone number' : 'your phone number');
      if (missing.length === 0) return null;
      const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
      return `Add ${list} to confirm`;
    }
  }
}

/** Estimate range for one service: from price up to about one and a half times (final price after inspection). */
export function priceRange(s: Service): [number, number] {
  return [s.priceFrom, Math.ceil((s.priceFrom * 1.5) / 10) * 10];
}

/** Services grouped by category, in the site's category order (the workshop's order inside each group). */
export function groupServices(services: Service[]): { id: string; label: string; services: Service[] }[] {
  const order = (id: string) => {
    const i = (SERVICE_CATEGORY_IDS as readonly string[]).indexOf(id);
    return i < 0 ? SERVICE_CATEGORY_IDS.length : i;
  };
  const groups = new Map<string, { id: string; label: string; services: Service[] }>();
  for (const s of services) {
    const g = groups.get(s.category) ?? { id: s.category, label: s.categoryLabel, services: [] };
    g.services.push(s);
    groups.set(s.category, g);
  }
  return [...groups.values()].sort((a, b) => order(a.id) - order(b.id));
}

export function estimate(services: Service[]): [number, number] {
  return services.reduce<[number, number]>(
    ([l, h], s) => {
      const [sl, sh] = priceRange(s);
      return [l + sl, h + sh];
    },
    [0, 0],
  );
}

/** Morning (before noon) and afternoon groups of a day's slots, by the hour in the workshop's time zone. */
export function groupSlots(slots: Slot[], timeZone: string): { label: string; slots: Slot[] }[] {
  const morning = slots.filter((s) => zonedHour(s.starts_at, timeZone) < 12);
  const afternoon = slots.filter((s) => zonedHour(s.starts_at, timeZone) >= 12);
  return [
    { label: 'Morning', slots: morning },
    { label: 'Afternoon', slots: afternoon },
  ].filter((g) => g.slots.length > 0);
}

/** "Saturday, 12 December at 10:30 a.m." in the workshop's time zone (the date alone when no time is picked yet). */
export function formatWhen(date: string, startsAt: string, timeZone: string): string {
  if (startsAt) return formatZonedDateTime(startsAt, timeZone);
  if (!date) return '';
  const d = fromIsoDate(date);
  return `${d.toLocaleDateString('en-CA', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-CA', { month: 'long' })}`;
}

/** A slot value from a saved draft: an ISO timestamp (older drafts kept "09:00"). */
export function isSlotValue(time: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time) && !Number.isNaN(Date.parse(time));
}

export function vehicleLabel(f: Pick<FormState, 'year' | 'make' | 'model'>): string {
  return [f.year, f.make, f.model].filter(Boolean).join(' ');
}

/** The DOM id to focus for a field with an error. The date is handled by the calendar. */
export function fieldElementId(field: Field, firstServiceId: string | undefined): string {
  switch (field) {
    case 'services':
      return firstServiceId ? `service-${firstServiceId}` : 'book-notes';
    case 'time':
      return 'time-slot-0';
    default:
      return `book-${field}`;
  }
}
