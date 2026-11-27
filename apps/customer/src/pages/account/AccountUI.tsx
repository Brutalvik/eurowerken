/**
 * Building blocks for the sign-in, register and reset pages, and the plain
 * fields the account and garage pages use.
 *
 * Glass sign-in UI: a near-black section with a soft light beam, a frosted
 * card, inset fields, the 6-digit code step and the welcome step. The staff
 * app has the same components with the same API in
 * apps/erp/src/pages/auth/AuthUI.tsx, so both can move into a shared package
 * later. Only AuthScreen and AppIconTile differ per app.
 *
 * The sign-in screens are always dark: AuthScreen sets the `dark` class, so
 * the tokens resolve to their dark values in both themes, and re-applies the
 * workshop's colour (lifted for dark) as --accent.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ClipboardEvent, CSSProperties, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { hexToRgbTriplet, lightenTriplet, readableOn } from '@eurowerken/shared';
import { sitePath, useSite } from '@/site/SiteContext';

/* ------------------------------------------------------------------ */
/* Screen and card                                                     */
/* ------------------------------------------------------------------ */

/** Faint specks: [left %, top %, classes]. Fixed positions so the page does not shift between renders. */
const SPECKS: [number, number, string][] = [
  [6, 14, 'h-0.5 w-0.5 bg-white/30'],
  [14, 62, 'h-1 w-1 bg-white/10'],
  [21, 28, 'h-0.5 w-0.5 bg-white/20'],
  [29, 84, 'h-0.5 w-0.5 bg-white/25'],
  [37, 9, 'h-1 w-1 bg-white/15'],
  [44, 47, 'h-0.5 w-0.5 bg-white/20'],
  [52, 76, 'h-0.5 w-0.5 bg-white/30'],
  [58, 19, 'h-0.5 w-0.5 bg-white/25'],
  [66, 58, 'h-1 w-1 bg-white/10'],
  [73, 33, 'h-0.5 w-0.5 bg-white/30'],
  [81, 88, 'h-0.5 w-0.5 bg-white/20'],
  [88, 12, 'h-1 w-1 bg-white/15'],
  [93, 52, 'h-0.5 w-0.5 bg-white/25'],
  [10, 92, 'h-0.5 w-0.5 bg-white/20'],
  [63, 94, 'h-0.5 w-0.5 bg-white/15'],
  [97, 71, 'h-0.5 w-0.5 bg-white/20'],
];

function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-black to-black" />
      {/* The diagonal light beam from the top. */}
      <div className="absolute -top-48 left-1/2 h-[75vh] w-[52rem] -translate-x-[35%] rotate-[24deg] bg-gradient-to-b from-white/[0.2] via-white/[0.06] to-transparent blur-3xl" />
      <div className="absolute -top-40 left-1/2 h-[60vh] w-32 -translate-x-[20%] rotate-[24deg] bg-gradient-to-b from-white/30 via-white/[0.07] to-transparent blur-2xl" />
      <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />
      {SPECKS.map(([x, y, cls]) => (
        <span key={`${x}-${y}`} className={`absolute rounded-full ${cls}`} style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </div>
  );
}

/**
 * The `dark` class resets --accent to the default blue, so put the
 * workshop's colour back, lifted the same way SiteProvider lifts it for dark mode.
 */
function darkBrandVars(hex: string | null | undefined): CSSProperties | undefined {
  const triplet = hexToRgbTriplet(hex);
  if (!triplet) return undefined;
  const accent = lightenTriplet(triplet, 0.3);
  return { '--accent': accent, '--accent-fg': readableOn(accent) } as CSSProperties;
}

/**
 * Full-width dark section under the site header, with the card centred and
 * the site's Terms and Privacy links under it.
 */
export function AuthScreen({ children, legal = true }: { children: ReactNode; legal?: boolean }) {
  const site = useSite();
  const style = useMemo(() => darkBrandVars(site.accent_color), [site.accent_color]);
  const link =
    'inline-flex items-center rounded-md hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 coarse:min-h-11';
  return (
    <div className="dark relative isolate overflow-hidden bg-black text-fg" style={style}>
      <AuthBackdrop />
      <div
        className={`mx-auto flex min-h-[calc(100dvh-4rem-env(safe-area-inset-top))] w-full max-w-[432px] flex-col justify-center px-4 pt-10 sm:pt-14 xl:min-h-[calc(100dvh-76px-env(safe-area-inset-top))] ${
          // The liquid-glass tab bar docks over the bottom of the screen: keep the card clear of it.
          site.nav_style === 'classic' ? 'pb-10 sm:pb-14' : 'pb-32 sm:pb-36'
        }`}
      >
        {children}
        {legal && (
          <nav aria-label="Legal" className="mt-6 flex flex-wrap items-center justify-center gap-x-4 text-xs text-fg3">
            <Link to={sitePath(site, 'terms')} className={link}>
              Terms and Conditions
            </Link>
            <Link to={sitePath(site, 'privacy')} className={link}>
              Privacy Policy
            </Link>
          </nav>
        )}
      </div>
    </div>
  );
}

/** The workshop's logo (or the wrench mark) in a small rounded glass tile. */
export function AppIconTile() {
  const site = useSite();
  return (
    <span
      role="img"
      aria-label={site.display_name}
      className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.03] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9)]"
    >
      {site.logo_url ? (
        <img src={site.logo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Wrench className="h-6 w-6 text-accent" aria-hidden />
      )}
    </span>
  );
}

interface GlassAuthCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Replaces the logo tile at the top (the welcome step shows the avatar here). */
  icon?: ReactNode;
  /** Lets a control point at the subtitle, for example the code boxes. */
  subtitleId?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Rounded frosted card with a thin light rim, brighter at the top. */
export function GlassAuthCard({ title, subtitle, icon, subtitleId, children, footer }: GlassAuthCardProps) {
  return (
    <section className="relative rounded-[calc(28px*var(--site-radius,1))] border border-white/10 border-t-white/20 bg-white/[0.04] p-5 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)] backdrop-blur-2xl sm:p-8">
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[calc(28px*var(--site-radius,1))] bg-gradient-to-b from-white/[0.06] via-transparent to-transparent" />
      <div className="relative">
        <div className="flex justify-center">{icon ?? <AppIconTile />}</div>
        <h1 className="mt-5 text-center font-display text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {subtitle && (
          <p id={subtitleId} className="mt-2 text-center text-sm leading-relaxed text-fg2">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-7">{children}</div>}
        {footer && <div className="mt-6 text-center text-sm text-fg2">{footer}</div>}
      </div>
    </section>
  );
}

/** AuthScreen and GlassAuthCard together: the usual sign-in page. */
export function AuthShell(props: GlassAuthCardProps) {
  return (
    <AuthScreen>
      <GlassAuthCard {...props} />
    </AuthScreen>
  );
}

/** Full-screen loading state on the same dark screen. */
export function AuthLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <AuthScreen legal={false}>
      <div role="status" aria-label={label} className="flex flex-col items-center gap-5">
        <AppIconTile />
        <Loader2 className="h-5 w-5 animate-spin text-fg2 motion-reduce:animate-none" aria-hidden />
      </div>
    </AuthScreen>
  );
}

/* ------------------------------------------------------------------ */
/* Fields, messages, buttons                                           */
/* ------------------------------------------------------------------ */

type AuthFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

/** Dark inset field with its small label inside the box. Errors and hints are tied to the input. */
export function AuthField({ id, label, error, hint, className = '', ...input }: AuthFieldProps) {
  const describedBy = [error ? `${id}-error` : '', hint && !error ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <div
        className={`rounded-2xl border bg-black/40 px-4 pb-2 pt-2.5 shadow-[inset_0_1px_3px_rgb(0_0_0/0.6)] transition focus-within:ring-2 ${
          error ? 'border-bad/60 focus-within:ring-bad/30' : 'border-white/10 focus-within:border-accent/60 focus-within:ring-accent/30'
        }`}
      >
        <label htmlFor={id} className="block text-[11px] font-medium text-fg3">
          {label}
        </label>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`mt-0.5 block w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg3/60 read-only:text-fg2 ${className}`}
          {...input}
        />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 px-1 text-xs text-fg3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 px-1 text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level error, announced when it appears. */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
      {children}
    </p>
  );
}

/** Calm confirmation, announced politely. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-2xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
      {children}
    </p>
  );
}

const BUTTON_BASE =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60';

/** Class strings for links that look like the buttons. */
export const authButtonClass = {
  primary: `${BUTTON_BASE} bg-accent text-accent-fg shadow-[0_10px_32px_-8px_rgb(var(--accent)/0.65)] hover:brightness-110 focus-visible:ring-accent`,
  secondary: `${BUTTON_BASE} border border-white/10 bg-white/[0.06] text-fg hover:bg-white/10 focus-visible:ring-white/40`,
} as const;

/** Small accent text button or link, with a 44 px touch target on touch screens. */
export const textLinkClass =
  'inline-flex items-center rounded-md font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 coarse:min-h-11';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel?: string };

export function PrimaryButton({ busy = false, busyLabel, children, className = '', type = 'submit', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || busy} className={`${authButtonClass.primary} ${className}`} {...rest}>
      {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function SecondaryButton({ busy = false, busyLabel, children, className = '', type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || busy} className={`${authButtonClass.secondary} ${className}`} {...rest}>
      {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function TextButton({ className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${textLinkClass} ${className}`} {...rest} />;
}

/** Google sign-in as the dark secondary button. A plain "G" in the text colour (no brand hex). */
export function GoogleButton({ onClick, disabled, label = 'Continue with Google' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <SecondaryButton onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="currentColor">
        <path d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.33zM12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.08v2.58A10 10 0 0 0 12 22zm-5.59-8.09a6 6 0 0 1 0-3.82V7.51H3.08a10 10 0 0 0 0 8.98l3.33-2.58zM12 5.96c1.47 0 2.79.5 3.83 1.5l2.86-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.92 5.51l3.33 2.58C7.2 7.72 9.4 5.96 12 5.96z" />
      </svg>
      {label}
    </SecondaryButton>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] text-fg3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
      Or
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
    </div>
  );
}

/** Two-way choice (for example join or create a workshop) as a dark segmented control. */
export function AuthSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/40 p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            value === v ? 'bg-white/10 text-fg shadow-sm' : 'text-fg2 hover:text-fg'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6-digit code                                                        */
/* ------------------------------------------------------------------ */

export const CODE_LENGTH = 6;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** A short sideways shake, skipped for people who ask for reduced motion. */
function shake(el: HTMLElement | null) {
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)' },
      { transform: 'translateX(7px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 380, easing: 'ease-out' },
  );
}

interface CodeInputProps {
  /** Id of the instruction that labels the group of boxes. */
  labelledBy: string;
  describedBy?: string;
  /** Called with the code as soon as every box has a digit. */
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Increase after a failed check: the boxes clear, shake and focus the first one. */
  errorKey?: number;
}

/**
 * Six one-digit boxes. Typing moves forward, Backspace on an empty box goes
 * back, arrow keys move, and pasting (or the phone's code autofill) fills
 * every box. The first box focuses when it appears.
 */
export function CodeInput({ labelledBy, describedBy, onComplete, disabled = false, invalid = false, errorKey = 0 }: CodeInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array<string>(CODE_LENGTH).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const groupRef = useRef<HTMLDivElement>(null);

  const focusAt = useCallback((i: number) => {
    const el = refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  }, []);

  useEffect(() => {
    focusAt(0);
  }, [focusAt]);

  useEffect(() => {
    if (errorKey === 0) return;
    setDigits(Array<string>(CODE_LENGTH).fill(''));
    shake(groupRef.current);
    // The boxes are re-enabled in the same render; focus after it.
    window.setTimeout(() => focusAt(0), 0);
  }, [errorKey, focusAt]);

  function commit(next: string[], focusIndex: number) {
    setDigits(next);
    focusAt(focusIndex);
    if (next.every((d) => d !== '')) onComplete(next.join(''));
  }

  function fill(from: number, text: string) {
    const chars = text.replace(/\D/g, '').slice(0, CODE_LENGTH).split('');
    if (chars.length === 0) return;
    // A whole code always starts at the first box, wherever it was pasted.
    const start = chars.length >= CODE_LENGTH ? 0 : from;
    const next = [...digits];
    chars.forEach((c, k) => {
      if (start + k < CODE_LENGTH) next[start + k] = c;
    });
    commit(next, Math.min(start + chars.length, CODE_LENGTH - 1));
  }

  function onChange(i: number, raw: string) {
    const only = raw.replace(/\D/g, '');
    const next = [...digits];
    if (only.length === 0) {
      next[i] = '';
      setDigits(next);
      return;
    }
    if (only.length === 1) {
      next[i] = only;
      commit(next, i + 1);
      return;
    }
    if (only.length === 2 && digits[i]) {
      // Typed over a digit that was not selected: keep the new one.
      next[i] = only[0] === digits[i] ? only[1]! : only[0]!;
      commit(next, i + 1);
      return;
    }
    fill(i, only);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
      focusAt(i - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(CODE_LENGTH - 1);
    }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    fill(i, e.clipboardData.getData('text'));
  }

  return (
    <div ref={groupRef} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="grid grid-cols-6 gap-1.5 sm:gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          value={d}
          onChange={(e) => onChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={`h-14 w-full min-w-0 rounded-2xl border bg-black/40 text-center font-mono text-2xl text-fg caret-accent shadow-[inset_0_1px_3px_rgb(0_0_0/0.6)] outline-none transition focus:ring-2 disabled:opacity-60 ${
            invalid ? 'border-bad/60 focus:ring-bad/30' : d ? 'border-white/25 focus:border-accent/70 focus:ring-accent/30' : 'border-white/10 focus:border-accent/70 focus:ring-accent/30'
          }`}
        />
      ))}
    </div>
  );
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const RESEND_SECONDS = 60;

interface CodeStepProps {
  email: string;
  /** signup: confirm a new account. recovery: reset a password. */
  purpose: 'signup' | 'recovery';
  /** Checks the code. Returns an error message, or null when it worked (the page then moves on). */
  onVerify: (code: string) => Promise<string | null>;
  /** Sends a new code. Returns an error message, or null. */
  onResend: () => Promise<string | null>;
  onBack: () => void;
  /** An error to show straight away, for example when sending the first code failed. */
  initialError?: string | null;
}

/** "Check your inbox": the six boxes, resend with a cooldown, and a way back. */
export function CodeStep({ email, purpose, onVerify, onResend, onBack, initialError = null }: CodeStepProps) {
  const instructionId = useId();
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [errorKey, setErrorKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function verify(code: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const err = await onVerify(code);
    // On success the page moves on and this step goes away, so only failures update it.
    if (err) {
      busyRef.current = false;
      setBusy(false);
      setError(err);
      setErrorKey((k) => k + 1);
    }
  }

  async function resend() {
    if (remaining > 0 || busyRef.current) return;
    setError(null);
    setNotice(null);
    const started = Date.now();
    setCooldownUntil(started + RESEND_SECONDS * 1000);
    setNow(started);
    const err = await onResend();
    if (err) setError(err);
    else setNotice(`We sent a new code to ${email}.`);
  }

  return (
    <GlassAuthCard
      title="Check your inbox"
      subtitleId={instructionId}
      subtitle={
        <>
          Enter the 6-digit code we sent to <span className="break-all font-medium text-fg">{email}</span>
        </>
      }
      footer={
        <>
          Wrong email? <TextButton onClick={onBack}>Go back</TextButton>
        </>
      }
    >
      <div className="space-y-4">
        <CodeInput
          labelledBy={instructionId}
          describedBy={error ? errorId : undefined}
          onComplete={(code) => void verify(code)}
          disabled={busy}
          invalid={Boolean(error) && !busy}
          errorKey={errorKey}
        />
        <p role="status" aria-live="polite" className="flex min-h-5 items-center justify-center gap-2 text-xs text-fg2">
          {busy && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Checking the code...
            </>
          )}
        </p>
        {error && (
          <div id={errorId}>
            <AuthAlert>{error}</AuthAlert>
          </div>
        )}
        {notice && <AuthNotice>{notice}</AuthNotice>}
        <SecondaryButton onClick={() => void resend()} disabled={remaining > 0 || busy}>
          {remaining > 0 ? `Resend in ${formatCountdown(remaining)}` : 'Resend code'}
        </SecondaryButton>
        <p className="text-center text-xs leading-relaxed text-fg3">
          {purpose === 'signup'
            ? 'The email also has a confirmation link. Opening it works too.'
            : 'The email also has a reset link. Opening it on this device works too.'}
        </p>
      </div>
    </GlassAuthCard>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome                                                             */
/* ------------------------------------------------------------------ */

export interface WelcomeItem {
  label: string;
  done: boolean;
}

interface WelcomeCardProps {
  title: string;
  subtitle: string;
  email: string;
  initials: string;
  avatarUrl?: string | null;
  /** The real loading steps; each shows a spinner until done. */
  steps: WelcomeItem[];
  /** Called once: when every step is done (after minMs), or after maxMs at the latest. */
  onDone: () => void;
  minMs?: number;
  maxMs?: number;
}

/** Shown after a sign-in or a verified code, while the app loads what it needs. */
export function WelcomeCard({ title, subtitle, email, initials, avatarUrl, steps, onDone, minMs = 600, maxMs = 8000 }: WelcomeCardProps) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const percent = steps.length === 0 ? 100 : Math.round((doneCount / steps.length) * 100);

  const startedAt = useRef(Date.now());
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(finish, maxMs);
    return () => window.clearTimeout(t);
  }, [finish, maxMs]);

  useEffect(() => {
    if (!allDone) return;
    const t = window.setTimeout(finish, Math.max(0, minMs - (Date.now() - startedAt.current)));
    return () => window.clearTimeout(t);
  }, [allDone, finish, minMs]);

  const avatar = (
    <div className="relative h-16 w-16">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-1 ring-white/15" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-white/[0.16] to-white/[0.04] font-display text-xl font-semibold text-fg ring-1 ring-white/15">
          {initials}
        </span>
      )}
      <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg ring-4 ring-black/80">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    </div>
  );

  return (
    <GlassAuthCard
      icon={avatar}
      title={title}
      subtitle={subtitle}
      footer={<p className="break-all font-mono text-[11px] uppercase tracking-wider text-fg3">Signed in as {email}</p>}
    >
      <div className="flex items-center justify-between text-xs font-medium text-fg2" aria-hidden>
        <span>{allDone ? 'Ready' : 'Getting things ready'}</span>
        <span className="font-mono text-fg">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Loading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-accent shadow-[0_0_12px_rgb(var(--accent)/0.7)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
      <ul className="mt-5 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 text-sm">
            <span className={s.done ? 'text-fg' : 'text-fg2'}>{s.label}</span>
            {s.done ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-fg3 motion-reduce:animate-none" aria-hidden />
            )}
            <span className="sr-only">{s.done ? 'done' : 'loading'}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {allDone ? 'All set. Opening now.' : `Loading, ${doneCount} of ${steps.length} steps done.`}
      </p>
    </GlassAuthCard>
  );
}

/* ------------------------------------------------------------------ */
/* Plain fields for the account and garage pages (the site's own look) */
/* ------------------------------------------------------------------ */

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ id, label, error, hint, className = '', ...input }: FieldProps) {
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`input ${error ? 'border-bad focus:border-bad focus:ring-bad/20' : ''} ${className}`}
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-fg3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level error, announced when it appears. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
      {children}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function SubmitButton({ busy, busyLabel, children, className = '' }: { busy: boolean; busyLabel: string; children: ReactNode; className?: string }) {
  return (
    <button type="submit" disabled={busy} className={`btn-ink w-full disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>
      {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {busy ? busyLabel : children}
    </button>
  );
}

/** Focus the first field (by id) that has an error, after the errors render. */
export function focusFirstError(order: string[], errors: Record<string, string | undefined>) {
  const first = order.find((key) => errors[key]);
  if (first) window.setTimeout(() => document.getElementById(first)?.focus(), 0);
}

export const MIN_PASSWORD = 8;

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
