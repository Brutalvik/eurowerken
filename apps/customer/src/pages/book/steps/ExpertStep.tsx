import { User, Users } from 'lucide-react';
import type { Loadable, Technician } from '@/api/catalogue';
import { Photo } from '@/components/Photo';
import type { FormState } from '../model';
import { CheckBadge, tileClass } from '../ui';

export function ExpertStep({
  form,
  load,
  experts,
  onPick,
}: {
  form: FormState;
  load: Loadable<Technician[]>;
  experts: Technician[];
  /** One choice completes the step: the page may move on after a short pause. */
  onPick: (id: string) => void;
}) {
  const anyOn = !form.expert;
  return (
    <div role="group" aria-label="Preferred expert" aria-busy={load.loading || undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" aria-pressed={anyOn} onClick={() => onPick('')} className={`${tileClass(anyOn)} flex items-center gap-4 p-4`}>
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition ${anyOn ? 'bg-accent text-accent-fg' : 'bg-accent/10 text-accent'}`}
          >
            <Users className="h-6 w-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">Any available expert</span>
            <span className="block text-xs text-fg3">Usually the earliest time</span>
          </span>
          <CheckBadge on={anyOn} />
        </button>

        {load.loading
          ? [0, 1, 2].map((i) => <span key={i} aria-hidden className="glass h-[5.5rem] animate-pulse rounded-2xl motion-reduce:animate-none" />)
          : experts.map((t) => {
              const on = form.expert === t.id;
              return (
                <button key={t.id} type="button" aria-pressed={on} onClick={() => onPick(t.id)} className={`${tileClass(on)} flex items-center gap-4 p-4`}>
                  <span
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 transition ${on ? 'ring-accent' : 'ring-white/70 dark:ring-white/10'}`}
                  >
                    <Photo src={t.image} alt="" icon={User} className="h-full w-full" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{t.name}</span>
                    <span className="block truncate text-xs text-fg2">{t.role}</span>
                    {t.specialties.length > 0 && <span className="mt-0.5 block truncate text-[11px] text-fg3">{t.specialties.slice(0, 2).join(', ')}</span>}
                  </span>
                  <CheckBadge on={on} />
                </button>
              );
            })}
      </div>
      {load.loading && (
        <p className="sr-only" aria-live="polite">
          Loading experts
        </p>
      )}
      {!load.loading && (load.error || experts.length === 0) && (
        <p className="mt-4 text-sm text-fg3">
          {load.error ? 'The team could not be loaded. ' : ''}The workshop will assign the best available expert for your car.
        </p>
      )}
    </div>
  );
}
