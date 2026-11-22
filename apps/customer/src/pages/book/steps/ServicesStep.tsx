import { Clock, Wrench } from 'lucide-react';
import type { Loadable, Service } from '@/api/catalogue';
import { EmptyCatalogue, LoadError } from '@/components/ui';
import { SERVICE_ICON_COMPONENTS } from '@/components/serviceIcons';
import { formatMoneyWhole } from '@/lib/format';
import type { Errors, FormState } from '../model';
import { CheckBadge, ErrorText, errorProps, tileClass } from '../ui';

export function ServicesStep({
  form,
  set,
  shown,
  load,
  offered,
  hasServices,
  onToggle,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  shown: Errors;
  load: Loadable<Service[]>;
  offered: Service[];
  hasServices: boolean;
  /** Adds or removes one service (from the latest state, so quick taps are never lost). */
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {load.loading ? (
        <div aria-busy="true">
          <p className="sr-only" aria-live="polite">
            Loading services
          </p>
          <ul aria-hidden className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="glass flex h-32 animate-pulse flex-col gap-2 rounded-2xl p-4 motion-reduce:animate-none">
                <span className="h-9 w-9 rounded-xl bg-surface2" />
                <span className="h-4 w-2/3 rounded bg-surface2" />
                <span className="h-3 w-1/2 rounded bg-surface2" />
              </li>
            ))}
          </ul>
        </div>
      ) : load.error ? (
        <LoadError what="services" onRetry={load.retry} />
      ) : offered.length === 0 ? (
        <EmptyCatalogue
          Icon={Wrench}
          title="Tell us what your car needs"
          text="This workshop has not listed its services online yet. Describe the work in the notes below, or call us."
        />
      ) : (
        <div role="group" aria-label="Services" aria-describedby={shown.services ? 'services-error' : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            {offered.map((s) => {
              const on = form.services.includes(s.id);
              const Icon = SERVICE_ICON_COMPONENTS[s.icon] ?? Wrench;
              return (
                <button
                  key={s.id}
                  id={`service-${s.id}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(s.id)}
                  className={`${tileClass(on, !!shown.services)} flex flex-col p-4`}
                >
                  <span className="flex w-full items-start justify-between gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition duration-300 ${
                        on ? 'bg-accent text-accent-fg shadow-[0_8px_20px_-8px_rgb(var(--accent)/0.8)]' : 'bg-accent/10 text-accent'
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="flex items-center gap-2">
                      {s.badge && (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{s.badge}</span>
                      )}
                      <CheckBadge on={on} />
                    </span>
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-fg">{s.name}</span>
                  {s.text && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-fg3">{s.text}</span>}
                  <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs">
                    <span className="font-semibold text-fg">From {formatMoneyWhole(s.priceFrom)}</span>
                    {s.duration && (
                      <span className="inline-flex items-center gap-1 text-fg3">
                        <Clock className="h-3 w-3" aria-hidden />
                        {s.duration}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <ErrorText field="services" error={shown.services} />
        </div>
      )}

      <div>
        <label htmlFor="book-notes" className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-fg">
          Describe the issue or add notes
          {hasServices && <span className="text-xs font-normal text-fg3">Optional</span>}
        </label>
        <textarea
          id="book-notes"
          className="input min-h-28 resize-y bg-surface/60 backdrop-blur-md"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          {...(!hasServices ? errorProps(shown, 'services') : {})}
          maxLength={1000}
          placeholder="Please describe any strange noises, vibrations or specific requests..."
        />
        {!hasServices && !load.loading && <ErrorText field="services" error={shown.services} />}
      </div>
    </div>
  );
}
