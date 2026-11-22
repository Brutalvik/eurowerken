import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Car, Pencil, User, UserRound, Wrench } from 'lucide-react';
import { formatMoneyWhole } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { formatLongDate } from '../Calendar';
import { STEPS, URGENCY, formatSlot, priceRange } from '../model';
import type { FormState, StepId } from '../model';
import { estimateText } from '../BookingSummary';
import type { SummaryData } from '../BookingSummary';

function Panel({ Icon, step, onEdit, children }: { Icon: typeof Car; step: StepId; onEdit: (s: StepId) => void; children: ReactNode }) {
  const info = STEPS.find((s) => s.id === step)!;
  return (
    <section aria-labelledby={`review-${step}`} className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <h3 id={`review-${step}`} className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wider text-fg3">
          {info.label}
        </h3>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 coarse:min-h-11"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Edit<span className="sr-only"> {info.label.toLowerCase()}</span>
        </button>
      </div>
      <div className="mt-2 break-words pl-11 text-sm text-fg">{children}</div>
    </section>
  );
}

export function ReviewStep({ form, d, onEdit }: { form: FormState; d: SummaryData; onEdit: (s: StepId) => void }) {
  const urgency = URGENCY.find((u) => u.id === form.urgency)?.label ?? 'Routine';
  return (
    <div className="space-y-3">
      <Panel Icon={Car} step="vehicle" onEdit={onEdit}>
        <p className="font-semibold">{d.vehicle}</p>
        {form.vin && <p className="font-mono text-xs text-fg2">VIN {form.vin}</p>}
      </Panel>
      <Panel Icon={Wrench} step="services" onEdit={onEdit}>
        {d.services.length > 0 ? (
          <ul className="space-y-1">
            {d.services.map((s) => {
              const [sl, sh] = priceRange(s);
              return (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="min-w-0 font-semibold">{s.name}</span>
                  <span className="shrink-0 tabular-nums text-fg3">
                    {formatMoneyWhole(sl)} to {formatMoneyWhole(sh)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="font-semibold">As described in your notes</p>
        )}
        {form.notes.trim() && <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-fg2">{form.notes.trim()}</p>}
      </Panel>
      <Panel Icon={CalendarClock} step="when" onEdit={onEdit}>
        <p className="font-semibold">
          {formatLongDate(form.date)}, {formatSlot(form.time)}
        </p>
        <p className="text-xs text-fg2">{urgency}</p>
      </Panel>
      <Panel Icon={User} step="expert" onEdit={onEdit}>
        <p className="font-semibold">{d.expertName ?? 'Any available expert'}</p>
      </Panel>
      <Panel Icon={UserRound} step="contact" onEdit={onEdit}>
        <p className="font-semibold">
          {form.firstName.trim()} {form.lastName.trim()}
        </p>
        <p className="text-xs text-fg2">
          {form.email.trim()} · {form.phone.trim()}
        </p>
        <p className="mt-1 text-xs text-fg3">
          Reminders:{' '}
          {[form.remindEmail && 'email', form.remindSms && 'text message'].filter(Boolean).join(' and ') || 'none'}
        </p>
      </Panel>
    </div>
  );
}

/** Estimate, the deposit choice and the terms, above the Confirm button. */
export function ReviewFooter({ form, d, onDeposit }: { form: FormState; d: SummaryData; onDeposit: (v: boolean) => void }) {
  const site = useSite();
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-fg">Estimated total</p>
          <p className="font-display text-xl font-bold tabular-nums text-fg">{d.services.length ? estimateText(d) : 'Quoted after inspection'}</p>
        </div>
        <p className="mt-1 text-right text-[11px] text-fg3">Final price determined after inspection. Taxes extra.</p>
      </div>

      <label
        htmlFor="book-deposit"
        className={`flex cursor-pointer gap-3 rounded-2xl border p-4 backdrop-blur-md transition focus-within:ring-2 focus-within:ring-accent/40 ${
          form.deposit ? 'border-accent/50 bg-accent/10' : 'border-white/70 bg-surface/55 dark:border-white/10'
        }`}
      >
        <input
          id="book-deposit"
          type="checkbox"
          checked={form.deposit}
          onChange={(e) => onDeposit(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent coarse:h-5 coarse:w-5"
          aria-describedby="deposit-note"
        />
        <span>
          <span className="block text-sm font-semibold text-fg">Pay $50 deposit now</span>
          <span id="deposit-note" className="mt-0.5 block text-xs leading-relaxed text-fg3">
            {form.deposit
              ? 'Noted. The workshop will arrange the deposit with you when they confirm. Nothing is charged online.'
              : 'Secures your spot; applied to your final bill.'}
          </span>
        </span>
      </label>

      <p className="text-center text-[11px] text-fg3 sm:text-right">
        By booking, you agree to our{' '}
        <Link to={sitePath(site, 'terms')} className="font-medium text-accent underline-offset-2 hover:underline">
          Terms and Conditions
        </Link>
        .
      </p>
    </div>
  );
}
