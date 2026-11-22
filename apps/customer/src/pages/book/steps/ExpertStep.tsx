import { ChevronDown, User, Users } from 'lucide-react';
import type { Loadable, Technician } from '@/api/catalogue';
import { Photo } from '@/components/Photo';
import type { FormState } from '../model';
import { CheckMark, choiceClass } from '../ui';

/**
 * "Any preferred technician?": a collapsible section inside the When step.
 * Closed, it shows the current choice ("Any available" by default).
 */
export function TechnicianSection({
  form,
  load,
  experts,
  open,
  onOpenChange,
  onPick,
}: {
  form: FormState;
  load: Loadable<Technician[]>;
  experts: Technician[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string) => void;
}) {
  const anyOn = !form.expert;
  const chosen = experts.find((t) => t.id === form.expert);
  const panelId = 'book-tech-panel';

  return (
    <section aria-labelledby="book-tech-title" className="rounded-2xl border border-white/70 bg-surface/50 backdrop-blur-md dark:border-white/10">
      <h3 id="book-tech-title" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => onOpenChange(!open)}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <User className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">Choose a technician (optional)</span>
            <span className="block truncate text-sm text-fg2">{chosen ? chosen.name : 'Any available'}</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-fg2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>

      {open && (
        <div id={panelId} className="book-reveal border-t border-line/60 p-4 sm:p-5">
          <fieldset aria-busy={load.loading || undefined}>
            <legend className="mb-3 p-0 text-sm text-fg2">Any preferred technician? Leave it on Any available for the earliest time.</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${choiceClass(anyOn)} items-center gap-3 p-3.5`}>
                <input type="radio" name="book-tech" className="sr-only" checked={anyOn} onChange={() => onPick('')} />
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${anyOn ? 'bg-accent text-accent-fg' : 'bg-accent/10 text-accent'}`}>
                  <Users className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">Any available</span>
                  <span className="block text-xs text-fg2">Usually the earliest time</span>
                </span>
                <CheckMark on={anyOn} radio />
              </label>

              {load.loading
                ? [0, 1].map((i) => <span key={i} aria-hidden className="glass h-[4.5rem] animate-pulse rounded-2xl motion-reduce:animate-none" />)
                : experts.map((t) => {
                    const on = form.expert === t.id;
                    return (
                      <label key={t.id} className={`${choiceClass(on)} items-center gap-3 p-3.5`}>
                        <input type="radio" name="book-tech" className="sr-only" checked={on} onChange={() => onPick(t.id)} />
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-line">
                          <Photo src={t.image} alt="" icon={User} className="h-full w-full" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">{t.name}</span>
                          <span className="block truncate text-xs text-fg2">
                            {[t.role, ...t.specialties.slice(0, 1)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <CheckMark on={on} radio />
                      </label>
                    );
                  })}
            </div>
            {load.loading && (
              <p className="sr-only" aria-live="polite">
                Loading technicians
              </p>
            )}
            {!load.loading && (load.error || experts.length === 0) && (
              <p className="mt-3 text-sm text-fg3">
                {load.error ? 'The team could not be loaded. ' : ''}The workshop will assign the best available technician for your car.
              </p>
            )}
          </fieldset>
        </div>
      )}
    </section>
  );
}
