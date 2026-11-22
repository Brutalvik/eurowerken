/**
 * Book Appointment: four plain steps (your car, what it needs, when, your
 * details) on frosted glass. Nothing moves on its own: every step ends with
 * one action bar (Back, what is left, and a button that says where it goes).
 * The current step is in the URL (?step=), the draft is kept in
 * sessionStorage per site, and the pieces live in pages/book/.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { DEFAULT_TIME_ZONE, bookAppointment, forgetAvailability, isSlotTaken, useBookingSettings, zonedDate } from '@/api/booking';
import type { AppointmentStatus, BookingPayload } from '@/api/booking';
import { useServices, useTeam } from '@/api/catalogue';
import type { Service, Technician } from '@/api/catalogue';
import { listVehicles } from '@/api/vehicles';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { Breadcrumbs } from '@/components/ui';
import { sitePath, useSite } from '@/site/SiteContext';
import { SummaryCard, estimateText, totalText } from './book/BookingSummary';
import type { SummaryData } from './book/BookingSummary';
import { Confirmation } from './book/Confirmation';
import { LiquidBackdrop } from './book/LiquidBackdrop';
import {
  STEPS,
  bookableExperts,
  errorsForStep,
  estimate,
  fieldElementId,
  firstIncompleteStep,
  formatWhen,
  groupServices,
  remainingHint,
  stepIndex,
  validate,
  vehicleLabel,
} from './book/model';
import type { Errors, FormState, StepId } from './book/model';
import { Stepper } from './book/ProgressRail';
import { ActionBar } from './book/ui';
import { useBookingDraft } from './book/useBookingDraft';
import { ContactStep } from './book/steps/ContactStep';
import { TechnicianSection } from './book/steps/ExpertStep';
import { CheckBooking, ReviewFooter } from './book/steps/ReviewStep';
import type { EditTarget } from './book/steps/ReviewStep';
import { ServicesStep } from './book/steps/ServicesStep';
import { VehicleStep } from './book/steps/VehicleStep';
import { WhenStep } from './book/steps/WhenStep';
import './book/book.css';

const NO_SERVICES: Service[] = [];
const NO_TEAM: Technician[] = [];
const NO_ERRORS: Errors = {};
const LAST = STEPS.length - 1;

interface Done {
  reference: string;
  status: AppointmentStatus;
  startsAt: string;
  form: FormState;
  d: SummaryData;
}

export function BookPage() {
  const site = useSite();
  const auth = useCustomerAuth();
  const [params, setParams] = useSearchParams();
  const servicesLoad = useServices();
  const teamLoad = useTeam();
  const bookingSetup = useBookingSettings();
  const tz = bookingSetup.data?.settings.time_zone ?? DEFAULT_TIME_ZONE;
  const offered = servicesLoad.data ?? NO_SERVICES;
  const experts = useMemo(() => bookableExperts(teamLoad.data ?? NO_TEAM), [teamLoad.data]);
  const hasServices = servicesLoad.loading || offered.length > 0;

  // ?service=<id> and ?tech=<id> are kept until the lists load, then checked against them.
  const [preselect] = useState(() => ({ service: params.get('service'), expert: params.get('tech') }));
  const { form, setForm, furthest, setFurthest, clearDraft } = useBookingDraft(site.slug, preselect);
  const [tried, setTried] = useState<ReadonlySet<StepId>>(() => new Set());
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<Done | null>(null);
  /** The last change, shown in the action bar and announced (the bar's status line is the live region). */
  const [feedback, setFeedback] = useState('');
  /** The confirm request is on its way (also guards against a double submit). */
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  /** A server problem with the booking, shown on the action bar. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Shown on the When step after the chosen time was taken by someone else. */
  const [whenNotice, setWhenNotice] = useState<string | null>(null);
  const [techOpen, setTechOpen] = useState(() => !!form.expert);
  /** Came from an Edit link on the last step: the primary button returns there. */
  const [returnToDetails, setReturnToDetails] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  /** The stepper: brought into view on each step change. */
  const stepTopRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLButtonElement | null>(null);

  // Step: from the URL, but never past the first step with something missing.
  const allErrors = validate(form, hasServices);
  const firstIncomplete = firstIncompleteStep(allErrors);
  const requested = stepIndex(params.get('step'));
  const current = Math.min(requested, firstIncomplete);
  const step = STEPS[current]!;
  const stepErrors = errorsForStep(allErrors, step);
  const shown = tried.has(step.id) ? stepErrors : NO_ERRORS;
  const complete = Object.keys(stepErrors).length === 0;

  // Direction of travel, worked out during render so the entering step slides the right way.
  const [lastStep, setLastStep] = useState(current);
  const [forward, setForward] = useState(true);
  if (current !== lastStep) {
    setForward(current > lastStep);
    setLastStep(current);
    setFeedback('');
  }

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((f) => {
        const next = { ...f, [key]: value };
        if (key === 'make' && value !== f.make) next.model = '';
        if (key === 'make' || key === 'model' || key === 'year' || key === 'vin') next.savedVehicleId = '';
        // A slot belongs to one day: picking another day clears the time.
        if (key === 'date' && next.time && zonedDate(next.time, tz) !== value) next.time = '';
        return next;
      });
      setSubmitError(null);
    },
    [setForm, tz],
  );

  // Drop preselected ids the workshop does not offer (any more).
  useEffect(() => {
    if (!servicesLoad.data) return;
    const known = new Set(servicesLoad.data.map((s) => s.id));
    setForm((f) => (f.services.every((id) => known.has(id)) ? f : { ...f, services: f.services.filter((id) => known.has(id)) }));
  }, [servicesLoad.data, setForm]);
  useEffect(() => {
    if (!teamLoad.data) return;
    setForm((f) => (!f.expert || experts.some((t) => t.id === f.expert) ? f : { ...f, expert: '' }));
  }, [teamLoad.data, experts, setForm]);

  // Signed in: fill empty contact fields from the account, once per account.
  const accountId = auth.status === 'signed-in' ? (auth.account?.id ?? null) : null;
  const prefilledFor = useRef<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    const a = auth.account;
    if (!accountId || !a || prefilledFor.current === accountId) return;
    prefilledFor.current = accountId;
    const [first = '', ...rest] = (a.full_name ?? '').trim().split(/\s+/).filter(Boolean);
    setForm((f) => ({
      ...f,
      firstName: f.firstName || first,
      lastName: f.lastName || rest.join(' '),
      email: f.email || a.email || '',
      phone: f.phone || a.phone || '',
    }));
    setPrefilled(true);
  }, [accountId, auth.account, setForm]);

  // Signed in: the customer's saved cars, offered as big tiles first.
  const [saved, setSaved] = useState<{ for: string | null; list: CustomerVehicleRow[] }>({ for: null, list: [] });
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void listVehicles(accountId).then((r) => {
      if (!cancelled) setSaved({ for: accountId, list: r.data ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  const savedVehicles = { loading: !!accountId && saved.for !== accountId, list: saved.for === accountId ? saved.list : [] };

  // Keep the URL on the step actually shown (after a reload, an old step id, or a link to a later step).
  const catalogueReady = !servicesLoad.loading;
  useEffect(() => {
    if (done || !catalogueReady) return;
    const inUrl = params.get('step');
    if (inUrl && inUrl !== step.id) setParams({ step: step.id }, { replace: true });
  }, [done, catalogueReady, params, step.id, setParams]);

  // A complete car (picked from the garage or with the three selects) is confirmed in the bar.
  const carDone = form.make && form.model && form.year ? vehicleLabel(form) : '';
  const prevCar = useRef(carDone);
  useEffect(() => {
    if (carDone && carDone !== prevCar.current) setFeedback(`${carDone} selected`);
    prevCar.current = carDone;
  }, [carDone]);

  const goTo = useCallback(
    (i: number) => {
      const target = STEPS[i];
      if (!target) return;
      if (i === LAST) setReturnToDetails(false);
      setFurthest((f) => Math.max(f, i));
      setParams({ step: target.id });
    },
    [setFurthest, setParams],
  );

  // Focus the step heading on each change (not on first load), and bring the stepper into view.
  const focusedStep = useRef(current);
  useEffect(() => {
    if (focusedStep.current === current) return;
    focusedStep.current = current;
    headingRef.current?.focus({ preventScroll: true });
    const top = stepTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && (top < 72 || top > window.innerHeight * 0.4)) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [current]);

  useEffect(() => {
    if (!done) return;
    window.scrollTo({ top: 0 });
    doneHeadingRef.current?.focus({ preventScroll: true });
  }, [done]);

  const selectedServices = useMemo(() => offered.filter((s) => form.services.includes(s.id)), [offered, form.services]);
  const [low, high] = estimate(selectedServices);
  const expert = experts.find((t) => t.id === form.expert);
  const d: SummaryData = {
    vehicle: vehicleLabel(form),
    services: selectedServices,
    notes: form.notes,
    date: form.date,
    time: form.time,
    timeZone: tz,
    expertName: expert?.name,
    low,
    high,
  };

  function focusFirstError(errs: Errors) {
    const firstServiceId = groupServices(offered)[0]?.services[0]?.id;
    for (const f of step.fields) {
      if (!errs[f]) continue;
      if (f === 'date') {
        dayRef.current?.focus();
        return;
      }
      const el = document.getElementById(fieldElementId(f, firstServiceId)) ?? (f === 'make' ? document.getElementById('book-car-0') : null);
      if (el) {
        el.focus();
        return;
      }
    }
    headingRef.current?.focus();
  }

  function toPayload(f: FormState): BookingPayload {
    const savedCar = f.savedVehicleId ? savedVehicles.list.find((v) => v.id === f.savedVehicleId) : undefined;
    return {
      starts_at: f.time,
      vehicle: { make: f.make, model: f.model, year: f.year, vin: f.vin || null, plate: savedCar?.plate ?? null },
      vehicle_id: f.savedVehicleId || null,
      service_ids: f.services,
      urgency: f.urgency,
      notes: f.notes.trim(),
      technician_id: f.expert || null,
      contact_name: `${f.firstName.trim()} ${f.lastName.trim()}`.trim(),
      contact_email: f.email.trim(),
      contact_phone: f.phone.trim(),
      remind_email: f.remindEmail,
      remind_sms: f.remindSms,
      deposit_requested: f.deposit,
    };
  }

  async function confirmBooking() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const snapshot = form;
    const summary = d;
    const result = await bookAppointment(site.slug, toPayload(snapshot));
    submittingRef.current = false;
    setSubmitting(false);
    if (result.error !== null) {
      if (isSlotTaken(result.error)) {
        // Someone took the time first: back to the When step, everything else kept.
        forgetAvailability();
        setForm((f) => ({ ...f, time: '' }));
        setWhenNotice(result.error);
        goTo(stepIndex('when'));
        return;
      }
      setSubmitError(result.error);
      return;
    }
    setDone({ reference: result.data.reference, status: result.data.status, startsAt: result.data.starts_at, form: snapshot, d: summary });
    clearDraft();
    setParams({}, { replace: true });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!complete) {
      setTried((t) => new Set(t).add(step.id));
      setAttempt((n) => n + 1);
      focusFirstError(stepErrors);
      return;
    }
    if (current < LAST) {
      goTo(returnToDetails ? LAST : current + 1);
      return;
    }
    // Confirm: everything is checked again before the request is made.
    if (Object.keys(allErrors).length > 0) {
      setTried((t) => new Set(t).add(STEPS[firstIncomplete]!.id));
      goTo(firstIncomplete);
      return;
    }
    void confirmBooking();
  }

  function pickSaved(v: CustomerVehicleRow) {
    setForm((f) => ({
      ...f,
      savedVehicleId: v.id,
      make: v.make,
      model: v.model,
      year: v.year ? String(v.year) : '',
      vin: (v.vin ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17),
    }));
  }

  function differentCar() {
    setForm((f) => (f.savedVehicleId ? { ...f, savedVehicleId: '', make: '', model: '', year: '', vin: '' } : f));
  }

  function toggleService(id: string) {
    const s = offered.find((x) => x.id === id);
    const wasOn = form.services.includes(id);
    setForm((f) => ({ ...f, services: f.services.includes(id) ? f.services.filter((x) => x !== id) : [...f.services, id] }));
    if (s) setFeedback(`${s.name} ${wasOn ? 'removed' : 'added'}`);
  }

  function onEdit(t: EditTarget) {
    setReturnToDetails(true);
    if (t === 'technician') {
      setTechOpen(true);
      goTo(stepIndex('when'));
      return;
    }
    goTo(stepIndex(t));
  }

  const crumbs = <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Book Appointment' }]} />;

  if (done) {
    return (
      <>
        {crumbs}
        <div className="relative isolate overflow-x-clip">
          <LiquidBackdrop />
          <section className="container-site py-10 sm:py-16">
            <Confirmation
              reference={done.reference}
              status={done.status}
              startsAt={done.startsAt}
              timeZone={tz}
              signedIn={auth.status === 'signed-in'}
              form={done.form}
              d={done.d}
              headingRef={doneHeadingRef}
            />
          </section>
        </div>
      </>
    );
  }

  const loginHref = `${sitePath(site, 'login')}?next=${encodeURIComponent(`${sitePath(site, 'book')}?step=vehicle`)}`;

  let body: ReactNode = null;
  let status: ReactNode = null;
  switch (step.id) {
    case 'vehicle':
      status = carDone && !feedback ? `Booking for ${carDone}` : null;
      body = (
        <VehicleStep
          form={form}
          set={set}
          shown={shown}
          signedIn={!!accountId}
          offerSignIn={auth.status === 'signed-out'}
          saved={savedVehicles}
          onPickSaved={pickSaved}
          onDifferentCar={differentCar}
          loginHref={loginHref}
        />
      );
      break;
    case 'services':
      status = totalText(d);
      body = <ServicesStep form={form} set={set} shown={shown} load={servicesLoad} offered={offered} hasServices={hasServices} onToggle={toggleService} />;
      break;
    case 'when':
      status = form.date && form.time && !feedback ? formatWhen(form.date, form.time, tz) : null;
      body = (
        <WhenStep
          form={form}
          set={set}
          shown={shown}
          dayRef={(el) => {
            dayRef.current = el;
          }}
          notice={whenNotice}
          onPickDate={(iso) => {
            set('date', iso);
            const keepsTime = !!form.time && zonedDate(form.time, tz) === iso;
            setFeedback(keepsTime ? `${formatWhen(iso, form.time, tz)} selected` : `${formatWhen(iso, '', tz)} selected. Now pick a time.`);
          }}
          onPickTime={(t) => {
            set('time', t);
            setWhenNotice(null);
            setFeedback(`${formatWhen(form.date, t, tz)} selected`);
          }}
          technician={
            <TechnicianSection
              form={form}
              load={teamLoad}
              experts={experts}
              open={techOpen}
              onOpenChange={setTechOpen}
              onPick={(id) => {
                set('expert', id);
                const t = experts.find((x) => x.id === id);
                setFeedback(t ? `${t.name} chosen as your technician` : 'Any available technician');
              }}
            />
          }
        />
      );
      break;
    case 'details':
      status = d.services.length ? `Estimated total ${estimateText(d)}` : 'Quoted after inspection';
      body = (
        <div className="space-y-8">
          {prefilled && (
            <p className="flex items-start gap-2 rounded-2xl border border-ok/25 bg-ok/10 px-3.5 py-3 text-sm leading-relaxed text-ok">
              <UserCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Filled in from your account. Changes here apply to this booking only.
            </p>
          )}
          <ContactStep form={form} set={set} shown={shown} />
          <CheckBooking form={form} d={d} onEdit={onEdit} />
          <ReviewFooter form={form} onDeposit={(v) => set('deposit', v)} />
        </div>
      );
      break;
  }

  const isConfirm = step.id === 'details';
  const primaryLabel = !isConfirm && returnToDetails ? 'Return to details' : step.next;

  return (
    <>
      {crumbs}
      <div className="relative isolate overflow-x-clip">
        <LiquidBackdrop />
        <div className="container-site pb-12 pt-2 sm:pb-16 sm:pt-4">
          <header className="mb-4 sm:mb-6">
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl">Book a service</h1>
            <p className="mt-1 text-sm text-fg2">Four short steps. Nothing is booked until you confirm.</p>
          </header>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0 space-y-4">
              <div ref={stepTopRef} className="scroll-mt-24">
                <Stepper current={current} canVisit={(i) => i < current || (i <= furthest && i <= firstIncomplete)} onSelect={goTo} />
              </div>

              <form noValidate onSubmit={onSubmit} aria-labelledby="book-step-title" className="glass-strong rounded-3xl p-4 sm:p-6 lg:p-8">
                <div key={step.id} className={forward ? 'book-in-forward' : 'book-in-back'}>
                  <h2 id="book-step-title" ref={headingRef} tabIndex={-1} className="font-display text-xl font-bold leading-tight text-fg outline-none sm:text-2xl">
                    {step.label}
                  </h2>
                  <p className="mt-1.5 text-sm text-fg2">{step.blurb}</p>
                  <div className="mt-6">{body}</div>
                </div>

                <ActionBar
                  onBack={current > 0 ? () => goTo(current - 1) : undefined}
                  primaryLabel={primaryLabel}
                  isConfirm={isConfirm}
                  complete={complete}
                  hint={remainingHint(step.id, stepErrors)}
                  showAlert={tried.has(step.id)}
                  attempt={attempt}
                  status={status}
                  feedback={feedback}
                  docked={site.nav_style !== 'classic'}
                  busy={submitting}
                  error={isConfirm ? submitError : null}
                />
              </form>
            </div>
            <SummaryCard d={d} className="hidden lg:block" />
          </div>
        </div>
      </div>
    </>
  );
}
