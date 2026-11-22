import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { fetchInvitePreview } from '@/lib/invites';
import type { InvitePreview } from '@/lib/invites';
import { writePendingInvite } from '@/lib/supabase';
import { AuthShell, Field, FormMessage, GoogleButton, OrDivider } from './AuthShell';

const MIN_LENGTH = 8;

type WorkshopChoice = 'join' | 'create';

/**
 * Self-registration. Without an invite the person must either join an
 * existing workshop by its number (a Manager then approves them) or create a
 * new workshop (they become its Manager). With an invite link (?invite=token)
 * the workshop and role come from the invite and the email is fixed.
 */
export function RegisterPage() {
  const { status, signUp, signInWithGoogle, workshopNumberExists } = useAuth();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [choice, setChoice] = useState<WorkshopChoice>('join');
  const [workshopNumber, setWorkshopNumber] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    writePendingInvite(inviteToken);
    void fetchInvitePreview(inviteToken).then((preview) => {
      if (preview?.status === 'valid') {
        setInvite(preview);
        setEmail(preview.email);
      }
    });
  }, [inviteToken]);

  if (status === 'signed-in') return <Navigate to={inviteToken ? `/invite/${inviteToken}` : '/dashboard'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!invite) {
      if (choice === 'join' && !/^\d{6}$/.test(workshopNumber.trim())) {
        setError('Enter the 6-digit workshop number your manager gave you.');
        return;
      }
      if (choice === 'create' && workshopName.trim().length < 2) {
        setError('Enter a name for your workshop.');
        return;
      }
    }
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters for your password.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    if (!invite && choice === 'join' && !(await workshopNumberExists(workshopNumber))) {
      setBusy(false);
      setError('No workshop has that number. Check it with your manager.');
      return;
    }
    const result = await signUp({
      fullName,
      email,
      password,
      workshop: invite
        ? undefined
        : choice === 'join'
          ? { action: 'join', number: workshopNumber }
          : { action: 'create', name: workshopName },
      returnTo: inviteToken && invite ? `/invite/${inviteToken}` : '/dashboard',
    });
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.needsConfirmation) setCheckEmail(true);
    // Otherwise Supabase signed the user in and the redirect above takes over.
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    // Google cannot carry the workshop choice; it is made after sign-in (or the saved invite is used).
    const err = await signInWithGoogle();
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthShell title="Check your email" subtitle="One more step before you can sign in.">
        <div className="space-y-4">
          <FormMessage tone="success">
            We sent a confirmation link to {email.trim()}. Open it to activate your account.
          </FormMessage>
          <Link to="/login" className="block text-center text-xs font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const subtitle = invite
    ? `You are joining ${invite.workshopName} as ${invite.role}.`
    : 'Join your workshop with its number, or create a new workshop.';

  return (
    <AuthShell title="Create an account" subtitle={subtitle}>
      <div className="space-y-4">
        <GoogleButton
          onClick={() => void onGoogle()}
          disabled={busy}
          label={invite ? 'Continue with Google' : 'Sign up with Google, choose workshop after'}
        />
        <OrDivider />
      </div>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        {!invite && (
          <fieldset className="space-y-3">
            <legend className="mb-1.5 text-xs font-medium text-fg2">Workshop</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface2 p-1" role="radiogroup">
              {(
                [
                  ['join', 'Join existing'],
                  ['create', 'Create new'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={choice === value}
                  onClick={() => {
                    setChoice(value);
                    setError(null);
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                    choice === value ? 'bg-surface text-fg shadow-sm' : 'text-fg2 hover:text-fg'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {choice === 'join' ? (
              <Field
                id="workshop-number"
                label="Workshop number"
                inputMode="numeric"
                placeholder="6 digits, from your manager"
                maxLength={6}
                required
                value={workshopNumber}
                onChange={(e) => setWorkshopNumber(e.target.value.replace(/\D/g, ''))}
              />
            ) : (
              <Field
                id="workshop-name"
                label="Workshop name"
                placeholder="For example, Bravo Motors"
                maxLength={80}
                required
                value={workshopName}
                onChange={(e) => setWorkshopName(e.target.value)}
              />
            )}
            <p className="text-[11px] text-fg3">
              {choice === 'join'
                ? 'The workshop manager approves your request and assigns your role.'
                : 'You become the Manager of the new workshop.'}
            </p>
          </fieldset>
        )}

        <Field
          id="full-name"
          label="Full name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          required
          readOnly={Boolean(invite)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="confirm-password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Creating account...' : 'Create account'}
        </Button>
        <p className="text-center text-xs text-fg2">
          Already have an account?{' '}
          <Link
            to="/login"
            state={inviteToken ? { from: `/invite/${inviteToken}` } : undefined}
            className="font-medium text-accent hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
