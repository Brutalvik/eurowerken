import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarClock, Car, ChevronDown, User, Wrench } from 'lucide-react';
import type { Service } from '@/api/catalogue';
import { formatMoneyWhole } from '@/lib/format';
import { formatLongDate } from './Calendar';
import { formatSlot, priceRange } from './model';

export interface SummaryData {
  vehicle: string;
  services: Service[];
  notes: string;
  date: string;
  time: string;
  expertName?: string;
  low: number;
  high: number;
}

export function estimateText(d: Pick<SummaryData, 'services' | 'low' | 'high'>): string {
  return d.services.length ? `${formatMoneyWhole(d.low)} to ${formatMoneyWhole(d.high)}` : formatMoneyWhole(0);
}

/** "3 services · $380 to $560" */
export function pillText(d: SummaryData): string {
  const n = d.services.length;
  if (n === 0) return d.vehicle ? `${d.vehicle} · no services yet` : 'No services selected yet';
  return `${n} ${n === 1 ? 'service' : 'services'} · ${estimateText(d)}`;
}

function Row({ Icon, label, children }: { Icon: typeof Car; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg3">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-fg">{children}</dd>
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="font-normal text-fg3">{children}</span>;
}

function SummaryBody({ d }: { d: SummaryData }) {
  return (
    <>
      <dl className="space-y-4">
        <Row Icon={Car} label="Vehicle">
          {d.vehicle || <Empty>Not selected yet</Empty>}
        </Row>
        <Row Icon={Wrench} label="Services">
          {d.services.length === 0 ? (
            <Empty>{d.notes.trim() ? 'As described in your notes' : 'None selected yet'}</Empty>
          ) : (
            <ul className="space-y-1">
              {d.services.map((s) => {
                const [sl, sh] = priceRange(s);
                return (
                  <li key={s.id} className="book-reveal flex justify-between gap-3 font-normal">
                    <span className="min-w-0 text-fg">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-fg3">
                      {formatMoneyWhole(sl)} to {formatMoneyWhole(sh)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Row>
        <Row Icon={CalendarClock} label="Date and time">
          {d.date ? (
            <>
              {formatLongDate(d.date)}
              <span className="block font-normal text-fg2">{d.time ? formatSlot(d.time) : 'Choose a time'}</span>
            </>
          ) : (
            <Empty>Not chosen yet</Empty>
          )}
        </Row>
        <Row Icon={User} label="Expert">
          {d.expertName ?? 'Any available'}
        </Row>
      </dl>
      <div className="mt-5 border-t border-line/70 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-fg">Estimated total</p>
          <p className="font-display text-xl font-bold tabular-nums text-fg">{estimateText(d)}</p>
        </div>
        <p className="mt-1 text-right text-[11px] text-fg3">Final price determined after inspection. Taxes extra.</p>
      </div>
    </>
  );
}

/** Desktop: a frosted card beside the step. */
export function SummaryCard({ d, className = '' }: { d: SummaryData; className?: string }) {
  return (
    <aside aria-label="Appointment summary" className={`glass-strong book-sheen rounded-3xl p-6 lg:sticky lg:top-24 ${className}`}>
      <h2 className="font-display text-lg font-semibold text-fg">Your appointment</h2>
      <p className="sr-only" aria-live="polite">
        Estimated total {estimateText(d)}
      </p>
      <div className="mt-5">
        <SummaryBody d={d} />
      </div>
    </aside>
  );
}

/** Phones and tablets: a glass pill with the running estimate that opens into the full summary. */
export function SummaryPill({ d, className = '' }: { d: SummaryData; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section aria-label="Appointment summary" className={`glass-strong book-sheen overflow-hidden rounded-3xl transition-[border-radius] ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent coarse:min-h-12"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
          <Wrench className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-fg3">Your appointment</span>
          <span className="block truncate text-sm font-semibold tabular-nums text-fg" aria-live="polite">
            {pillText(d)}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-fg2 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="book-reveal border-t border-line/70 px-4 pb-5 pt-4">
          <SummaryBody d={d} />
        </div>
      )}
    </section>
  );
}
