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
