import type { CSSProperties } from 'react';
import { formatClock, formatDayKey, formatHours, formatTime, formatTimeRange, layoutDay, minutesOfDay, openPeriods, servicesLabel, vehicleLabel } from '@/api/appointments';
import type { Appointment, DayInfo, TimeWindow } from '@/api/appointments';
import { Badge } from '@/components/ui/Badge';
import { APPOINTMENT_BLOCK, APPOINTMENT_STATUS_LABEL, APPOINTMENT_TONE } from '@/lib/status';

interface CommonProps {
  tz: string;
  onOpen: (a: Appointment) => void;
}

function blockLabel(a: Appointment, tz: string): string {
  const car = vehicleLabel(a.vehicle);
  return [formatTimeRange(a, tz), a.contact_name, car, servicesLabel(a), APPOINTMENT_STATUS_LABEL[a.status]]
    .filter(Boolean)
    .join(', ');
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const suffix = h < 12 ? 'a.m.' : 'p.m.';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

function hoursOf(window: TimeWindow): number[] {
  const out: number[] = [];
  for (let m = window.start; m <= window.end; m += 60) out.push(m);
  return out;
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Shading for the parts of a day outside opening hours, the gap between two periods included (or all of it when closed). */
function ClosedShade({ info, window, ppm }: { info: DayInfo; window: TimeWindow; ppm: number }) {
  if (info.closed) {
    return <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(var(--fg3)/0.08)_0_6px,transparent_6px_12px)]" />;
  }
  // The closed stretches: before the first opening, between periods, after the last closing.
  const shaded: TimeWindow[] = [];
  let from = window.start;
  for (const p of openPeriods(info.hours)) {
    if (p.start > from) shaded.push({ start: from, end: Math.min(p.start, window.end) });
    from = Math.max(from, p.end);
  }
  if (from < window.end) shaded.push({ start: from, end: window.end });
  return (
    <>
      {shaded
        .filter((z) => z.end > z.start)
        .map((z) => (
          <div
            key={z.start}
            aria-hidden
            className="absolute inset-x-0 bg-fg3/[0.07]"
            style={{ top: (z.start - window.start) * ppm, height: (z.end - z.start) * ppm }}
          />
        ))}
    </>
  );
}

/** What a day header says besides the date: a closure, a public holiday, or a weekly closed day. */
function dayNote(info: DayInfo): { text: string; title: string } | null {
  if (info.closure) {
    const text = info.closure.reason || 'Closed';
    return { text, title: `Closed: ${text}` };
  }
  if (info.holiday) {
    const kind = info.holiday.statutory ? 'Statutory holiday' : 'Holiday, not statutory';
    return { text: info.holiday.name, title: `${kind}: ${info.holiday.name}${info.closed ? ' (closed)' : ' (open, not in closed dates)'}` };
  }
  if (info.closed) return { text: 'Closed', title: 'Closed this weekday' };
  return null;
}

function hoursText(info: DayInfo): string {
  if (info.closed || !info.hours.opens || !info.hours.closes) return 'Closed';
  return `Open ${formatHours(info.hours)}`;
}

interface SlotProps {
  /** Empty start times a click books from, per day key (only for staff who can book). */
  slots?: Map<string, string[]>;
  slotMinutes?: number;
  onSlot?: (day: string, time: string) => void;
}

/** Clickable empty slots inside opening hours; under the appointment blocks. */
function SlotButtons({ info, times, slotMinutes, window, ppm, onSlot }: { info: DayInfo; times: string[]; slotMinutes: number; window: TimeWindow; ppm: number; onSlot: (day: string, time: string) => void }) {
  return (
    <>
      {times.map((t) => {
        const m = timeToMinutes(t) ?? 0;
        if (m < window.start || m + slotMinutes > window.end) return null;
        const label = `New appointment on ${formatDayKey(info.key, 'medium')} at ${formatClock(t)}`;
        return (
          <button
            key={t}
            type="button"
            // The New appointment button is the keyboard path; these are a pointer shortcut, so they stay out of the tab order.
            tabIndex={-1}
            aria-label={label}
            title={label}
            onClick={() => onSlot(info.key, t)}
            className="absolute inset-x-0 z-[5] cursor-pointer rounded-sm transition hover:bg-accent/10 focus-visible:bg-accent/10"
            style={{ top: (m - window.start) * ppm, height: slotMinutes * ppm }}
          />
        );
      })}
    </>
  );
}

function NowLine({ nowMinutes, window, ppm, label }: { nowMinutes: number; window: TimeWindow; ppm: number; label: boolean }) {
  if (nowMinutes < window.start || nowMinutes > window.end) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (nowMinutes - window.start) * ppm }}>
      <div className="relative h-0.5 bg-bad">
        <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-bad" />
        {label && (
          <span className="absolute -top-2 right-1 rounded bg-bad px-1 text-[9px] font-semibold leading-4 text-white">Now</span>
        )}
      </div>
    </div>
  );
}

interface ColumnProps extends CommonProps, SlotProps {
  info: DayInfo;
  appts: Appointment[];
  window: TimeWindow;
  ppm: number;
  compact: boolean;
  nowMinutes: number | null;
}

function DayColumn({ info, appts, window, ppm, compact, nowMinutes, tz, onOpen, slots, slotMinutes, onSlot }: ColumnProps) {
  const height = (window.end - window.start) * ppm;
  const placed = layoutDay(appts, tz, window);
  const times = slots?.get(info.key) ?? [];
  return (
    <div className="relative min-w-0 border-l border-line" style={{ height }}>
      <ClosedShade info={info} window={window} ppm={ppm} />
      {hoursOf(window).map((m) => (
        <div key={m} aria-hidden className="absolute inset-x-0 border-t border-line/60" style={{ top: (m - window.start) * ppm }} />
      ))}
      {onSlot && slotMinutes && times.length > 0 && (
        <SlotButtons info={info} times={times} slotMinutes={slotMinutes} window={window} ppm={ppm} onSlot={onSlot} />
      )}
      {info.closed && (
        <p className="absolute inset-x-1 top-2 z-10 text-center text-[10px] font-medium text-fg3">
          {info.closure ? `Closed${info.closure.reason ? `: ${info.closure.reason}` : ''}` : 'Closed'}
        </p>
      )}
      {placed.map((p) => {
        const style: CSSProperties = {
          top: (p.start - window.start) * ppm + 1,
          height: Math.max((p.end - p.start) * ppm - 2, compact ? 20 : 24),
          left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
          width: `calc(${100 / p.lanes}% - 4px)`,
        };
        const a = p.appt;
        const car = vehicleLabel(a.vehicle);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a)}
            aria-label={blockLabel(a, tz)}
            title={blockLabel(a, tz)}
            style={style}
            className={`absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-fg transition ${APPOINTMENT_BLOCK[a.status]} ${focusRing}`}
          >
            {compact ? (
              <span className="block truncate text-[10px] leading-4">
                <span className="font-semibold">{formatTime(a.starts_at, tz)}</span> {a.contact_name}
              </span>
            ) : (
              <span className="block min-w-0 text-[11px] leading-4">
                <span className="block truncate">
                  <span className="font-semibold">{formatTimeRange(a, tz)}</span>
                  <span className="ml-1.5">{a.contact_name}</span>
                </span>
                {car && <span className="block truncate text-fg2">{car}</span>}
                {a.services.length > 0 && <span className="block truncate text-fg3">{servicesLabel(a)}</span>}
              </span>
            )}
          </button>
        );
      })}
      {nowMinutes !== null && <NowLine nowMinutes={nowMinutes} window={window} ppm={ppm} label={!compact} />}
    </div>
  );
}

function HourGutter({ window, ppm }: { window: TimeWindow; ppm: number }) {
  return (
    <div aria-hidden className="relative shrink-0" style={{ height: (window.end - window.start) * ppm }}>
      {hoursOf(window).map((m) => (
        <span key={m} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] text-fg3" style={{ top: (m - window.start) * ppm }}>
          {m === window.start ? '' : hourLabel(m)}
        </span>
      ))}
    </div>
  );
}

interface GridProps extends CommonProps, SlotProps {
  days: DayInfo[];
  byDay: Map<string, Appointment[]>;
  window: TimeWindow;
  /** Day key of today in the workshop's zone. */
  today: string;
  now: Date;
}

/** One day as a timeline from opening to closing (tablets and up). */
export function DayTimeline({ days, byDay, window, today, now, tz, onOpen, slots, slotMinutes, onSlot }: GridProps) {
  const info = days[0];
  const ppm = 1.2;
  const note = dayNote(info);
  return (
    <div className="pb-3 pr-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line px-4 py-2 text-[11px]">
        <span className="font-semibold text-fg">{hoursText(info)}</span>
        {note && (info.closure || info.holiday) && (
          <span className="min-w-0 break-words text-fg3" title={note.title}>
            {note.title}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] pt-3">
        <HourGutter window={window} ppm={ppm} />
        <DayColumn
          info={info}
          appts={byDay.get(info.key) ?? []}
          window={window}
          ppm={ppm}
          compact={false}
          nowMinutes={info.key === today ? minutesOfDay(now, tz) : null}
          tz={tz}
          onOpen={onOpen}
          slots={slots}
          slotMinutes={slotMinutes}
          onSlot={onSlot}
        />
      </div>
    </div>
  );
}

/** Seven day columns with compact blocks (tablets and up). */
export function WeekGrid({ days, byDay, window, today, now, tz, onOpen, slots, slotMinutes, onSlot }: GridProps) {
  const ppm = 0.8;
  const cols = 'grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]';
  return (
    <div className="pb-3 pr-2">
      <div className={`${cols} sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur`}>
        <span />
        {days.map((d) => {
          const note = dayNote(d);
          return (
            <div
              key={d.key}
              title={note ? `${formatDayKey(d.key, 'medium')}. ${note.title}. ${hoursText(d)}.` : `${formatDayKey(d.key, 'medium')}. ${hoursText(d)}.`}
              className={`min-w-0 border-l border-line px-1 py-2 text-center text-[11px] ${d.key === today ? 'font-semibold text-accent' : 'text-fg2'} ${d.closed ? 'bg-fg3/[0.06]' : ''}`}
            >
              <span className="block truncate">{formatDayKey(d.key, 'short')}</span>
              {note && <span className="block truncate text-[9px] font-normal text-fg3">{note.text}</span>}
              <span className="sr-only">
                {note ? `${note.title}. ` : ''}
                {hoursText(d)}
              </span>
            </div>
          );
        })}
      </div>
      <div className={`${cols} pt-2`}>
        <HourGutter window={window} ppm={ppm} />
        {days.map((d) => (
          <DayColumn
            key={d.key}
            info={d}
            appts={byDay.get(d.key) ?? []}
            window={window}
            ppm={ppm}
            compact
            nowMinutes={d.key === today ? minutesOfDay(now, tz) : null}
            tz={tz}
            onOpen={onOpen}
            slots={slots}
            slotMinutes={slotMinutes}
            onSlot={onSlot}
          />
        ))}
      </div>
    </div>
  );
}

/** Phones: a list grouped by day instead of the grid. */
export function AgendaList({ days, byDay, today, tz, onOpen }: Omit<GridProps, 'window' | 'now' | keyof SlotProps>) {
  return (
    <div className="divide-y divide-line">
      {days.map((d) => {
        const list = byDay.get(d.key) ?? [];
        const headingId = `agenda-${d.key}`;
        return (
          <section key={d.key} aria-labelledby={headingId} className="px-4 py-3">
            <h3 id={headingId} className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-fg">
              <span className={d.key === today ? 'text-accent' : ''}>
                {formatDayKey(d.key, 'medium')}
                {d.key === today && ' (today)'}
              </span>
              {d.closed && (
                <span className="text-[11px] font-normal text-fg3">
                  {d.closure ? `Closed${d.closure.reason ? `: ${d.closure.reason}` : ''}` : 'Closed'}
                </span>
              )}
              {!d.closure && d.holiday && <span className="text-[11px] font-normal text-fg3">{d.holiday.name}</span>}
            </h3>
            {list.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-fg3">No appointments.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {list.map((a) => {
                  const car = vehicleLabel(a.vehicle);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(a)}
                        aria-label={blockLabel(a, tz)}
                        className={`block w-full rounded-lg border-l-[3px] px-3 py-2.5 text-left text-xs text-fg coarse:min-h-11 ${APPOINTMENT_BLOCK[a.status]} ${focusRing}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block font-semibold">{formatTimeRange(a, tz)}</span>
                            <span className="block break-words">{a.contact_name}</span>
                          </span>
                          <Badge tone={APPOINTMENT_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                        </span>
                        {car && <span className="mt-1 block break-words text-fg2">{car}</span>}
                        {a.services.length > 0 && <span className="mt-0.5 block break-words text-[11px] text-fg3">{servicesLabel(a)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
