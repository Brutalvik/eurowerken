/** Small pieces shared by the booking steps. */
import type { FormEvent, ReactNode, RefObject } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { STEPS } from './model';
import type { Errors, Field, StepInfo } from './model';

/** Classes for a selectable glass tile: lifts, glows and tints when chosen. */
export function tileClass(on: boolean, invalid = false): string {
  return `group relative rounded-2xl border text-left outline-none backdrop-blur-md transition duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98] motion-reduce:transform-none coarse:min-h-11 ${
    on
      ? 'scale-[1.015] border-accent/70 bg-accent/10 shadow-[0_0_0_4px_rgb(var(--accent)/0.12),0_16px_36px_-14px_rgb(var(--accent)/0.55)]'
      : invalid
        ? 'border-bad/50 bg-surface/60 hover:bg-surface/80'
        : 'border-white/70 bg-surface/55 shadow-[0_4px_18px_rgb(var(--ink)/0.05)] hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface/80 dark:border-white/10'
  }`;
}

/** Classes for a selectable chip (model, year, urgency, time). */
export function chipClass(on: boolean, invalid = false): string {
  return `rounded-full border px-4 py-2 text-sm font-medium tabular-nums outline-none backdrop-blur-md transition duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-95 motion-reduce:transform-none coarse:min-h-11 ${
    on
      ? 'border-accent bg-accent text-accent-fg shadow-[0_8px_22px_-8px_rgb(var(--accent)/0.7)]'
      : invalid
        ? 'border-bad/50 bg-surface/60 text-fg'
        : 'border-white/70 bg-surface/60 text-fg2 hover:border-accent/40 hover:text-fg dark:border-white/10'
  }`;
}

/** A round badge whose check draws in when the tile is chosen. */
export function CheckBadge({ on, className = '' }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition duration-300 ${
        on ? 'scale-100 border-accent bg-accent text-accent-fg' : 'scale-90 border-line bg-surface/70 text-transparent'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={on ? 0 : 1}
          className="transition-[stroke-dashoffset] delay-75 duration-300 ease-out"
        />
      </svg>
    </span>
  );
}

export function ErrorText({ field, error }: { field: Field; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${field}-error`} className="mt-2 text-xs font-medium text-bad">
      {error}
    </p>
  );
}

/** aria-invalid and aria-describedby for a control whose field has an error. */
export function errorProps(errors: Errors, field: Field, hintId?: string) {
  if (errors[field]) return { 'aria-invalid': true as const, 'aria-describedby': `${field}-error` };
  return hintId ? { 'aria-describedby': hintId } : {};
}

export function GroupLabel({ id, children, optional }: { id: string; children: ReactNode; optional?: boolean }) {
  return (
    <p id={id} className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-fg">
      {children}
      {optional && <span className="text-xs font-normal text-fg3">Optional</span>}
    </p>
  );
}

/**
 * One step: a frosted card with its heading (focused on each change), the
 * content, and Back and Continue at the end of the card (not docked, because
 * the site has a tab bar at the bottom of phones).
 */
export function StepFrame({
  step,
  index,
  headingRef,
  errors,
  showErrors,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueIcon,
  children,
  footer,
}: {
  step: StepInfo;
  index: number;
  headingRef: RefObject<HTMLHeadingElement>;
  /** This step's current errors (shown inline once showErrors is set). */
  errors: Errors;
  showErrors: boolean;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueIcon?: ReactNode;
  children: ReactNode;
  /** Shown above the buttons (deposit, terms on the review step). */
  footer?: ReactNode;
}) {
  const missing = step.fields.map((f) => errors[f]).filter((m): m is string => !!m);
  const valid = missing.length === 0;
  const hintId = `step-${step.id}-hint`;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onContinue();
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby={`step-${step.id}-title`} className="glass-strong book-sheen rounded-3xl p-5 sm:p-8">
      <p className="eyebrow">
        Step {index + 1} of {STEPS.length}
      </p>
      <h2
        id={`step-${step.id}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="mt-2 font-display text-xl font-bold leading-tight text-fg outline-none sm:text-2xl"
      >
        {step.question}
      </h2>
      <p className="mt-1.5 text-sm text-fg2">{step.blurb}</p>

      {showErrors && !valid && (
        <p role="alert" className="mt-4 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {missing.length === 1 ? missing[0] : `Please fix the ${missing.length} highlighted items below.`}
        </p>
      )}

      <div className="mt-6">{children}</div>

      {footer && <div className="mt-6">{footer}</div>}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:items-start sm:justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className="btn-outline bg-surface/60 backdrop-blur-md">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="submit"
            aria-disabled={!valid || undefined}
            aria-describedby={!valid ? hintId : undefined}
            className={`btn-ink w-full transition sm:w-auto sm:min-w-44 ${valid ? '' : 'opacity-45 shadow-none hover:opacity-55'}`}
          >
            {continueIcon}
            {continueLabel}
            {!continueIcon && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>
          {!valid && (
            <p id={hintId} className="text-center text-xs text-fg3 sm:text-right">
              {missing[0]}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
