import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { sitePath, useSite } from '@/site/SiteContext';
import { AuthAlert, AuthField, AuthScreen, AuthShell, MIN_PASSWORD, PrimaryButton, authButtonClass, focusFirstError } from './AccountUI';

type Errors = { password?: string; confirm?: string };

/**
 * Reached from the reset email link, or after the 6-digit reset code on the
 * sign-in page. Either way the user is signed in in recovery mode and sets a
 * new password here.
 */
export function ResetPasswordPage() {
  const site = useSite();
  const { status, updatePassword } = useCustomerAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `Set a new password | ${site.display_name}`;
  }, [site.display_name]);

  if (status === 'loading') {
    return (
      <AuthScreen legal={false}>
        <div className="flex justify-center" role="status" aria-label="Loading">
          <Loader2 className="h-6 w-6 animate-spin text-fg2 motion-reduce:animate-none" aria-hidden />
        </div>
      </AuthScreen>
    );
  }

  if (status === 'signed-out') {
    return (
      <AuthShell title="Link expired or invalid" subtitle="Password links and codes work once and expire after a short time.">
        <Link to={sitePath(site, 'login')} className={authButtonClass.primary}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const found: Errors = {};
    if (password.length < MIN_PASSWORD) found.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (confirm !== password) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (found.password || found.confirm) {
      focusFirstError(['reset-password', 'reset-confirm'], { 'reset-password': found.password, 'reset-confirm': found.confirm });
      return;
    }
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setFormError(err);
    else navigate(sitePath(site, 'garage'), { replace: true });
  }

  return (
    <AuthShell title="Set a new password" subtitle={`Choose a password of at least ${MIN_PASSWORD} characters.`}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthField
          id="reset-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          error={errors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          id="reset-confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {formError && <AuthAlert>{formError}</AuthAlert>}
        <PrimaryButton busy={busy} busyLabel="Saving...">
          Save password
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
