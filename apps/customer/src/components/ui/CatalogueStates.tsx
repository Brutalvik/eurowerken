/**
 * Loading, error and empty states for lists that come from the workshop's
 * catalogue (services, team, parts). Tokens only, so branding and dark mode apply.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CloudOff, Phone, RotateCcw } from 'lucide-react';
import { useSite } from '@/site/SiteContext';

/** Pulsing glass cards while a list loads. The wrapper is aria-busy and announces what is loading. */
export function SkeletonGrid({
  label,
  count = 6,
  className = 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3',
  card = 'h-64',
}: {
  /** For screen readers, for example "Loading services". */
  label: string;
  count?: number;
  /** Grid classes, to match the layout of the loaded list. */
  className?: string;
  /** Height (and any other classes) of one placeholder card. */
  card?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <ul className={className} aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className={`glass flex animate-pulse flex-col gap-3 rounded-2xl p-5 motion-reduce:animate-none ${card}`}>
            <span className="h-10 w-10 rounded-xl bg-surface2" />
            <span className="h-4 w-3/4 rounded bg-surface2" />
            <span className="h-3 w-full rounded bg-surface2" />
            <span className="h-3 w-2/3 rounded bg-surface2" />
            <span className="mt-auto h-9 w-full rounded-xl bg-surface2" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Friendly message when a list could not be loaded, with a Retry button. */
export function LoadError({ what, onRetry, className = '' }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`glass flex flex-col items-center rounded-2xl px-6 py-12 text-center ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface2 text-fg3">
        <CloudOff className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-fg">We could not load the {what}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-fg2">Check your connection and try again. If it keeps happening, please call the workshop.</p>
      <button type="button" onClick={onRetry} className="btn-outline mt-6 coarse:min-h-11">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Retry
      </button>
    </div>
  );
}

/** "tel:" link value from a displayed phone number. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Empty catalogue, written for customers, with the workshop's phone when it has one. */
export function EmptyCatalogue({
  Icon,
  title,
  text,
  children,
  className = '',
}: {
  Icon: LucideIcon;
  title: string;
  /** Ends with what to do next; the phone number is added when the site has one. */
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  const site = useSite();
  return (
    <div className={`glass flex flex-col items-center rounded-2xl px-6 py-12 text-center ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-fg2">{text}</p>
      {(site.phone || children) && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {site.phone && (
            <a href={telHref(site.phone)} className="btn-ink coarse:min-h-11">
              <Phone className="h-4 w-4" aria-hidden />
              Call {site.phone}
            </a>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
