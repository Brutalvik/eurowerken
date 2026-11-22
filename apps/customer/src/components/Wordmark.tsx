import { Wrench } from 'lucide-react';
import { splitBrandName } from '@eurowerken/shared';
import type { WorkshopSite } from '@eurowerken/shared';

/** The workshop's logo (if set) or a wrench mark, with the two-tone name. */
export function Wordmark({ site, inverted = false }: { site: WorkshopSite; inverted?: boolean }) {
  const [first, second] = splitBrandName(site.display_name);
  return (
    <span className="flex items-center gap-2.5">
      {site.logo_url ? (
        <img src={site.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar shadow-md ring-1 ring-white/10 dark:bg-accent">
          <Wrench className="h-4 w-4 text-white" aria-hidden />
        </span>
      )}
      <span className={`whitespace-nowrap font-display text-lg sm:text-xl font-bold tracking-tight ${inverted ? 'text-white' : 'text-fg'}`}>
        {first}
        {second && <span className="text-accent">{second}</span>}
      </span>
    </span>
  );
}
