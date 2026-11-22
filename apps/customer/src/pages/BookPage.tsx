import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Car, CheckCircle2, Clock, Info, User, Wrench } from 'lucide-react';
import { useServices, useTeam } from '@/api/catalogue';
import type { Service, Technician } from '@/api/catalogue';
import { Breadcrumbs, DemoNotice, EmptyCatalogue, LoadError, PageHero, StepCard } from '@/components/ui';
import { VEHICLE_MAKES, VEHICLE_YEARS } from '@/data/catalog';
import { formatMoneyWhole } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { Calendar, formatLongDate, fromIsoDate, toIsoDate } from './book/Calendar';

type Urgency = 'routine' | 'soon' | 'urgent';
const URGENCY: { id: Urgency; label: string }[] = [
  { id: 'routine', label: 'Routine' },
  { id: 'soon', label: 'Needs attention soon' },
  { id: 'urgent', label: 'Urgent' },
];

/** Start times (24 h). Saturdays are mornings only. */
const WEEKDAY_SLOTS = ['08:00', '09:00', '10:30', '13:00', '14:30', '16:00'];
const SATURDAY_SLOTS = ['09:00', '10:30'];

/** Team members who take bookings (service advisors do not). */
function bookableExperts(team: Technician[]): Technician[] {
  return team.filter((t) => !/advisor/i.test(t.role));
}

const NO_SERVICES: Service[] = [];
const NO_TEAM: Technician[] = [];

interface FormState {
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

type Field = 'make' | 'model' | 'year' | 'vin' | 'services' | 'date' | 'time' | 'firstName' | 'lastName' | 'email' | 'phone';
type Errors = Partial<Record<Field, string>>;

/** Order matters: the first field with an error gets focus. */
const FIELD_ORDER: Field[] = ['make', 'model', 'year', 'vin', 'services', 'date', 'time', 'firstName', 'lastName', 'email', 'phone'];

/** hasServices: the workshop lists services to pick from; otherwise the notes must say what is needed. */
function validate(f: FormState, hasServices: boolean): Errors {
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

/** Estimate range for one service: from price up to about one and a half times (final price after inspection). */
function priceRange(s: Service): [number, number] {
  return [s.priceFrom, Math.ceil((s.priceFrom * 1.5) / 10) * 10];
}

function slotsFor(iso: string): string[] {
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

function formatSlot(t: string): string {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

function makeReference(): string {
  return `EW-BK-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function BookPage() {
  const site = useSite();
  const [params] = useSearchParams();
  const servicesLoad = useServices();
  const teamLoad = useTeam();
  const offered = servicesLoad.data ?? NO_SERVICES;
  const experts = useMemo(() => bookableExperts(teamLoad.data ?? NO_TEAM), [teamLoad.data]);
  const hasServices = servicesLoad.loading || offered.length > 0;

  // ?service=<id> and ?tech=<id> are kept until the lists load, then checked against them.
  const [form, setForm] = useState<FormState>(() => {
    const service = params.get('service');
    const expert = params.get('tech');
    return {
      make: '',
      model: '',
      year: '',
      vin: '',
      services: service ? [service] : [],
      notes: '',
      urgency: 'routine',
      date: '',
      time: '',
      expert: expert ?? '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      remindEmail: true,
      remindSms: true,
      deposit: false,
    };
  });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [reference, setReference] = useState<string | null>(null);
  const dayRef = useRef<HTMLButtonElement | null>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'make') next.model = '';
      if (key === 'date' && !slotsFor(value as string).includes(next.time)) next.time = '';
      return next;
    });
  }

  // Drop preselected ids the workshop does not offer (any more).
  useEffect(() => {
    if (!servicesLoad.data) return;
    const known = new Set(servicesLoad.data.map((s) => s.id));
    setForm((f) => (f.services.every((id) => known.has(id)) ? f : { ...f, services: f.services.filter((id) => known.has(id)) }));
  }, [servicesLoad.data]);
  useEffect(() => {
    if (!teamLoad.data) return;
    setForm((f) => (!f.expert || experts.some((t) => t.id === f.expert) ? f : { ...f, expert: '' }));
  }, [teamLoad.data, experts]);

  // After the first attempt, keep the messages in step with what the visitor fixes.
  useEffect(() => {
    if (submitted) setErrors(validate(form, hasServices));
  }, [form, submitted, hasServices]);

  useEffect(() => {
    if (reference) {
      window.scrollTo({ top: 0 });
      doneHeadingRef.current?.focus();
    }
  }, [reference]);

  const selectedServices = useMemo(() => offered.filter((s) => form.services.includes(s.id)), [offered, form.services]);
  const [low, high] = selectedServices.reduce<[number, number]>(
    ([l, h], s) => {
      const [sl, sh] = priceRange(s);
      return [l + sl, h + sh];
    },
    [0, 0],
  );
  const expert = experts.find((t) => t.id === form.expert);
  const vehicle = [form.year, form.make, form.model].filter(Boolean).join(' ');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validate(form, hasServices);
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }
    setReference(makeReference());
  }

  function focusField(field: Field) {
    if (field === 'date') {
      dayRef.current?.focus();
      dayRef.current?.scrollIntoView({ block: 'center' });
      return;
    }
    const id = field === 'services' ? (offered[0] ? `service-${offered[0].id}` : 'book-notes') : field === 'time' ? 'time-slot-0' : `book-${field}`;
    document.getElementById(id)?.focus();
  }

  if (reference) {
    return (
      <Confirmation
        reference={reference}
        form={form}
        vehicle={vehicle}
        services={selectedServices}
        low={low}
        high={high}
        expertName={expert?.name}
        headingRef={doneHeadingRef}
      />
    );
  }

  const err = (f: Field) => (errors[f] ? { 'aria-invalid': true as const, 'aria-describedby': `${f}-error` } : {});
  const slots = slotsFor(form.date);

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Book Appointment' }]} />
      <div className="container-site pt-4">
        <div className="overflow-hidden rounded-3xl">
          <PageHero
            title="Book Your Service"
            subtitle="Schedule your European vehicle service in minutes. Select your services, pick a time, and let our experts handle the rest."
          />
        </div>
      </div>

      <div className="container-site grid gap-6 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
        <form id="book-form" onSubmit={onSubmit} noValidate className="min-w-0 space-y-6">
          {submitted && Object.keys(errors).length > 0 && (
            <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
              Please fix the {Object.keys(errors).length === 1 ? 'highlighted field' : `${Object.keys(errors).length} highlighted fields`} below.
            </p>
          )}

          <StepCard step={1} title="Vehicle Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBox id="book-make" label="Make" required error={errors.make} field="make">
                <select id="book-make" className="input" value={form.make} onChange={(e) => set('make', e.target.value)} {...err('make')}>
                  <option value="">Select make</option>
                  {Object.keys(VEHICLE_MAKES).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </FieldBox>
              <FieldBox id="book-model" label="Model" required error={errors.model} field="model">
                <select id="book-model" className="input" value={form.model} onChange={(e) => set('model', e.target.value)} disabled={!form.make} {...err('model')}>
                  <option value="">{form.make ? 'Select model' : 'Select a make first'}</option>
                  {(VEHICLE_MAKES[form.make] ?? []).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </FieldBox>
              <FieldBox id="book-year" label="Year" required error={errors.year} field="year">
                <select id="book-year" className="input" value={form.year} onChange={(e) => set('year', e.target.value)} {...err('year')}>
                  <option value="">Select year</option>
                  {VEHICLE_YEARS.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </FieldBox>
              <FieldBox id="book-vin" label="VIN (optional)" error={errors.vin} field="vin">
                <input
                  id="book-vin"
                  className="input font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                  value={form.vin}
                  onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={17}
                  placeholder="17-character VIN"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  {...(errors.vin ? err('vin') : { 'aria-describedby': 'vin-hint' })}
                />
              </FieldBox>
            </div>
            <p id="vin-hint" className="mt-4 flex items-start gap-2 rounded-xl border border-accent/15 bg-accent/5 px-3.5 py-3 text-xs leading-relaxed text-fg2">
              <Info className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
              Providing your VIN helps us make sure we have the exact right parts ready for your vehicle's configuration. It is on your
              registration and at the base of the windscreen.
            </p>
          </StepCard>

          <StepCard step={2} title="Select Services">
            {servicesLoad.loading ? (
              <div aria-busy="true">
                <p className="sr-only" aria-live="polite">
                  Loading services
                </p>
                <ul aria-hidden className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <li key={i} className="glass flex h-24 animate-pulse flex-col gap-2 rounded-xl p-3.5 motion-reduce:animate-none">
                      <span className="h-4 w-2/3 rounded bg-surface2" />
                      <span className="h-3 w-full rounded bg-surface2" />
                      <span className="h-3 w-1/2 rounded bg-surface2" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : servicesLoad.error ? (
              <LoadError what="services" onRetry={servicesLoad.retry} />
            ) : offered.length === 0 ? (
              <EmptyCatalogue
                Icon={Wrench}
                title="Tell us what your car needs"
                text="This workshop has not listed its services online yet. Describe the work in the notes below, or call us."
              />
            ) : null}
            <fieldset aria-describedby={errors.services ? 'services-error' : undefined} hidden={offered.length === 0}>
              <legend className="sr-only">Services</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {offered.map((s) => {
                  const checked = form.services.includes(s.id);
                  const [sl, sh] = priceRange(s);
                  return (
                    <label
                      key={s.id}
                      htmlFor={`service-${s.id}`}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition focus-within:ring-2 focus-within:ring-accent/30 ${
                        checked ? 'border-accent bg-accent/5' : errors.services ? 'border-bad/40 bg-surface/60' : 'border-line bg-surface/60 hover:border-accent/40'
                      }`}
                    >
                      <input
                        id={`service-${s.id}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => set('services', checked ? form.services.filter((x) => x !== s.id) : [...form.services, s.id])}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent coarse:h-5 coarse:w-5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">{s.name}</span>
                        {s.text && <span className="mt-0.5 block text-xs leading-relaxed text-fg3">{s.text}</span>}
                        <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
                          <span className="font-semibold text-fg">
                            Est. {formatMoneyWhole(sl)} to {formatMoneyWhole(sh)}
                          </span>
                          {s.duration && (
                            <span className="inline-flex items-center gap-1 text-fg3">
                              <Clock className="h-3 w-3" aria-hidden />
                              {s.duration}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <ErrorText field="services" error={errors.services} />
            <div className="mt-5">
              <label htmlFor="book-notes" className="label">
                Describe the issue or add notes
              </label>
              <textarea
                id="book-notes"
                className="input min-h-28 resize-y"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                {...(!hasServices && errors.services ? err('services') : {})}
                maxLength={1000}
                placeholder="Please describe any strange noises, vibrations or specific requests..."
              />
            </div>
          </StepCard>

          <StepCard step={3} title="Date, Time & Expert">
            <div role="group" aria-labelledby="urgency-label">
              <p id="urgency-label" className="label">
                How urgent is this?
              </p>
              <div className="flex flex-wrap gap-2">
                {URGENCY.map((u) => {
                  const on = form.urgency === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('urgency', u.id)}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition coarse:min-h-11 ${
                        on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-fg2 hover:border-accent/40 hover:text-fg'
                      }`}
                    >
                      {u.label}
                    </button>
                  );
                })}
              </div>
              {form.urgency === 'urgent' && (
                <p className="mt-2 text-xs text-warn">
                  For warning lights, brake problems or anything unsafe to drive, please also call us{site.phone ? ` at ${site.phone}` : ''}.
                </p>
              )}
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p id="date-label" className="label">
                  Select date <span aria-hidden>*</span>
                </p>
                <Calendar
                  value={form.date}
                  onChange={(iso) => set('date', iso)}
                  labelledBy="date-label"
                  describedBy={errors.date ? 'date-error' : 'date-hint'}
                  invalid={!!errors.date}
                  dayRef={(el) => {
                    dayRef.current = el;
                  }}
                />
                {errors.date ? (
                  <ErrorText field="date" error={errors.date} />
                ) : (
                  <p id="date-hint" className="mt-1.5 text-[11px] text-fg3">
                    Closed Sundays. Use the arrow keys to move between days.
                  </p>
                )}
              </div>

              <div className="space-y-6">
                <div role="group" aria-labelledby="time-label" aria-describedby={errors.time ? 'time-error' : undefined}>
                  <p id="time-label" className="label">
                    Available times{form.date ? ` (${fromIsoDate(form.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})` : ''}{' '}
                    <span aria-hidden>*</span>
                  </p>
                  {slots.length === 0 ? (
                    <p className="rounded-xl border border-line bg-surface2/60 px-3 py-3 text-xs text-fg2">No times left on this day. Please pick another date.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {slots.map((t, i) => {
                        const on = form.time === t;
                        return (
                          <button
                            key={t}
                            id={`time-slot-${i}`}
                            type="button"
                            aria-pressed={on}
                            onClick={() => set('time', t)}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-medium tabular-nums transition coarse:min-h-11 ${
                              on
                                ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20'
                                : errors.time
                                  ? 'border-bad/40 bg-surface text-fg'
                                  : 'border-line bg-surface text-fg hover:border-accent/40'
                            }`}
                          >
                            {formatSlot(t)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <ErrorText field="time" error={errors.time} />
                </div>

                {/* Optional: hidden when the workshop lists nobody (or the team could not be loaded). */}
                {(teamLoad.loading || experts.length > 0) && (
                  <div aria-busy={teamLoad.loading || undefined}>
                    <label htmlFor="book-expert" className="label">
                      Preferred expert (optional)
                    </label>
                    <select
                      id="book-expert"
                      className="input"
                      value={teamLoad.loading ? '' : form.expert}
                      onChange={(e) => set('expert', e.target.value)}
                      disabled={teamLoad.loading}
                    >
                      <option value="">{teamLoad.loading ? 'Loading experts...' : 'Any available expert'}</option>
                      {experts.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}, {t.role}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </StepCard>

          <StepCard step={4} title="Contact Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBox id="book-firstName" label="First name" required error={errors.firstName} field="firstName">
                <input id="book-firstName" className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" placeholder="John" {...err('firstName')} />
              </FieldBox>
              <FieldBox id="book-lastName" label="Last name" required error={errors.lastName} field="lastName">
                <input id="book-lastName" className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" placeholder="Doe" {...err('lastName')} />
              </FieldBox>
              <FieldBox id="book-email" label="Email address" required error={errors.email} field="email">
                <input
                  id="book-email"
                  type="email"
                  inputMode="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="john.doe@example.com"
                  {...err('email')}
                />
              </FieldBox>
              <FieldBox id="book-phone" label="Phone number" required error={errors.phone} field="phone">
                <input
                  id="book-phone"
                  type="tel"
                  inputMode="tel"
                  className="input"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                  {...err('phone')}
                />
              </FieldBox>
            </div>
            <fieldset className="mt-6">
              <legend className="label">Reminder preferences</legend>
              <div className="space-y-2">
                <CheckRow id="remind-email" checked={form.remindEmail} onChange={(v) => set('remindEmail', v)}>
                  Send me an email confirmation and calendar invite
                </CheckRow>
                <CheckRow id="remind-sms" checked={form.remindSms} onChange={(v) => set('remindSms', v)}>
                  Send me text message reminders 24 hours before my appointment
                </CheckRow>
              </div>
            </fieldset>
          </StepCard>
        </form>

        <aside aria-label="Appointment summary" className="glass-strong rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-semibold text-fg">Appointment Summary</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <SummaryRow label="Vehicle">{vehicle || <Empty>Not selected yet</Empty>}</SummaryRow>
            <SummaryRow label="Schedule">
              {form.date ? (
                <>
                  {formatLongDate(form.date)}
                  <span className="block font-normal text-fg2">{form.time ? formatSlot(form.time) : 'Choose a time'}</span>
                </>
              ) : (
                <Empty>Choose a date and time</Empty>
              )}
              <span className="mt-0.5 block text-xs font-normal text-fg3">Expert: {expert?.name ?? 'Any available'}</span>
            </SummaryRow>
            <SummaryRow label="Selected services">
              {selectedServices.length === 0 ? (
                <Empty>No services selected</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {selectedServices.map((s) => {
                    const [sl, sh] = priceRange(s);
                    return (
                      <li key={s.id} className="flex justify-between gap-3 font-normal">
                        <span className="min-w-0 text-fg">{s.name}</span>
                        <span className="shrink-0 tabular-nums text-fg3">
                          {formatMoneyWhole(sl)} to {formatMoneyWhole(sh)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SummaryRow>
          </dl>

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-fg">Estimated total</p>
              <p className="font-display text-xl font-bold tabular-nums text-fg" aria-live="polite">
                {selectedServices.length ? `${formatMoneyWhole(low)} to ${formatMoneyWhole(high)}` : formatMoneyWhole(0)}
              </p>
            </div>
            <p className="mt-1 text-right text-[11px] text-fg3">Final price determined after inspection. Taxes extra.</p>
          </div>

          <label htmlFor="book-deposit" className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-line bg-surface/60 p-3.5">
            <input
              id="book-deposit"
              type="checkbox"
              checked={form.deposit}
              onChange={(e) => set('deposit', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent coarse:h-5 coarse:w-5"
              aria-describedby="deposit-note"
            />
            <span>
              <span className="block text-sm font-semibold text-fg">Pay $50 deposit now</span>
              <span id="deposit-note" className="mt-0.5 block text-xs leading-relaxed text-fg3">
                {form.deposit
                  ? 'Noted. The workshop will arrange the deposit with you when they confirm. Nothing is charged online.'
                  : 'Secures your spot; applied to your final bill.'}
              </span>
            </span>
          </label>

          <button type="submit" form="book-form" className="btn-ink mt-5 w-full py-3.5">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Confirm Appointment
          </button>
          <p className="mt-3 text-center text-[11px] text-fg3">
            By booking, you agree to our{' '}
            <Link to={sitePath(site, 'terms')} className="font-medium text-accent underline-offset-2 hover:underline">
              Terms and Conditions
            </Link>
            .
          </p>
        </aside>
      </div>
    </>
  );
}

function FieldBox({ id, label, required, error, field, children }: { id: string; label: string; required?: boolean; error?: string; field: Field; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      {children}
      <ErrorText field={field} error={error} />
    </div>
  );
}

function ErrorText({ field, error }: { field: Field; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${field}-error`} className="mt-1.5 text-xs font-medium text-bad">
      {error}
    </p>
  );
}

function CheckRow({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-fg2 coarse:min-h-11 coarse:items-center">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent coarse:mt-0 coarse:h-5 coarse:w-5" />
      {children}
    </label>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg3">{label}</dt>
      <dd className="mt-1 font-semibold text-fg">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="font-normal text-fg3">{children}</span>;
}

function Confirmation({
  reference,
  form,
  vehicle,
  services,
  low,
  high,
  expertName,
  headingRef,
}: {
  reference: string;
  form: FormState;
  vehicle: string;
  services: Service[];
  low: number;
  high: number;
  expertName?: string;
  headingRef: RefObject<HTMLHeadingElement>;
}) {
  const site = useSite();
  const rows: { Icon: typeof Car; label: string; value: ReactNode }[] = [
    { Icon: Car, label: 'Vehicle', value: `${vehicle}${form.vin ? ` (VIN ${form.vin})` : ''}` },
    { Icon: CalendarCheck, label: 'Requested time', value: `${formatLongDate(form.date)}, ${formatSlot(form.time)}` },
    { Icon: User, label: 'Expert', value: expertName ?? 'Any available expert' },
    { Icon: Wrench, label: 'Services', value: services.length ? services.map((s) => s.name).join(', ') : 'As described in your notes' },
  ];
  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Book Appointment' }]} />
      <section className="container-site py-10 sm:py-16">
        <div className="glass-strong mx-auto max-w-2xl rounded-3xl p-6 sm:p-10">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-ok">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </span>
            <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-2xl font-bold text-fg outline-none sm:text-3xl">
              Request received
            </h1>
            <p className="mt-2 text-sm text-fg2">
              Thanks, {form.firstName.trim()}. Your reference number is{' '}
              <span className="font-mono font-semibold text-fg">{reference}</span>.
            </p>
          </div>

          <div className="mt-6">
            <DemoNotice>
              Online booking is not connected to the workshop yet, so this time is not reserved. {site.display_name} will call you on{' '}
              {form.phone.trim()} to confirm your appointment.
              {form.deposit ? ' You asked to pay the $50 deposit; they will arrange it on that call.' : ''}
            </DemoNotice>
          </div>

          <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface/60">
            {rows.map(({ Icon, label, value }) => (
              <div key={label} className="flex gap-3 p-4">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg3">{label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-fg">{value}</dd>
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 p-4">
              <dt className="text-sm font-semibold text-fg">Estimated total</dt>
              <dd className="font-display text-lg font-bold tabular-nums text-fg">
                {services.length ? `${formatMoneyWhole(low)} to ${formatMoneyWhole(high)}` : 'Quoted after inspection'}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-fg3">Final price determined after inspection. Taxes extra.</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link to={sitePath(site)} className="btn-ink">
              Back to home
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to={sitePath(site, 'services')} className="btn-outline">
              Browse services
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
