import type { ReactNode } from 'react';
import { BellRing, Mail, MessageSquareText, UserCheck } from 'lucide-react';
import type { Errors, Field, FormState } from '../model';
import { ErrorText, errorProps } from '../ui';

function TextField({
  field,
  label,
  shown,
  children,
}: {
  field: Field;
  label: string;
  shown: Errors;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`book-${field}`} className="label">
        {label}
        <span aria-hidden> *</span>
      </label>
      {children}
      <ErrorText field={field} error={shown[field]} />
    </div>
  );
}

function ToggleRow({
  id,
  checked,
  onChange,
  Icon,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  Icon: typeof Mail;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 backdrop-blur-md transition focus-within:ring-2 focus-within:ring-accent/40 coarse:min-h-12 ${
        checked ? 'border-accent/50 bg-accent/10' : 'border-white/70 bg-surface/55 dark:border-white/10'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${checked ? 'text-accent' : 'text-fg3'}`} aria-hidden />
      <span className="min-w-0 flex-1 text-sm text-fg2">{children}</span>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent coarse:h-5 coarse:w-5" />
    </label>
  );
}

export function ContactStep({
  form,
  set,
  shown,
  prefilled,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  shown: Errors;
  /** Signed in: the details came from the account. */
  prefilled: boolean;
}) {
  const input = 'input bg-surface/60 backdrop-blur-md';
  return (
    <div className="space-y-8">
      {prefilled && (
        <p className="book-reveal flex items-start gap-2 rounded-2xl border border-ok/25 bg-ok/10 px-3.5 py-3 text-xs leading-relaxed text-ok">
          <UserCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
          Filled in from your account. Changes here apply to this booking only.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField field="firstName" label="First name" shown={shown}>
          <input
            id="book-firstName"
            className={input}
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            autoComplete="given-name"
            placeholder="John"
            {...errorProps(shown, 'firstName')}
          />
        </TextField>
        <TextField field="lastName" label="Last name" shown={shown}>
          <input
            id="book-lastName"
            className={input}
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            autoComplete="family-name"
            placeholder="Doe"
            {...errorProps(shown, 'lastName')}
          />
        </TextField>
        <TextField field="email" label="Email address" shown={shown}>
          <input
            id="book-email"
            type="email"
            inputMode="email"
            className={input}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            spellCheck={false}
            placeholder="john.doe@example.com"
            {...errorProps(shown, 'email')}
          />
        </TextField>
        <TextField field="phone" label="Phone number" shown={shown}>
          <input
            id="book-phone"
            type="tel"
            inputMode="tel"
            className={input}
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            autoComplete="tel"
            placeholder="(555) 123-4567"
            {...errorProps(shown, 'phone')}
          />
        </TextField>
      </div>

      <fieldset>
        <legend className="mb-3 flex items-center gap-2 p-0 text-sm font-semibold text-fg">
          <BellRing className="h-4 w-4 text-accent" aria-hidden />
          Reminder preferences
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow id="remind-email" checked={form.remindEmail} onChange={(v) => set('remindEmail', v)} Icon={Mail}>
            Send me an email confirmation and calendar invite
          </ToggleRow>
          <ToggleRow id="remind-sms" checked={form.remindSms} onChange={(v) => set('remindSms', v)} Icon={MessageSquareText}>
            Send me text message reminders 24 hours before my appointment
          </ToggleRow>
        </div>
      </fieldset>
    </div>
  );
}
