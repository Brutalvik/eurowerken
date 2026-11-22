import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Local calendar date as YYYY-MM-DD (no time zone shifts). */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** How a day looks and reads: open (has free times), closed (weekday or holiday), full, or still loading. */
export type DayState = { kind: 'open' } | { kind: 'closed'; reason?: string } | { kind: 'full' } | { kind: 'loading' };

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Month calendar. One day button is in the tab order at a time (roving
 * focus); arrow keys move by day or week, Home and End to the week's ends,
 * Page Up and Page Down by month. Only days with free times can be picked.
 * The shown month is controlled, so the page can load that month's times.
 */
export function Calendar({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  dayRef,
  month,
  onMonthChange,
  minDate,
  maxDate,
  dayState,
  closedWeekdays,
}: {
  value: string;
  onChange: (iso: string) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  /** Receives the day button that is in the tab order, so the form can focus it on an error. */
  dayRef?: (el: HTMLButtonElement | null) => void;
  /** First day of the month shown. */
  month: Date;
  onMonthChange: (firstOfMonth: Date) => void;
  /** Workshop-local today and the last bookable day. */
  minDate: Date;
  maxDate: Date;
  dayState: (iso: string) => DayState;
  /** Weekdays (0 = Sunday) the workshop never opens: struck through and skipped by the initial focus. */
  closedWeekdays: ReadonlySet<number>;
}) {
  const firstMonth = startOfMonth(minDate);
  const lastMonth = startOfMonth(maxDate);

  const [focusDate, setFocusDate] = useState<Date>(() => (value ? fromIsoDate(value) : firstOpen(minDate, closedWeekdays)));
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  // After a keyboard move, put focus on the new day.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toIsoDate(focusDate)}"]`)?.focus();
  }, [focusDate, month]);

  const canPrev = month > firstMonth;
  const canNext = month < lastMonth;

  function showMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    onMonthChange(next);
    setFocusDate(firstOpen(next < minDate ? minDate : next, closedWeekdays));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    let next: Date | null = null;
    const d = focusDate;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(d, -1);
        break;
      case 'ArrowRight':
        next = addDays(d, 1);
        break;
      case 'ArrowUp':
        next = addDays(d, -7);
        break;
      case 'ArrowDown':
        next = addDays(d, 7);
        break;
      case 'Home':
        next = addDays(d, -d.getDay());
        break;
      case 'End':
        next = addDays(d, 6 - d.getDay());
        break;
      case 'PageUp':
        next = new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), 28));
        break;
      case 'PageDown':
        next = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), 28));
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next < minDate) next = minDate;
    if (next > maxDate) next = maxDate;
    moveFocus.current = true;
    setFocusDate(next);
    if (!sameMonth(next, month)) onMonthChange(startOfMonth(next));
  }

  // Grid cells: leading blanks, then each day of the month.
  const lead = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
  const monthLabel = month.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  const tabbable = sameMonth(focusDate, month) ? toIsoDate(focusDate) : toIsoDate(days[0]!);
  const minIso = toIsoDate(minDate);
  const maxIso = toIsoDate(maxDate);
  const loading = days.some((d) => {
    const iso = toIsoDate(d);
    return iso >= minIso && iso <= maxIso && dayState(iso).kind === 'loading';
  });

  const navBtn =
    'flex h-11 w-11 items-center justify-center rounded-lg text-fg2 transition hover:bg-surface2 hover:text-fg disabled:pointer-events-none disabled:opacity-30';

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`rounded-2xl border bg-surface/70 p-2 sm:p-4 ${invalid ? 'border-bad/60' : 'border-line'}`}
    >
      <div className="flex items-center justify-between">
        <button type="button" className={navBtn} onClick={() => showMonth(-1)} disabled={!canPrev} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-fg" aria-live="polite">
          {monthLabel}
          {loading && <span className="sr-only">, loading open days</span>}
        </p>
        <button type="button" className={navBtn} onClick={() => showMonth(1)} disabled={!canNext} aria-label="Next month">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center sm:gap-1" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={`py-1 text-[11px] font-medium ${closedWeekdays.has(i) ? 'text-fg3/60' : 'text-fg3'}`}>
            {w}
          </span>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7 sm:gap-1" aria-busy={loading || undefined}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const iso = toIsoDate(d);
          const inRange = iso >= minIso && iso <= maxIso;
          const state: DayState = inRange ? dayState(iso) : { kind: 'full' };
          const bookable = state.kind === 'open';
          const struck = state.kind === 'closed';
          const isSelected = value === iso;
          const isToday = iso === minIso;
          const suffix =
            state.kind === 'closed'
              ? `, closed${state.reason ? ` (${state.reason})` : ''}`
              : state.kind === 'loading'
                ? ', loading'
                : state.kind === 'full'
                  ? inRange
                    ? ', no free times'
                    : ', unavailable'
                  : '';
          const label = `${WEEKDAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}${suffix}`;
          return (
            <button
              key={iso}
              ref={iso === tabbable ? dayRef : undefined}
              type="button"
              data-date={iso}
              tabIndex={iso === tabbable ? 0 : -1}
              aria-label={label}
              aria-pressed={isSelected}
              aria-disabled={!bookable || undefined}
              aria-current={isToday ? 'date' : undefined}
              onFocus={() => setFocusDate(d)}
              onClick={() => {
                if (!bookable) return;
                setFocusDate(d);
                onChange(iso);
              }}
              onKeyDown={onKeyDown}
              className={`mx-auto flex h-11 w-full max-w-12 items-center justify-center rounded-lg text-sm tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                isSelected && bookable
                  ? 'bg-accent font-semibold text-accent-fg shadow-md'
                  : bookable
                    ? `bg-surface/60 text-fg hover:bg-accent/10 hover:text-accent ${isToday ? 'font-semibold text-accent ring-1 ring-inset ring-accent/40' : ''}`
                    : state.kind === 'loading'
                      ? 'cursor-wait animate-pulse bg-surface2/60 text-fg3 motion-reduce:animate-none'
                      : `cursor-not-allowed text-fg3/45 ${struck ? 'line-through' : ''} ${isSelected ? 'ring-1 ring-inset ring-bad/50' : ''}`
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The first day on or after `from` that is not a closed weekday (within two weeks). */
function firstOpen(from: Date, closedWeekdays: ReadonlySet<number>): Date {
  let d = from;
  for (let i = 0; i < 14 && closedWeekdays.has(d.getDay()); i++) d = addDays(d, 1);
  return d;
}

/** "Monday, October 16, 2026" for summaries. */
export function formatLongDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
