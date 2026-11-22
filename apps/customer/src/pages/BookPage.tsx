/**
 * Book Appointment: a step-by-step flow (vehicle, services, time, expert,
 * contact, review) on frosted glass panels. The current step is in the URL
 * (?step=), the draft is kept in sessionStorage per site, and the pieces live
 * in pages/book/.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { useServices, useTeam } from '@/api/catalogue';
import type { Service, Technician } from '@/api/catalogue';
import { listVehicles } from '@/api/vehicles';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { Breadcrumbs } from '@/components/ui';
import { sitePath, useSite } from '@/site/SiteContext';
import { SummaryCard, SummaryPill } from './book/BookingSummary';
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
  makeReference,
  slotsFor,
  stepIndex,
  validate,
  vehicleLabel,
} from './book/model';
import type { Errors, FormState, StepId } from './book/model';
import { ProgressRail } from './book/ProgressRail';
import { StepFrame } from './book/ui';
import { useBookingDraft } from './book/useBookingDraft';
import { ContactStep } from './book/steps/ContactStep';
import { ExpertStep } from './book/steps/ExpertStep';
import { ReviewFooter, ReviewStep } from './book/steps/ReviewStep';
import { ServicesStep } from './book/steps/ServicesStep';
import { VehicleStep } from './book/steps/VehicleStep';
import { WhenStep } from './book/steps/WhenStep';
import './book/book.css';

const NO_SERVICES: Service[] = [];
const NO_TEAM: Technician[] = [];
const NO_ERRORS: Errors = {};
/** Pause before a single choice that completes a step moves on by itself. */
const AUTO_ADVANCE_MS = 650;

interface Done {
  reference: string;
  form: FormState;
  d: SummaryData;
}

export function BookPage() {
  const site = useSite();
  const auth = useCustomerAuth();
  const [params, setParams] = useSearchParams();
  const servicesLoad = useServices();
  const teamLoad = useTeam();
  const offered = servicesLoad.data ?? NO_SERVICES;
  const experts = useMemo(() => bookableExperts(teamLoad.data ?? NO_TEAM), [teamLoad.data]);
  const hasServices = servicesLoad.loading || offered.length > 0;

  // ?service=<id> and ?tech=<id> are kept until the lists load, then checked against them.
  const [preselect] = useState(() => ({ service: params.get('service'), expert: params.get('tech') }));
  const { form, setForm, furthest, setFurthest, clearDraft } = useBookingDraft(site.slug, preselect);
  const [tried, setTried] = useState<ReadonlySet<StepId>>(() => new Set());
  const [done, setDone] = useState<Done | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  /** The progress rail: brought into view on each step change. */
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

  // Latest values for the auto-advance timer.
  const live = useRef({ form, hasServices, current });
  live.current = { form, hasServices, current };

  // Direction of travel, worked out during render so the entering step slides the right way.
  const [lastStep, setLastStep] = useState(current);
  const [forward, setForward] = useState(true);
  if (current !== lastStep) {
    setForward(current > lastStep);
    setLastStep(current);
  }

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((f) => {
        const next = { ...f, [key]: value };
        if (key === 'make' && value !== f.make) next.model = '';
        if (key === 'make' || key === 'model' || key === 'year' || key === 'vin') next.savedVehicleId = '';
        if (key === 'date' && !slotsFor(value as string).includes(next.time)) next.time = '';
        return next;
      });
    },
    [setForm],
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

  // Signed in: the customer's saved vehicles, offered as one-tap choices.
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

  // Keep the URL on the step actually shown (after a reload, or a link to a later step).
  const catalogueReady = !servicesLoad.loading;
  useEffect(() => {
    if (done || !catalogueReady) return;
    if (params.get('step') && requested !== current) setParams({ step: step.id }, { replace: true });
  }, [done, catalogueReady, params, requested, current, step.id, setParams]);

  // Auto-advance after a single choice; cancelled by any step change.
  const autoTimer = useRef<number | undefined>(undefined);
  const cancelAuto = useCallback(() => window.clearTimeout(autoTimer.current), []);
  useEffect(() => cancelAuto, [cancelAuto, current]);

  const goTo = useCallback(
    (i: number) => {
      cancelAuto();
      const target = STEPS[i];
      if (!target) return;
      setFurthest((f) => Math.max(f, i));
      setParams({ step: target.id });
    },
    [cancelAuto, setFurthest, setParams],
  );

  function autoAdvance(from: number) {
    cancelAuto();
    autoTimer.current = window.setTimeout(() => {
      const now = live.current;
      if (now.current !== from) return;
      const errs = errorsForStep(validate(now.form, now.hasServices), STEPS[from]!);
      if (Object.keys(errs).length === 0) goTo(from + 1);
    }, AUTO_ADVANCE_MS);
  }

  // Focus the step heading on each change (not on first load), and bring the card into view.
  const focusedStep = useRef(current);
  useEffect(() => {
    if (focusedStep.current === current) return;
    focusedStep.current = current;
    headingRef.current?.focus({ preventScroll: true });
    const top = stepTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && (top < 72 || top > window.innerHeight * 0.5)) {
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
    expertName: expert?.name,
    low,
    high,
  };

  function focusFirstError(errs: Errors, fields: readonly string[]) {
    for (const f of step.fields) {
      if (!errs[f] || !fields.includes(f)) continue;
      if (f === 'date') {
        dayRef.current?.focus();
        return;
      }
      const el = document.getElementById(fieldElementId(f, offered[0]?.id));
      if (el) {
        el.focus();
        return;
      }
    }
    headingRef.current?.focus();
  }

  function onContinue() {
    cancelAuto();
    if (Object.keys(stepErrors).length > 0) {
      setTried((t) => new Set(t).add(step.id));
      focusFirstError(stepErrors, step.fields);
      return;
    }
    if (step.id !== 'review') {
      goTo(current + 1);
      return;
    }
    // Confirm: everything is checked again before the request is made.
    if (Object.keys(allErrors).length > 0) {
      setTried((t) => new Set(t).add(STEPS[firstIncomplete]!.id));
      goTo(firstIncomplete);
      return;
    }
    setDone({ reference: makeReference(), form, d });
    clearDraft();
    setParams({}, { replace: true });
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
    autoAdvance(current);
  }

  const crumbs = <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Book Appointment' }]} />;

  if (done) {
    return (
      <>
        {crumbs}
        <div className="relative isolate overflow-x-clip">
          <LiquidBackdrop />
          <section className="container-site py-10 sm:py-16">
            <Confirmation reference={done.reference} form={done.form} d={done.d} headingRef={doneHeadingRef} />
          </section>
        </div>
      </>
    );
  }

  const loginHref = `${sitePath(site, 'login')}?next=${encodeURIComponent(`${sitePath(site, 'book')}?step=vehicle`)}`;

  let body: ReactNode = null;
  switch (step.id) {
    case 'vehicle':
      body = (
        <VehicleStep
          form={form}
          set={set}
          shown={shown}
          signedIn={!!accountId}
          offerSignIn={auth.status === 'signed-out'}
          saved={savedVehicles}
          onPickSaved={pickSaved}
          loginHref={loginHref}
        />
      );
      break;
    case 'services':
      body = (
        <ServicesStep
          form={form}
          set={set}
          shown={shown}
          load={servicesLoad}
          offered={offered}
          hasServices={hasServices}
          onToggle={(id) =>
            setForm((f) => ({ ...f, services: f.services.includes(id) ? f.services.filter((x) => x !== id) : [...f.services, id] }))
          }
        />
      );
      break;
    case 'when':
      body = (
        <WhenStep
          form={form}
          set={set}
          shown={shown}
          dayRef={(el) => {
            dayRef.current = el;
          }}
          onPickTime={(t) => {
            set('time', t);
            autoAdvance(current);
          }}
        />
      );
      break;
    case 'expert':
      body = (
        <ExpertStep
          form={form}
          load={teamLoad}
          experts={experts}
          onPick={(id) => {
            set('expert', id);
            autoAdvance(current);
          }}
        />
      );
      break;
    case 'contact':
      body = <ContactStep form={form} set={set} shown={shown} prefilled={prefilled} />;
      break;
    case 'review':
      body = <ReviewStep form={form} d={d} onEdit={(id) => goTo(stepIndex(id))} />;
      break;
  }

  const isReview = step.id === 'review';

  return (
    <>
      {crumbs}
      <div className="relative isolate overflow-x-clip">
        <LiquidBackdrop />
        <div className="container-site space-y-4 pb-12 pt-4 sm:space-y-5 sm:pb-16">
          <header className="glass-strong book-sheen flex items-center gap-4 rounded-3xl px-5 py-4 sm:px-7 sm:py-5">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-[0_10px_24px_-10px_rgb(var(--accent)/0.8)] sm:flex">
              <CalendarCheck className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl">Book your service</h1>
              <p key={step.id} className="book-reveal mt-0.5 truncate text-sm text-fg2">
                {step.title}
              </p>
            </div>
          </header>

          <div ref={stepTopRef} className="scroll-mt-24">
            <ProgressRail current={current} canVisit={(i) => i < current || (i <= furthest && i <= firstIncomplete)} onSelect={goTo} />
          </div>

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="min-w-0 space-y-4">
              <SummaryPill d={d} className="lg:hidden" />
              <div key={step.id} className={forward ? 'book-in-forward' : 'book-in-back'}>
                <StepFrame
                  step={step}
                  index={current}
                  headingRef={headingRef}
                  errors={stepErrors}
                  showErrors={tried.has(step.id)}
                  onBack={current > 0 ? () => goTo(current - 1) : undefined}
                  onContinue={onContinue}
                  continueLabel={isReview ? 'Confirm appointment' : 'Continue'}
                  continueIcon={isReview ? <CalendarCheck className="h-4 w-4" aria-hidden /> : undefined}
                  footer={isReview ? <ReviewFooter form={form} d={d} onDeposit={(v) => set('deposit', v)} /> : undefined}
                >
                  {body}
                </StepFrame>
              </div>
            </div>
            <SummaryCard d={d} className="hidden lg:block" />
          </div>
        </div>
      </div>
    </>
  );
}
