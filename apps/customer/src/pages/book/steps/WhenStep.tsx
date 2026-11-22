import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CalendarCheck, CalendarDays, Check, Globe, Phone, RotateCcw } from 'lucide-react';
import { browserZoneDiffers, formatZonedTime, hoursSummary, timeZoneName, todayIn, useAvailability, useBookingSettings } from '@/api/booking';
import type { BookingSetup } from '@/api/booking';
import { useSite } from '@/site/SiteContext';
import { Calendar, fromIsoDate, startOfMonth, toIsoDate } from '../Calendar';
import type { DayState } from '../Calendar';
import { URGENCY, formatWhen, groupSlots } from '../model';
import type { Errors, FormState } from '../model';
import { CheckMark, ErrorText, GroupLabel, choiceClass } from '../ui';

/** First and last day of the month holding `d`, as YYYY-MM-DD. */
function monthRange(d: Date): [string, string] {
  return [toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)), toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}

export function WhenStep({
  form,
  set,
  shown,
  dayRef,
  onPickDate,
  onPickTime,
  technician,
  notice,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  shown: Errors;
  dayRef: (el: HTMLButtonElement | null) => void;
  onPickDate: (iso: string) => void;
  /** Receives the slot's exact starts_at. */
  onPickTime: (startsAt: string) => void;
  /** The collapsible "Choose a technician (optional)" section. */
  technician: ReactNode;
  /** Shown as an alert above the calendar, for example when the chosen time was taken. */
  notice?: string | null;
}) {
  const site = useSite();
  const setup = useBookingSettings();

  return (
    <div className="space-y-8">
      <fieldset>
        <GroupLabel as="legend">How urgent is it?</GroupLabel>
        <div className="grid gap-3 sm:grid-cols-3">
          {URGENCY.map((u) => {
            const on = form.urgency === u.id;
            return (
              <label key={u.id} className={`${choiceClass(on)} items-start gap-3 p-3.5`}>
                <input type="radio" name="book-urgency" className="sr-only" checked={on} onChange={() => set('urgency', u.id)} aria-describedby={`urgency-${u.id}-hint`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{u.label}</span>
                  <span id={`urgency-${u.id}-hint`} className="mt-0.5 block text-xs leading-relaxed text-fg2">
                    {u.hint}
                  </span>
                </span>
                <CheckMark on={on} radio />
              </label>
            );
          })}
        </div>
        {form.urgency === 'urgent' && (
          <p className="book-reveal mt-3 flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-sm leading-relaxed text-warn">
            <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            For warning lights, brake problems or anything unsafe to drive, please also call us{site.phone ? ` at ${site.phone}` : ''}.
          </p>
        )}
      </fieldset>

      {notice && (
        <p role="alert" className="book-reveal flex items-start gap-2 rounded-2xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm font-medium leading-relaxed text-bad">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {notice}
        </p>
      )}

      {setup.data ? (
        <DayAndTime setup={setup.data} form={form} set={set} shown={shown} dayRef={dayRef} onPickDate={onPickDate} onPickTime={onPickTime} />
      ) : setup.error ? (
        <LoadProblem what="the opening hours" onRetry={setup.retry} />
      ) : (
        <DayAndTimeSkeleton />
      )}

      {form.date && form.time && setup.data && (
        <p className="book-reveal flex items-center gap-3 rounded-2xl border border-ok/25 bg-ok/10 px-4 py-3 text-ok">
          <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden />
          <span className="font-semibold">{formatWhen(form.date, form.time, setup.data.settings.time_zone)}</span>
        </p>
      )}

      {technician}
    </div>
  );
}

function LoadProblem({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/30 bg-bad/5 px-4 py-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-fg">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
        We could not load {what}.
      </p>
      <p className="mt-1 text-sm text-fg2">Check your connection and try again. If it keeps happening, please call the workshop.</p>
      <button type="button" onClick={onRetry} className="btn-outline mt-3 min-h-11">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Retry
      </button>
    </div>
  );
}

function TimesSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="h-3 w-20 animate-pulse rounded bg-surface2 motion-reduce:animate-none" />
      <div className="grid grid-cols-3 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-2xl bg-surface2/80 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

function DayAndTimeSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-start">
      <p role="status" className="sr-only">
        Loading open days and times
      </p>
      <div aria-hidden className="h-80 animate-pulse rounded-2xl border border-line bg-surface/60 motion-reduce:animate-none" />
      <TimesSkeleton />
    </div>
  );
}

function DayAndTime({
  setup,
  form,
  set,
  shown,
  dayRef,
  onPickDate,
  onPickTime,
}: {
  setup: BookingSetup;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  shown: Errors;
  dayRef: (el: HTMLButtonElement | null) => void;
  onPickDate: (iso: string) => void;
  onPickTime: (startsAt: string) => void;
}) {
  const tz = setup.settings.time_zone;
  const minDate = fromIsoDate(todayIn(tz));
  const maxDate = fromIsoDate(todayIn(tz, setup.settings.max_days_ahead));
  const closedWeekdays = useMemo(() => new Set(setup.hours.filter((h) => h.closed).map((h) => h.weekday)), [setup.hours]);
  const closures = useMemo(() => new Map(setup.closures.map((c) => [c.day, c.reason ?? ''])), [setup.closures]);

  const [wanted, setWanted] = useState<Date>(() => startOfMonth(form.date ? fromIsoDate(form.date) : minDate));
  const month = wanted < startOfMonth(minDate) ? startOfMonth(minDate) : wanted > startOfMonth(maxDate) ? startOfMonth(maxDate) : wanted;
  const [from, to] = monthRange(month);
  const visible = useAvailability(from, to, tz);
  const [selFrom, selTo] = form.date ? monthRange(fromIsoDate(form.date)) : [null, null];
  const selected = useAvailability(selFrom, selTo, tz);

  const daySlots = form.date ? (selected.byDay.get(form.date) ?? []) : [];
  const groups = groupSlots(daySlots, tz);

  // A saved or earlier choice that is no longer free is cleared once the day's times are known.
  useEffect(() => {
    if (!form.time || !selected.data) return;
    if (!daySlots.some((s) => s.starts_at === form.time)) set('time', '');
  }, [form.time, selected.data, daySlots, set]);

  function dayState(iso: string): DayState {
    if (closures.has(iso)) return { kind: 'closed', reason: closures.get(iso) || undefined };
    if (closedWeekdays.has(fromIsoDate(iso).getDay())) return { kind: 'closed' };
    if (visible.loading) return { kind: 'loading' };
    return visible.byDay.has(iso) ? { kind: 'open' } : { kind: 'full' };
  }

  const showZoneNote = browserZoneDiffers(tz);
  let slotIndex = 0;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-start">
      <div className="min-w-0">
        <GroupLabel id="date-label">Day</GroupLabel>
        <div className="-mx-2 sm:mx-0">
          <Calendar
            value={form.date}
            onChange={onPickDate}
            labelledBy="date-label"
            describedBy={shown.date ? 'date-error date-hint' : 'date-hint'}
            invalid={!!shown.date}
            dayRef={dayRef}
            month={month}
            onMonthChange={setWanted}
            minDate={minDate}
            maxDate={maxDate}
            dayState={dayState}
            closedWeekdays={closedWeekdays}
          />
        </div>
        <ErrorText field="date" error={shown.date} />
        {visible.error && (
          <div className="mt-3">
            <LoadProblem what="the open times for this month" onRetry={visible.refresh} />
          </div>
        )}
        <p id="date-hint" className="mt-2 text-xs text-fg3">
          {hoursSummary(setup.hours)} Arrow keys move between days.
        </p>
      </div>

      <fieldset className="min-w-0" aria-describedby={shown.time ? 'time-error' : undefined} aria-busy={selected.loading || undefined}>
        <GroupLabel as="legend">
          {form.date ? `Times on ${fromIsoDate(form.date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}` : 'Time'}
        </GroupLabel>
        {showZoneNote && (
          <p className="-mt-1 mb-3 flex items-start gap-1.5 text-xs text-fg3">
            <Globe className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            Times shown in the workshop&apos;s time zone ({timeZoneName(tz)})
          </p>
        )}
        {!form.date ? (
          <p className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-6 text-sm text-fg2">
            <CalendarDays className="h-5 w-5 shrink-0 text-fg3" aria-hidden />
            Pick a day to see the open times.
          </p>
        ) : selected.loading ? (
          <>
            <p role="status" className="sr-only">
              Loading times
            </p>
            <TimesSkeleton />
          </>
        ) : selected.error ? (
          <LoadProblem what="the times for this day" onRetry={selected.refresh} />
        ) : groups.length === 0 ? (
          <p className="book-reveal rounded-2xl border border-line bg-surface/60 px-4 py-4 text-sm text-fg2">No times left on this day. Please pick another day.</p>
        ) : (
          <div key={form.date} className="book-reveal space-y-4">
            {groups.map((g) => (
              <div key={g.label} role="group" aria-labelledby={`slots-${g.label}`}>
                <p id={`slots-${g.label}`} className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg3">
                  {g.label}
                </p>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {g.slots.map((slot) => {
                    const on = form.time === slot.starts_at;
                    const id = `time-slot-${slotIndex++}`;
                    return (
                      <label
                        key={slot.starts_at}
                        className={`${choiceClass(on, !!shown.time)} min-h-11 items-center justify-center whitespace-nowrap px-2 py-2.5 text-sm tabular-nums ${on ? 'font-semibold text-fg' : 'font-medium text-fg2'}`}
                      >
                        <input id={id} type="radio" name="book-time" className="sr-only" checked={on} onChange={() => onPickTime(slot.starts_at)} />
                        {on && <Check className="mr-1 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={3} aria-hidden />}
                        {formatZonedTime(slot.starts_at, tz)}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <ErrorText field="time" error={shown.time} />
      </fieldset>
    </div>
  );
}
