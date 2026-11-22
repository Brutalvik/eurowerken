import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Mail, MessageSquare, RotateCcw, UserRound } from 'lucide-react';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import type { CustomerAccount } from '@/auth/CustomerAuthContext';
import { Switch } from '@/components/ui';
import { sitePath, useSite } from '@/site/SiteContext';
import { Field, FormAlert, FormSuccess, MIN_PASSWORD, SubmitButton, focusFirstError } from './AccountUI';

export function AccountPage() {
  const site = useSite();
  const { account, accountError, reload, signOut } = useCustomerAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `Account | ${site.display_name}`;
  }, [site.display_name]);

  async function onSignOut() {
    await signOut();
    navigate(sitePath(site), { replace: true });
  }

  return (
    <div className="container-site py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your account</p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Account settings</h1>
          </div>
          <Link to={sitePath(site, 'garage')} className="text-sm font-semibold text-accent hover:underline coarse:min-h-11 coarse:py-3">
            Back to My Garage
          </Link>
        </div>

        {account ? (
          <>
            <ProfileCard account={account} />
            <NotificationsCard account={account} />
            <PasswordCard />
          </>
        ) : (
          <AccountLoadError message={accountError} onRetry={reload} />
        )}

        <Card icon={LogOut} title="Sign out" titleId="signout-title">
          <p className="text-sm text-fg2">Sign out of your account on this device.</p>
          <button type="button" onClick={() => void onSignOut()} className="btn-outline mt-4 w-full sm:w-auto">
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </Card>
      </div>
    </div>
  );
}

export function AccountLoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div role="alert" className="glass rounded-2xl border-l-4 border-l-bad p-5">
      <p className="font-semibold text-fg">We could not load your account.</p>
      {message && <p className="mt-1 text-sm text-fg2">{message}</p>}
      <button type="button" onClick={onRetry} className="btn-outline mt-4">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Try again
      </button>
    </div>
  );
}

function Card({ icon: Icon, title, titleId, children }: { icon: typeof Bell; title: string; titleId: string; children: ReactNode }) {
  return (
    <section aria-labelledby={titleId} className="glass rounded-2xl p-5 sm:p-7">
      <h2 id={titleId} className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileCard({ account }: { account: CustomerAccount }) {
  const { updateAccount } = useCustomerAuth();
  const [name, setName] = useState(account.full_name ?? '');
  const [phone, setPhone] = useState(account.phone ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    setSaved(false);
    const found: { name?: string; phone?: string } = {};
    if (name.trim().length < 2) found.name = 'Enter your name.';
    else if (name.trim().length > 120) found.name = 'Use 120 characters or fewer.';
    if (phone.trim() && !/^\+?[\d\s().-]{7,20}$/.test(phone.trim())) found.phone = 'Enter a phone number with digits only, for example 403 555 0123.';
    setErrors(found);
    if (found.name || found.phone) {
      focusFirstError(['account-name', 'account-phone'], { 'account-name': found.name, 'account-phone': found.phone });
      return;
    }
    setBusy(true);
    const err = await updateAccount({ full_name: name.trim(), phone: phone.trim() || null });
    setBusy(false);
    if (err) setFormError(err);
    else setSaved(true);
  }

  return (
    <Card icon={UserRound} title="Profile" titleId="profile-title">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="account-email" className="label">
            Email
          </label>
          <input id="account-email" type="email" value={account.email} readOnly aria-describedby="account-email-hint" className="input cursor-default bg-surface2/70 text-fg2" />
          <p id="account-email-hint" className="mt-1.5 text-xs text-fg3">
            Your sign-in email. It cannot be changed here.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="account-name" label="Full name" autoComplete="name" maxLength={120} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
          <Field
            id="account-phone"
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={40}
            value={phone}
            error={errors.phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {formError && <FormAlert>{formError}</FormAlert>}
        {saved && <FormSuccess>Your details are saved.</FormSuccess>}
        <SubmitButton busy={busy} busyLabel="Saving..." className="sm:w-auto">
          Save details
        </SubmitButton>
      </form>
    </Card>
  );
}

export function NotificationsCard({ account, compact = false }: { account: CustomerAccount; compact?: boolean }) {
  const site = useSite();
  const { updateAccount } = useCustomerAuth();
  const [error, setError] = useState<string | null>(null);

  async function toggle(patch: { notify_email: boolean } | { notify_sms: boolean }) {
    setError(null);
    const err = await updateAccount(patch);
    if (err) setError(`Your choice was not saved. ${err}`);
  }

  const body = (
    <>
      <Switch
        label="Email"
        icon={Mail}
        description={compact ? undefined : `Reminders and updates sent to ${account.email}.`}
        checked={account.notify_email}
        onChange={(v) => void toggle({ notify_email: v })}
      />
      <Switch
        label="Text message (SMS)"
        icon={MessageSquare}
        description={account.phone ? (compact ? undefined : `Sent to ${account.phone}.`) : 'Add a phone number in your account first.'}
        checked={account.notify_sms}
        disabled={!account.phone && !account.notify_sms}
        onChange={(v) => void toggle({ notify_sms: v })}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </>
  );

  if (compact) return body;
  return (
    <Card icon={Bell} title="Notifications" titleId="notifications-title">
      <p className="mb-2 text-sm text-fg2">How {site.display_name} may remind you about services and update you on repairs.</p>
      {body}
    </Card>
  );
}

function PasswordCard() {
  const { updatePassword } = useCustomerAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    setSaved(false);
    const found: { password?: string; confirm?: string } = {};
    if (password.length < MIN_PASSWORD) found.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (confirm !== password) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (found.password || found.confirm) {
      focusFirstError(['account-new-password', 'account-confirm-password'], {
        'account-new-password': found.password,
        'account-confirm-password': found.confirm,
      });
      return;
    }
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setFormError(err);
    else {
      setSaved(true);
      setPassword('');
      setConfirm('');
    }
  }

  return (
    <Card icon={KeyRound} title="Change password" titleId="password-title">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="account-new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            hint={`At least ${MIN_PASSWORD} characters.`}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            id="account-confirm-password"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={errors.confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {formError && <FormAlert>{formError}</FormAlert>}
        {saved && <FormSuccess>Your password is changed.</FormSuccess>}
        <SubmitButton busy={busy} busyLabel="Saving..." className="sm:w-auto">
          Change password
        </SubmitButton>
      </form>
    </Card>
  );
}
