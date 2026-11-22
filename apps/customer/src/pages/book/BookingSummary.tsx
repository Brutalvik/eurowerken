import type { ReactNode } from 'react';
import { CalendarClock, Car, User, Wrench } from 'lucide-react';
import type { Service } from '@/api/catalogue';
import { formatMoneyWhole } from '@/lib/format';
import { formatWhen } from './model';

export interface SummaryData {
  vehicle: string;
  services: Service[];
  notes: string;
  date: string;
  /** The chosen slot's starts_at. */
  time: string;
  /** The workshop's time zone, for showing the time. */
  timeZone: string;
  expertName?: string;
  low: number;
  high: number;
}

export function estimateText(d: Pick<SummaryData, 'services' | 'low' | 'high'>): string {
  return d.services.length ? `${formatMoneyWhole(d.low)} to ${formatMoneyWhole(d.high)}` : formatMoneyWhole(0);
}

/** "2 services · est. $250 to $380", or the notes-only case. Shown in the action bar on the services step. */
export function totalText(d: SummaryData): string {
  const n = d.services.length;
  if (n === 0) return d.notes.trim() ? 'Problem described · We will quote after inspection' : 'No services yet';
  return `${n} ${n === 1 ? 'service' : 'services'} · est. ${estimateText(d)}`;
}

function Row({ Icon, label, children }: { Icon: typeof Car; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold uppercase tracking-wider text-fg3">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-fg">{children}</dd>
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="font-normal text-fg3">{children}</span>;
}

/** Desktop: a slim sticky glass card beside the step with what is chosen so far. */
export function SummaryCard({ d, className = '' }: { d: SummaryData; className?: string }) {
  return (
    <aside aria-label="Your booking so far" className={`glass-strong rounded-3xl p-5 lg:sticky lg:top-24 ${className}`}>
      <h2 className="font-display text-base font-semibold text-fg">Your booking</h2>
      <dl className="mt-4 space-y-4">
        <Row Icon={Car} label="Car">
          {d.vehicle || <Empty>Not chosen yet</Empty>}
        </Row>
        <Row Icon={Wrench} label="Services">
          {d.services.length === 0 ? (
            <Empty>{d.notes.trim() ? 'Problem described' : 'None yet'}</Empty>
          ) : (
            <ul className="space-y-1">
              {d.services.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="min-w-0">{s.name}</span>
                  <span className="shrink-0 font-normal tabular-nums text-fg3">from {formatMoneyWhole(s.priceFrom)}</span>
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row Icon={CalendarClock} label="Time">
          {d.date ? (
            <>
              {formatWhen(d.date, d.time, d.timeZone)}
              {!d.time && <span className="block font-normal text-fg3">Pick a time</span>}
            </>
          ) : (
            <Empty>Not chosen yet</Empty>
          )}
        </Row>
        <Row Icon={User} label="Technician">
          {d.expertName ?? 'Any available'}
        </Row>
      </dl>
      <div className="mt-5 border-t border-line/70 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-fg">Estimate</p>
          <p className="font-display text-lg font-bold tabular-nums text-fg">
            {d.services.length ? estimateText(d) : d.notes.trim() ? 'After inspection' : formatMoneyWhole(0)}
          </p>
        </div>
        <p className="mt-1 text-right text-xs text-fg3">Final price after inspection. Taxes extra.</p>
      </div>
    </aside>
  );
}
