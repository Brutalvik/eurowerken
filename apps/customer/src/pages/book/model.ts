/**
 * Booking flow data: the form, the steps, validation, time slots and the
 * estimate. No React here, so the rules can move to a shared package later.
 */
import type { Service, Technician } from '@/api/catalogue';
import { fromIsoDate, toIsoDate } from './Calendar';

export type Urgency = 'routine' | 'soon' | 'urgent';
export const URGENCY: { id: Urgency; label: string }[] = [
  { id: 'routine', label: 'Routine' },
  { id: 'soon', label: 'Needs attention soon' },
  { id: 'urgent', label: 'Urgent' },
];

/** Start times (24 h). Saturdays are mornings only. */
const WEEKDAY_SLOTS = ['08:00', '09:00', '10:30', '13:00', '14:30', '16:00'];
const SATURDAY_SLOTS = ['09:00', '10:30'];

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
  date: string;
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

export type StepId = 'vehicle' | 'services' | 'when' | 'expert' | 'contact' | 'review';

export interface StepInfo {
  id: StepId;
  /** Short name on the progress rail. */
  label: string;
  /** Shown in the page header. */
  title: string;
  /** The step card's heading (focus moves here on each change). */
  question: string;
  blurb: string;
  /** Fields checked before leaving the step, in focus order. */
  fields: Field[];
}

export const STEPS: StepInfo[] = [
  {
    id: 'vehicle',
    label: 'Vehicle',
    title: 'Your vehicle',
    question: 'Which car are we looking after?',
    blurb: 'Pick the make, model and year so the right parts are ready.',
    fields: ['make', 'model', 'year', 'vin'],
  },
  {
    id: 'services',
    label: 'Services',
    title: 'Choose services',
    question: 'What does it need?',
    blurb: 'Select one or more services, or describe the problem in your own words.',
    fields: ['services'],
  },
  {
    id: 'when',
    label: 'Date and time',
    title: 'Pick a time',
    question: 'When suits you?',
    blurb: 'Choose a day, then one of the open times.',
    fields: ['date', 'time'],
  },
  {
    id: 'expert',
    label: 'Expert',
    title: 'Choose an expert',
    question: 'Anyone you would like to work with?',
    blurb: 'Optional. Leave it on any available expert for the earliest time.',
    fields: [],
  },
  {
    id: 'contact',
    label: 'Contact',
    title: 'Your details',
    question: 'How can we reach you?',
    blurb: 'The workshop uses these to confirm the appointment.',
    fields: ['firstName', 'lastName', 'email', 'phone'],
  },
  {
    id: 'review',
    label: 'Review',
    title: 'Review and confirm',
    question: 'Does everything look right?',
    blurb: 'Check the details, then confirm your request.',
    fields: [],
  },
];

export function stepIndex(id: string | null): number {
  const i = STEPS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

/** hasServices: the workshop lists services to pick from; otherwise the notes must say what is needed. */
export function validate(f: FormState, hasServices: boolean): Errors {
  const e: Errors = {};
  if (!f.make) e.make = 'Select the make of your vehicle.';
  if (!f.model) e.model = f.make ? 'Select the model.' : 'Select a make first, then the model.';
  if (!f.year) e.year = 'Select the model year.';
  if (f.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(f.vin)) e.vin = 'A VIN is 17 letters and numbers (no I, O or Q). Leave it empty if unsure.';
  if (hasServices && f.services.length === 0) e.services = 'Select at least one service.';
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

/** Index of the first step with something missing; the review step when everything is filled in. */
export function firstIncompleteStep(all: Errors): number {
  const i = STEPS.findIndex((s) => s.fields.some((f) => all[f]));
  return i < 0 ? STEPS.length - 1 : i;
}

/** Estimate range for one service: from price up to about one and a half times (final price after inspection). */
export function priceRange(s: Service): [number, number] {
  return [s.priceFrom, Math.ceil((s.priceFrom * 1.5) / 10) * 10];
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

export function slotsFor(iso: string): string[] {
  if (!iso) return WEEKDAY_SLOTS;
  const d = fromIsoDate(iso);
  const slots = d.getDay() === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS;
  if (iso !== toIsoDate(new Date())) return slots;
  // Today: only slots at least two hours from now.
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return slots.filter((t) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0) > soon.getHours() * 60 + soon.getMinutes() && soon.getDate() === d.getDate();
  });
}

export function formatSlot(t: string): string {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

export function makeReference(): string {
  return `EW-BK-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function vehicleLabel(f: Pick<FormState, 'year' | 'make' | 'model'>): string {
  return [f.year, f.make, f.model].filter(Boolean).join(' ');
}

/** The DOM id to focus for a field with an error. The date is handled by the calendar. */
export function fieldElementId(field: Field, firstServiceId: string | undefined): string {
  switch (field) {
    case 'make':
      return 'book-make-0';
    case 'model':
      return 'book-model-0';
    case 'year':
      return 'book-year-0';
    case 'services':
      return firstServiceId ? `service-${firstServiceId}` : 'book-notes';
    case 'time':
      return 'time-slot-0';
    default:
      return `book-${field}`;
  }
}
