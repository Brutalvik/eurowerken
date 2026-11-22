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

function startOfToday(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Closed on Sundays; no bookings in the past. */
export function isBookable(d: Date): boolean {
  return d.getDay() !== 0 && d >= startOfToday();
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_AHEAD = 3;

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Month calendar. One day button is in the tab order at a time (roving
 * focus); arrow keys move by day or week, Home and End to the week's ends,
 * Page Up and Page Down by month. Past days and Sundays are disabled.
 */
export function Calendar({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  dayRef,
}: {
  value: string;
  onChange: (iso: string) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  /** Receives the day button that is in the tab order, so the form can focus it on an error. */
  dayRef?: (el: HTMLButtonElement | null) => void;
}) {
  const today = startOfToday();
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD, 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

  const selected = value ? fromIsoDate(value) : null;
  const [focusDate, setFocusDate] = useState<Date>(() => selected ?? firstBookable(today));
  const [month, setMonth] = useState<Date>(() => new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
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
    setMonth(next);
    setFocusDate(sameMonth(next, today) ? firstBookable(today) : firstBookable(next));
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
    if (next < today) next = today;
    if (next > lastDay) next = lastDay;
    moveFocus.current = true;
    setFocusDate(next);
    if (!sameMonth(next, month)) setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  // Grid cells: leading blanks, then each day of the month.
  const lead = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
  const monthLabel = month.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  const tabbable = sameMonth(focusDate, month) ? toIsoDate(focusDate) : toIsoDate(days[0]!);

  const navBtn =
    'flex h-9 w-9 items-center justify-center rounded-lg text-fg2 transition hover:bg-surface2 hover:text-fg disabled:pointer-events-none disabled:opacity-30 coarse:h-11 coarse:w-11';

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`rounded-2xl border bg-surface/70 p-3 sm:p-4 ${invalid ? 'border-bad/60' : 'border-line'}`}
    >
      <div className="flex items-center justify-between">
        <button type="button" className={navBtn} onClick={() => showMonth(-1)} disabled={!canPrev} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-fg" aria-live="polite">
          {monthLabel}
        </p>
        <button type="button" className={navBtn} onClick={() => showMonth(1)} disabled={!canNext} aria-label="Next month">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-[11px] font-medium text-fg3">
            {w}
          </span>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const iso = toIsoDate(d);
          const bookable = isBookable(d) && d <= lastDay;
          const isSelected = value === iso;
          const isToday = iso === toIsoDate(today);
          const label = `${WEEKDAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}${
            d.getDay() === 0 ? ', closed' : !bookable ? ', unavailable' : ''
          }`;
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
              className={`mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-lg text-sm tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                isSelected
                  ? 'bg-ink font-semibold text-bg shadow-md'
                  : bookable
                    ? `text-fg hover:bg-accent/10 hover:text-accent ${isToday ? 'font-semibold text-accent' : ''}`
                    : 'cursor-not-allowed text-fg3/50'
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

function firstBookable(from: Date): Date {
  let d = from < startOfToday() ? startOfToday() : from;
  for (let i = 0; i < 14 && !isBookable(d); i++) d = addDays(d, 1);
  return d;
}

/** "Monday, October 16, 2026" for summaries. */
export function formatLongDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
