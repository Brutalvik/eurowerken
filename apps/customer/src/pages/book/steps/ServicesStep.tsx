import { Clock, MessageSquareText, Wrench } from 'lucide-react';
import type { Loadable, Service } from '@/api/catalogue';
import { EmptyCatalogue, LoadError } from '@/components/ui';
import { SERVICE_ICON_COMPONENTS } from '@/components/serviceIcons';
import { formatMoneyWhole } from '@/lib/format';
import { groupServices } from '../model';
import type { Errors, FormState } from '../model';
import { CheckMark, ErrorText, choiceClass, errorProps } from '../ui';

function ServiceCard({ s, on, invalid, onToggle }: { s: Service; on: boolean; invalid: boolean; onToggle: (id: string) => void }) {
  const Icon = SERVICE_ICON_COMPONENTS[s.icon] ?? Wrench;
  const textId = `service-${s.id}-text`;
  return (
    <label className={`${choiceClass(on, invalid)} h-full flex-col gap-3 p-4 sm:p-5`}>
      <input
        id={`service-${s.id}`}
        type="checkbox"
        className="sr-only"
        checked={on}
        onChange={() => onToggle(s.id)}
        aria-describedby={s.text ? textId : undefined}
      />
      <span className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-accent text-accent-fg' : 'bg-accent/10 text-accent'}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block font-semibold leading-snug text-fg">{s.name}</span>
          {s.badge && (
            <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{s.badge}</span>
          )}
        </span>
        <CheckMark on={on} />
      </span>
      {s.text && (
        <span id={textId} className="line-clamp-2 text-sm leading-relaxed text-fg2">
          {s.text}
        </span>
      )}
      <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line/60 pt-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-fg2">
          {s.duration && (
            <>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {s.duration}
            </>
          )}
        </span>
        <span className="font-semibold text-fg">from {formatMoneyWhole(s.priceFrom)}</span>
      </span>
    </label>
  );
}

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
  const groups = groupServices(offered);
  const notesOnly = form.services.length === 0 && !!form.notes.trim();

  return (
    <div className="space-y-8">
      {load.loading ? (
        <div aria-busy="true">
          <p className="sr-only" aria-live="polite">
            Loading services
          </p>
          <ul aria-hidden className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="glass flex h-36 animate-pulse flex-col gap-2 rounded-2xl p-4 motion-reduce:animate-none">
                <span className="h-10 w-10 rounded-xl bg-surface2" />
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
          text="This workshop has not listed its services online yet. Describe the work below, or call us."
        />
      ) : (
        <div className="space-y-7" role="group" aria-label="Services" aria-describedby={shown.services ? 'services-error' : undefined}>
          {groups.map((g) => (
            <fieldset key={g.id}>
              <legend className="mb-3 p-0 text-xs font-semibold uppercase tracking-wider text-fg3">{g.label}</legend>
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.services.map((s) => (
                  <li key={s.id}>
                    <ServiceCard s={s} on={form.services.includes(s.id)} invalid={!!shown.services} onToggle={onToggle} />
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
          <ErrorText field="services" error={shown.services} />
        </div>
      )}

      <div className="rounded-2xl border border-white/70 bg-surface/50 p-4 backdrop-blur-md sm:p-5 dark:border-white/10">
        <label htmlFor="book-notes" className="flex items-center gap-2 font-semibold text-fg">
          <MessageSquareText className="h-4 w-4 text-accent" aria-hidden />
          {hasServices ? 'Not sure? Describe the problem' : 'Describe what your car needs'}
        </label>
        <p id="notes-hint" className="mt-1 text-sm text-fg2">
          {hasServices
            ? 'Noises, warning lights, when it happens. Use this instead of, or as well as, picking a service.'
            : 'Noises, warning lights, when it happens, or the work you would like done.'}
        </p>
        <textarea
          id="book-notes"
          className="input mt-3 min-h-28 resize-y bg-surface/70 backdrop-blur-md"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          {...(!hasServices ? errorProps(shown, 'services', 'notes-hint') : { 'aria-describedby': 'notes-hint' })}
          maxLength={1000}
          placeholder="For example: a grinding noise from the front when braking"
        />
        {!hasServices && !load.loading && <ErrorText field="services" error={shown.services} />}
        {notesOnly && (
          <p className="book-reveal mt-3 inline-flex items-center gap-2 rounded-full bg-ok/10 px-3 py-1.5 text-sm font-medium text-ok">
            We will quote after inspection
          </p>
        )}
      </div>
    </div>
  );
}
