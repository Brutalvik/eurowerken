import { Check } from 'lucide-react';
import { STEPS } from './model';

const N = STEPS.length;

/**
 * The booking stepper: the four step names with numbers, check marks for
 * completed steps and a calm pill that slides to the current one. Completed
 * steps (and steps already reached) are buttons. On phones: "Step 2 of 4 ·
 * What does it need?" with a thin progress bar.
 */
export function Stepper({ current, canVisit, onSelect }: { current: number; canVisit: (i: number) => boolean; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Booking progress" className="glass rounded-2xl p-1.5">
      {/* Phones */}
      <div className="px-2.5 py-2 sm:hidden">
        <p className="text-sm font-medium text-fg2">
          Step {current + 1} of {N} <span aria-hidden>·</span> <span className="font-semibold text-fg">{STEPS[current]?.label}</span>
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-fg/10" aria-hidden>
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${((current + 1) / N) * 100}%` }}
          />
        </div>
      </div>

      {/* Tablets and desktops */}
      <ol className="relative hidden grid-cols-4 sm:grid">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-xl bg-surface/90 shadow-[0_2px_10px_rgb(var(--ink)/0.08)] ring-1 ring-accent/40 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-white/10"
          style={{ width: `${100 / N}%`, transform: `translateX(${current * 100}%)` }}
        />
        {STEPS.map((s, i) => {
          const isCurrent = i === current;
          const done = i < current;
          const visitable = !isCurrent && canVisit(i);
          const status = isCurrent ? '' : done ? ', completed' : visitable ? '' : ', not started yet';
          const inner = (
            <>
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors ${
                  isCurrent ? 'bg-accent text-accent-fg' : done ? 'bg-ok/15 text-ok' : 'border border-line bg-surface/70 text-fg3'
                }`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={`min-w-0 text-left text-sm leading-tight ${isCurrent ? 'font-semibold text-fg' : done ? 'font-medium text-fg2' : 'text-fg3'}`}>
                <span className="sr-only">Step {i + 1}: </span>
                {s.label}
                <span className="sr-only">{status}</span>
              </span>
            </>
          );
          return (
            <li key={s.id} aria-current={isCurrent ? 'step' : undefined} className="relative min-w-0">
              {visitable ? (
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-2 outline-none transition hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {inner}
                </button>
              ) : (
                <span className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
