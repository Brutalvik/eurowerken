import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  DURATION_OPTIONS,
  checkTime,
  errorMessage,
  formatDuration,
  formatTime,
  isDayKey,
  isTimeText,
  suggestFreeTimes,
  timeInputOf,
  zonedToUtc,
} from '@/api/appointments';
import type { BookingContext, FreeTime, SiteSlug } from '@/api/appointments';
import { Labeled, inputClass } from '../inventory/PartForm';

interface TimeFieldsProps {
  workshopId: string;
  ctx: BookingContext;
  site: SiteSlug | null;
  /** The booking being moved, so it does not count against itself. */
  excludeId: string | null;
  day: string;
  time: string;
  duration: string;
  onChange: (patch: { day?: string; time?: string; duration?: string; durationEdited?: boolean }) => void;
  /** Reports the current warnings, so the parent can word its save button. */
  onWarnings?: (warnings: string[]) => void;
  disabled?: boolean;
}

/**
 * Date, start time and duration, with free times from the public
 * availability (when the website is published) and warnings for times
 * outside hours or beyond the bays. Staff may pick any time.
 */
export function TimeFields({ workshopId, ctx, site, excludeId, day, time, duration, onChange, onWarnings, disabled = false }: TimeFieldsProps) {
  const id = useId();
  const tz = ctx.settings.time_zone;
  const [free, setFree] = useState<FreeTime[] | null>(null);
  const [freeError, setFreeError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const slug = site?.published ? site.slug : null;
  // Held in a ref so a new callback from the parent does not re-run the check.
  const report = useRef(onWarnings);
  report.current = onWarnings;

  // Free times for the chosen day.
  useEffect(() => {
    if (!slug || !isDayKey(day)) {
      setFree(null);
      return;
    }
    let live = true;
    setFree(null);
    setFreeError(null);
    suggestFreeTimes(slug, day)
      .then((list) => live && setFree(list))
      .catch((err) => live && setFreeError(errorMessage(err, 'Free times could not be loaded.')));
    return () => {
      live = false;
    };
  }, [slug, day]);

  // Warnings for the chosen time, a moment after the last change.
  useEffect(() => {
    const minutes = Number(duration);
    if (!isDayKey(day) || !isTimeText(time) || !Number.isFinite(minutes)) {
      setWarnings([]);
      report.current?.([]);
      return;
    }
    let live = true;
    setChecking(true);
    const timer = window.setTimeout(() => {
      checkTime({ workshopId, startsAt: zonedToUtc(day, time, tz), durationMinutes: minutes, excludeId, ctx })
        .then((list) => {
          if (!live) return;
          setWarnings(list);
          report.current?.(list);
        })
        .catch(() => {
          if (!live) return;
          setWarnings([]);
          report.current?.([]);
        })
        .finally(() => live && setChecking(false));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [workshopId, day, time, duration, excludeId, ctx, tz]);

  const minutes = Number(duration);
  const options = DURATION_OPTIONS.includes(minutes) || !Number.isFinite(minutes) ? DURATION_OPTIONS : [...DURATION_OPTIONS, minutes].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled id={`${id}-day`} label="Date">
          <input
            id={`${id}-day`}
            type="date"
            value={day}
            disabled={disabled}
            onChange={(e) => onChange({ day: e.target.value })}
            className={inputClass}
          />
        </Labeled>
        <Labeled id={`${id}-time`} label="Start time" hint={`Workshop time (${tz})`}>
          <input
            id={`${id}-time`}
            type="time"
            step={300}
            value={time}
            disabled={disabled}
            onChange={(e) => onChange({ time: e.target.value })}
            className={inputClass}
          />
        </Labeled>
        <Labeled id={`${id}-duration`} label="Duration">
          <select
            id={`${id}-duration`}
            value={duration}
            disabled={disabled}
            onChange={(e) => onChange({ duration: e.target.value, durationEdited: true })}
            className={inputClass}
          >
            {options.map((m) => (
              <option key={m} value={String(m)}>
                {formatDuration(m)}
              </option>
            ))}
          </select>
        </Labeled>
      </div>

      <div>
        <p id={`${id}-free`} className="mb-1.5 text-xs font-medium text-fg2">
          Free times that day
        </p>
        {!slug ? (
          <p className="text-[11px] text-fg3">
            Suggestions appear once the customer website is published. You can still enter any time.
          </p>
        ) : freeError ? (
          <p className="text-[11px] text-bad">{freeError}</p>
        ) : free === null ? (
          <p className="text-[11px] text-fg3" role="status">
            Looking for free times...
          </p>
        ) : free.length === 0 ? (
          <p className="text-[11px] text-fg3">No free times that day (closed, fully booked or too soon). You can still enter a time.</p>
        ) : (
          <div role="group" aria-labelledby={`${id}-free`} className="flex flex-wrap gap-1.5">
            {free.map((f) => {
              const value = timeInputOf(f.starts_at, tz);
              const active = value === time;
              return (
                <button
                  key={f.starts_at}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => onChange({ time: value })}
                  title={`${f.remaining} ${f.remaining === 1 ? 'bay' : 'bays'} free`}
                  className={`rounded-lg px-2.5 py-1 text-[11px] transition coarse:min-h-11 coarse:px-3 ${
                    active ? 'bg-accent font-semibold text-white' : 'border border-line bg-surface2 text-fg2 hover:text-fg'
                  }`}
                >
                  {formatTime(f.starts_at, tz)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div aria-live="polite">
        {warnings.length > 0 && !checking && (
          <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
            <ul className="space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              <li className="text-fg2">Staff can still book this time.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
