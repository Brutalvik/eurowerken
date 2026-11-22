/**
 * Small building blocks shared by the customer pages. Colours come from
 * tokens only (text-accent, bg-surface, ...) so workshop branding and dark
 * mode apply everywhere.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Minus, Plus, Star } from 'lucide-react';

/** Dark banner at the top of inner pages (Services, Parts, Booking, ...). */
export function PageHero({
  title,
  subtitle,
  children,
  align = 'left',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <section className="relative overflow-hidden bg-sidebar text-white">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      <div className={`container-site relative py-12 sm:py-16 ${align === 'center' ? 'text-center' : ''}`}>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        {subtitle && (
          <p className={`mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base ${align === 'center' ? 'mx-auto' : ''}`}>
            {subtitle}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="container-site pt-5">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-fg3">
        {items.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
            {c.to ? (
              <Link to={c.to} className="hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-fg">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Five stars, filled to the rating (rounded to the nearest half for the label only). */
export function Stars({ rating, size = 'sm', label = true }: { rating: number; size?: 'sm' | 'md'; label?: boolean }) {
  const px = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ? `${rating} out of 5 stars` : undefined}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`${px} ${i < Math.round(rating) ? 'fill-warn text-warn' : 'text-line'}`} aria-hidden />
      ))}
    </span>
  );
}

type Tone = 'accent' | 'ok' | 'warn' | 'bad' | 'neutral' | 'ink';
const TONES: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent',
  ok: 'bg-ok/12 text-ok',
  warn: 'bg-warn/12 text-warn',
  bad: 'bg-bad/12 text-bad',
  neutral: 'bg-surface2 text-fg2',
  ink: 'bg-ink text-bg',
};

export function Pill({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Numbered section card used by multi-step forms (checkout, booking). */
export function StepCard({ step, title, children, className = '' }: { step?: number; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl p-5 sm:p-7 ${className}`}>
      <h2 className="flex items-center gap-3 font-display text-lg font-semibold text-fg">
        {step !== undefined && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-bg">{step}</span>
        )}
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  label = 'Quantity',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const btn = 'flex h-9 w-9 items-center justify-center text-fg2 transition hover:text-fg disabled:opacity-40 coarse:h-11 coarse:w-11';
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface/80" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Decrease">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-fg">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Notice shown wherever a flow is not connected to the backend yet. */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-xs leading-relaxed text-warn">
      {children}
    </p>
  );
}

export { EmptyCatalogue, LoadError, SkeletonGrid, telHref } from './CatalogueStates';
export { Switch } from './Switch';
