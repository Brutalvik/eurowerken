import type { InputHTMLAttributes, ReactNode } from 'react';
import { Loader2, Moon, Sun, Wrench } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { useTheme } from '@/theme/ThemeProvider';

/** Centered card used by the sign-in, password reset and setup screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { mode, toggle } = useTheme();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <button
        type="button"
        onClick={toggle}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute right-4 top-4 rounded-lg border border-line bg-surface2 p-2 text-fg2 hover:text-fg"
      >
        {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
            <Wrench className="h-4 w-4 text-white" aria-hidden />
          </span>
          <div>
            <div className="font-display text-lg font-bold leading-none text-fg">
              {BRAND.prefix}
              <span className="text-accent">{BRAND.suffix}</span>
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-widest text-fg3">{BRAND.product}</div>
          </div>
        </div>

        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h1 className="font-display text-base font-semibold text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-fg2">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

export function Field({ label, id, ...rest }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-fg2">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-fg outline-none placeholder:text-fg3 focus:border-accent focus:ring-2 focus:ring-accent/20"
        {...rest}
      />
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const cls = tone === 'error' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-ok/30 bg-ok/10 text-ok';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>
      {children}
    </p>
  );
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
    </div>
  );
}

/**
 * Google sign-in button. The four-colour mark is Google's required brand
 * artwork, so its fills are the one place hex colours are allowed.
 */
export function GoogleButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-fg transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-fg3">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
