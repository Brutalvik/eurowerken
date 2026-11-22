/** Small pieces shared by the booking steps. */
import type { ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarCheck, Check, Loader2 } from 'lucide-react';
import type { Errors, Field } from './model';

/**
 * A selectable glass card wrapping a real checkbox or radio (visually hidden
 * inside it). Calm: a tinted fill, an accent border and a check mark when
 * chosen; a focus ring when the input has keyboard focus.
 */
export function choiceClass(on: boolean, invalid = false): string {
  return `relative flex cursor-pointer rounded-2xl border backdrop-blur-md transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg ${
    on
      ? 'border-accent bg-accent/10 shadow-[0_0_0_1px_rgb(var(--accent))]'
      : invalid
        ? 'border-bad/60 bg-surface/60 hover:bg-surface/80'
        : 'border-white/70 bg-surface/60 hover:border-accent/50 hover:bg-surface/85 dark:border-white/10'
  }`;
}

/** The round mark in the corner of a choice card: empty, or filled with a check. */
export function CheckMark({ on, radio = false, className = '' }: { on: boolean; radio?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center border transition-colors duration-150 ${radio ? 'rounded-full' : 'rounded-lg'} ${
        on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface/80 text-transparent'
      } ${className}`}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  );
}

export function ErrorText({ field, error }: { field: Field; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${field}-error`} className="mt-2 flex items-start gap-1.5 text-xs font-medium text-bad">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      {error}
    </p>
  );
}

/** aria-invalid and aria-describedby for a control whose field has an error. */
export function errorProps(errors: Errors, field: Field, hintId?: string) {
  if (errors[field]) return { 'aria-invalid': true as const, 'aria-describedby': hintId ? `${field}-error ${hintId}` : `${field}-error` };
  return hintId ? { 'aria-describedby': hintId } : {};
}

export function GroupLabel({ id, children, optional, as: Tag = 'p' }: { id?: string; children: ReactNode; optional?: boolean; as?: 'p' | 'legend' | 'h3' }) {
  return (
    <Tag id={id} className="mb-3 flex items-baseline gap-2 p-0 text-sm font-semibold text-fg">
      {children}
      {optional && <span className="text-xs font-normal text-fg3">Optional</span>}
    </Tag>
  );
}

/**
 * The one action bar at the bottom of the step card: Back on the left, a
 * status in the middle (the last change, then what is left or where things
 * stand) and the primary button that says where it goes. The button is never
 * disabled: when the step is not complete it looks quieter, the bar says what
 * is left, and pressing it points at what is missing.
 */
export function ActionBar({
  onBack,
  primaryLabel,
  isConfirm,
  complete,
  hint,
  showAlert,
  attempt,
  status,
  feedback,
  docked,
  busy = false,
  error = null,
}: {
  /** The booking request is on its way: the button says so and further presses are ignored. */
  busy?: boolean;
  /** A problem from the server, in plain words, shown as an alert in the bar. */
  error?: string | null;
  /** The site has the docked tab bar at the bottom: the sticky bar stops above it. */
  docked: boolean;
  onBack?: () => void;
  primaryLabel: string;
  isConfirm: boolean;
  complete: boolean;
  /** What is left on this step (null when complete). */
  hint: string | null;
  /** The visitor pressed the button with something missing: the hint becomes an alert. */
  showAlert: boolean;
  /** Changes on each press with something missing, so the alert is announced again. */
  attempt: number;
  /** Where the step stands, shown when it is complete (for example the running total). */
  status?: ReactNode;
  /** The last change (for example "Oil Service added"); this element is the page's live region. */
  feedback: string;
}) {
  const hintId = 'book-action-hint';
  return (
    <div
      className={`glass-strong z-10 mt-8 rounded-2xl p-3 sm:p-4 lg:sticky ${docked ? 'lg:bottom-[calc(9rem+env(safe-area-inset-bottom))]' : 'lg:bottom-4'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} disabled={busy} className="btn-outline min-h-11 disabled:opacity-60 whitespace-nowrap bg-surface/60 px-3.5 backdrop-blur-md sm:px-4">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        )}

        <div className="order-first min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
          <p role="status" aria-live="polite" className="text-xs font-medium text-ok">
            {feedback && (
              <span key={feedback} className="book-reveal inline-flex items-start gap-1.5">
                <Check className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
                {feedback}
              </span>
            )}
          </p>
          {error ? (
            <p id={hintId} role="alert" className="mt-0.5 flex items-start gap-1.5 text-sm font-medium text-bad">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : !complete && hint ? (
            showAlert ? (
              <p key={attempt} id={hintId} role="alert" className="mt-0.5 flex items-start gap-1.5 text-sm font-medium text-bad">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {hint}
              </p>
            ) : (
              <p id={hintId} className="mt-0.5 text-sm text-fg2">
                {hint}
              </p>
            )
          ) : (
            status && <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-fg">{status}</div>
          )}
        </div>

        <button
          type="submit"
          aria-disabled={busy || undefined}
          aria-describedby={error || (!complete && hint) ? hintId : undefined}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition-opacity sm:flex-none sm:px-5 coarse:min-h-12 ${
            busy
              ? 'cursor-wait bg-accent/80 text-accent-fg'
              : complete
              ? 'bg-accent text-accent-fg shadow-[0_10px_24px_-12px_rgb(var(--accent)/0.9)] hover:opacity-90'
              : 'border border-line bg-surface/80 text-fg hover:border-accent/50'
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Booking your time...
            </>
          ) : (
            <>
              {isConfirm && <CalendarCheck className="h-4 w-4" aria-hidden />}
              {primaryLabel}
              {!isConfirm && <ArrowRight className="h-4 w-4" aria-hidden />}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
