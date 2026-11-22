import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Car, Pencil, User, Wrench } from 'lucide-react';
import { sitePath, useSite } from '@/site/SiteContext';
import { URGENCY, formatWhen } from '../model';
import type { FormState } from '../model';
import { estimateText } from '../BookingSummary';
import type { SummaryData } from '../BookingSummary';

/** Where an Edit link in the check panel goes. */
export type EditTarget = 'vehicle' | 'services' | 'when' | 'technician';

function Row({ Icon, label, target, onEdit, children }: { Icon: typeof Car; label: string; target: EditTarget; onEdit: (t: EditTarget) => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold uppercase tracking-wider text-fg3">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
      </div>
      <button
        type="button"
        onClick={() => onEdit(target)}
        className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}

/** Step 4: the compact "Check your booking" panel, each group with an Edit link that returns here. */
export function CheckBooking({ form, d, onEdit }: { form: FormState; d: SummaryData; onEdit: (t: EditTarget) => void }) {
  const urgency = URGENCY.find((u) => u.id === form.urgency)?.label ?? 'Routine';
  return (
    <section aria-labelledby="book-check-title" className="rounded-2xl border border-white/70 bg-surface/55 p-4 backdrop-blur-md sm:p-5 dark:border-white/10">
      <h3 id="book-check-title" className="font-display text-base font-semibold text-fg">
        Check your booking
      </h3>
      <dl className="mt-3 divide-y divide-line/60">
        <Row Icon={Car} label="Car" target="vehicle" onEdit={onEdit}>
          <span className="font-semibold">{d.vehicle}</span>
          {form.vin && <span className="block font-mono text-xs text-fg2">VIN {form.vin}</span>}
        </Row>
        <Row Icon={Wrench} label="Services" target="services" onEdit={onEdit}>
          {d.services.length > 0 ? (
            <span className="font-semibold">{d.services.map((s) => s.name).join(', ')}</span>
          ) : (
            <span className="font-semibold">Problem described; we will quote after inspection</span>
          )}
          {form.notes.trim() && <span className="mt-1 line-clamp-2 block whitespace-pre-line text-xs leading-relaxed text-fg2">{form.notes.trim()}</span>}
        </Row>
        <Row Icon={CalendarClock} label="Time" target="when" onEdit={onEdit}>
          <span className="font-semibold">{formatWhen(form.date, form.time, d.timeZone)}</span>
          <span className="block text-xs text-fg2">{urgency}</span>
        </Row>
        <Row Icon={User} label="Technician" target="technician" onEdit={onEdit}>
          <span className="font-semibold">{d.expertName ?? 'Any available'}</span>
        </Row>
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line/60 pt-4">
        <p className="text-sm font-semibold text-fg">Estimated total</p>
        <p className="font-display text-lg font-bold tabular-nums text-fg">{d.services.length ? estimateText(d) : 'Quoted after inspection'}</p>
      </div>
      <p className="mt-1 text-right text-xs text-fg3">Final price after inspection. Taxes extra.</p>
    </section>
  );
}

/** The deposit choice and the terms line, just above Confirm booking. */
export function ReviewFooter({ form, onDeposit }: { form: FormState; onDeposit: (v: boolean) => void }) {
  const site = useSite();
  return (
    <div className="space-y-4">
      <label
        htmlFor="book-deposit"
        className={`flex cursor-pointer gap-3 rounded-2xl border p-4 backdrop-blur-md transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
          form.deposit ? 'border-accent bg-accent/10' : 'border-white/70 bg-surface/55 dark:border-white/10'
        }`}
      >
        <input
          id="book-deposit"
          type="checkbox"
          checked={form.deposit}
          onChange={(e) => onDeposit(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
          aria-describedby="deposit-note"
        />
        <span>
          <span className="block text-sm font-semibold text-fg">Pay a $50 deposit (optional)</span>
          <span id="deposit-note" className="mt-0.5 block text-xs leading-relaxed text-fg2">
            {form.deposit
              ? 'Noted. The workshop will arrange the deposit with you when they confirm. Nothing is charged online.'
              : 'Secures your spot; applied to your final bill.'}
          </span>
        </span>
      </label>

      <p className="text-sm text-fg2">
        By confirming, you agree to our{' '}
        <Link to={sitePath(site, 'terms')} className="font-medium text-accent underline underline-offset-2">
          Terms and Conditions
        </Link>
        . Nothing is booked until the workshop confirms.
      </p>
    </div>
  );
}
