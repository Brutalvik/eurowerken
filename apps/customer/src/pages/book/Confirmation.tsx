import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Car, User, Wrench } from 'lucide-react';
import { DemoNotice } from '@/components/ui';
import { formatMoneyWhole } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { formatLongDate } from './Calendar';
import { formatSlot } from './model';
import type { FormState } from './model';
import type { SummaryData } from './BookingSummary';

/** A check that draws itself inside a ring, with a soft glow behind it. */
function DrawnCheck() {
  return (
    <span className="relative mx-auto flex h-20 w-20 items-center justify-center">
      <span aria-hidden className="book-glow absolute inset-0 rounded-full bg-ok/30 blur-xl" />
      <span aria-hidden className="book-pop absolute inset-1 rounded-full border border-white/60 bg-ok/10 backdrop-blur-md dark:border-white/10" />
      <svg viewBox="0 0 52 52" className="relative h-16 w-16 text-ok" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="26" cy="26" r="23" strokeWidth={2.5} pathLength={1} className="book-draw-ring" transform="rotate(-90 26 26)" />
        <path d="M15 27l7.5 7.5L37.5 19" strokeWidth={4} pathLength={1} className="book-draw-check" />
      </svg>
    </span>
  );
}

export function Confirmation({
  reference,
  form,
  d,
  headingRef,
}: {
  reference: string;
  form: FormState;
  d: SummaryData;
  headingRef: RefObject<HTMLHeadingElement>;
}) {
  const site = useSite();
  const rows: { Icon: typeof Car; label: string; value: ReactNode }[] = [
    { Icon: Car, label: 'Vehicle', value: `${d.vehicle}${form.vin ? ` (VIN ${form.vin})` : ''}` },
    { Icon: CalendarCheck, label: 'Requested time', value: `${formatLongDate(form.date)}, ${formatSlot(form.time)}` },
    { Icon: User, label: 'Expert', value: d.expertName ?? 'Any available expert' },
    { Icon: Wrench, label: 'Services', value: d.services.length ? d.services.map((s) => s.name).join(', ') : 'As described in your notes' },
  ];
  return (
    <div className="book-pop glass-strong book-sheen mx-auto max-w-2xl rounded-3xl p-6 sm:p-10">
      <div className="text-center">
        <DrawnCheck />
        <h1 ref={headingRef} tabIndex={-1} className="mt-5 font-display text-2xl font-bold text-fg outline-none sm:text-3xl">
          Request received
        </h1>
        <p className="mt-2 text-sm text-fg2">
          Thanks, {form.firstName.trim()}. Your reference number is <span className="font-mono font-semibold text-fg">{reference}</span>.
        </p>
      </div>

      <div className="mt-6">
        <DemoNotice>
          Online booking is not connected to the workshop yet, so this time is not reserved. {site.display_name} will call you on {form.phone.trim()} to
          confirm your appointment.
          {form.deposit ? ' You asked to pay the $50 deposit; they will arrange it on that call.' : ''}
        </DemoNotice>
      </div>

      <dl className="mt-6 divide-y divide-line/70 rounded-2xl border border-white/70 bg-surface/55 backdrop-blur-md dark:border-white/10">
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
            {d.services.length ? `${formatMoneyWhole(d.low)} to ${formatMoneyWhole(d.high)}` : 'Quoted after inspection'}
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
  );
}
