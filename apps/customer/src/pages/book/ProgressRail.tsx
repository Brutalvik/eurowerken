import { useState } from 'react';
import { Check } from 'lucide-react';
import { STEPS } from './model';

const N = STEPS.length;
/** Centre of step i on the rail, as a percentage of its width. */
const centre = (i: number) => ((i + 0.5) / N) * 100;

/**
 * Glass progress rail: a list of step dots with a liquid bead that slides to
 * the current step. The bead's leading edge moves first and the trailing edge
 * follows, so it stretches between steps; a gooey SVG filter (blur, then an
 * alpha threshold) melts it into the filled track and the completed dots.
 *
 * canVisit(i): completed steps (and steps already reached) can be clicked.
 */
export function ProgressRail({ current, canVisit, onSelect }: { current: number; canVisit: (i: number) => boolean; onSelect: (i: number) => void }) {
  // Direction of the last move, worked out during render so the first frame already uses it.
  const [last, setLast] = useState(current);
  const [forward, setForward] = useState(true);
  if (current !== last) {
    setForward(current > last);
    setLast(current);
  }

  const c = centre(current);
  const half = 20; // px, half the bead width
  // Leading edge first, trailing edge 140 ms later: the bead stretches, then settles.
  const beadDelay = forward ? '140ms, 0ms' : '0ms, 140ms';

  return (
    <nav aria-label="Booking steps" className="glass-strong book-sheen rounded-3xl px-2 py-3 sm:px-4">
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <filter id="book-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="relative">
        {/* Track and liquid layer (decorative). */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-11">
          <span
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-fg/10"
            style={{ left: `${centre(0)}%`, right: `${100 - centre(N - 1)}%` }}
          />
          <div className="absolute inset-0" style={{ filter: 'url(#book-goo)' }}>
            <span
              className="book-bead absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${centre(0)}%`, right: `${100 - c}%`, transitionDelay: forward ? '0ms, 0ms' : '0ms, 140ms' }}
            />
            {STEPS.map((s, i) =>
              i < current ? (
                <span
                  key={s.id}
                  className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                  style={{ left: `${centre(i)}%` }}
                />
              ) : null,
            )}
            <span
              className="book-bead absolute top-1/2 h-8 -translate-y-1/2 rounded-full bg-accent shadow-[0_6px_18px_rgb(var(--accent)/0.45)]"
              style={{ left: `calc(${c}% - ${half}px)`, right: `calc(${100 - c}% - ${half}px)`, transitionDelay: beadDelay }}
            />
          </div>
        </div>

        <ol className="relative grid grid-cols-6">
          {STEPS.map((s, i) => {
            const isCurrent = i === current;
            const done = i < current;
            const visitable = !isCurrent && canVisit(i);
            const dot = (
              <span
                aria-hidden
                className={`flex h-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition-colors duration-300 ${
                  isCurrent
                    ? 'w-10 text-accent-fg'
                    : done
                      ? 'w-6 text-accent-fg'
                      : 'w-6 border border-line bg-surface/80 text-fg3'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
            );
            const label = (
              <span
                aria-hidden
                className={`mt-1 hidden text-center text-xs font-medium md:block ${isCurrent ? 'text-fg' : done ? 'text-fg2' : 'text-fg3'}`}
              >
                {s.label}
              </span>
            );
            const status = isCurrent ? ', current step' : done ? ', completed' : visitable ? '' : ', not started';
            return (
              <li key={s.id} aria-current={isCurrent ? 'step' : undefined} className="flex min-w-0 justify-center">
                {visitable ? (
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className="group flex min-w-11 flex-col items-center rounded-2xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="flex h-11 items-center transition group-hover:scale-110 motion-reduce:transform-none">{dot}</span>
                    {label}
                    <span className="sr-only">
                      {s.label}
                      {status}. Go to this step.
                    </span>
                  </button>
                ) : (
                  <span className="flex min-w-11 flex-col items-center px-1">
                    <span className="flex h-11 items-center">{dot}</span>
                    {label}
                    <span className="sr-only">
                      {s.label}
                      {status}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-1 text-center text-xs font-medium text-fg2 md:hidden" aria-hidden>
        Step {current + 1} of {N}
        <span className="text-fg3"> · {STEPS[current]?.label}</span>
      </p>
    </nav>
  );
}
