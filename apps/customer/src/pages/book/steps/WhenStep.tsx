import { CalendarDays, Phone } from 'lucide-react';
import { useSite } from '@/site/SiteContext';
import { Calendar, fromIsoDate } from '../Calendar';
import { URGENCY, formatSlot, slotsFor } from '../model';
import type { Errors, FormState } from '../model';
import { ErrorText, GroupLabel, chipClass } from '../ui';

export function WhenStep({
  form,
  set,
  shown,
  dayRef,
  onPickTime,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  shown: Errors;
  dayRef: (el: HTMLButtonElement | null) => void;
  /** A time completes the step: the page may move on after a short pause. */
  onPickTime: (t: string) => void;
}) {
  const site = useSite();
  const slots = slotsFor(form.date);

  return (
    <div className="space-y-8">
      <div role="group" aria-labelledby="urgency-label">
        <GroupLabel id="urgency-label">How urgent is this?</GroupLabel>
        <div className="flex flex-wrap gap-2">
          {URGENCY.map((u) => (
            <button key={u.id} type="button" aria-pressed={form.urgency === u.id} onClick={() => set('urgency', u.id)} className={chipClass(form.urgency === u.id)}>
              {u.label}
            </button>
          ))}
        </div>
        {form.urgency === 'urgent' && (
          <p className="book-reveal mt-3 flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-xs leading-relaxed text-warn">
            <Phone className="mt-px h-4 w-4 shrink-0" aria-hidden />
            For warning lights, brake problems or anything unsafe to drive, please also call us{site.phone ? ` at ${site.phone}` : ''}.
          </p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] md:items-start">
        <div>
          <GroupLabel id="date-label">Date</GroupLabel>
          <Calendar
            value={form.date}
            onChange={(iso) => set('date', iso)}
            labelledBy="date-label"
            describedBy={shown.date ? 'date-error' : 'date-hint'}
            invalid={!!shown.date}
            dayRef={dayRef}
          />
          {shown.date ? (
            <ErrorText field="date" error={shown.date} />
          ) : (
            <p id="date-hint" className="mt-2 text-[11px] text-fg3">
              Closed Sundays. Use the arrow keys to move between days.
            </p>
          )}
        </div>

        <div role="group" aria-labelledby="time-label" aria-describedby={shown.time ? 'time-error' : undefined}>
          <GroupLabel id="time-label">
            {form.date ? `Times on ${fromIsoDate(form.date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Time'}
          </GroupLabel>
          {!form.date ? (
            <p className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-6 text-sm text-fg3">
              <CalendarDays className="h-5 w-5 shrink-0" aria-hidden />
              Pick a day to see the open times.
            </p>
          ) : slots.length === 0 ? (
            <p className="book-reveal rounded-2xl border border-line bg-surface/60 px-4 py-4 text-sm text-fg2">No times left on this day. Please pick another date.</p>
          ) : (
            <div key={form.date} className="book-reveal grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2">
              {slots.map((t, i) => {
                const on = form.time === t;
                return (
                  <button
                    key={t}
                    id={`time-slot-${i}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPickTime(t)}
                    className={`${chipClass(on, !!shown.time)} rounded-2xl py-2.5`}
                  >
                    {formatSlot(t)}
                  </button>
                );
              })}
            </div>
          )}
          <ErrorText field="time" error={shown.time} />
        </div>
      </div>
    </div>
  );
}
