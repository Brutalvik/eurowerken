import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { fetchInvitePreview } from '@/lib/invites';
import type { InvitePreview } from '@/lib/invites';
import { writePendingInvite } from '@/lib/supabase';
import {
  AuthAlert,
  AuthField,
  AuthScreen,
  AuthSegmented,
  AuthShell,
  CodeStep,
  GoogleButton,
  OrDivider,
  PrimaryButton,
  textLinkClass,
} from './AuthUI';
import { WelcomeStep } from './Welcome';

const MIN_LENGTH = 8;

type WorkshopChoice = 'join' | 'create';

/**
 * Self-registration. Without an invite the person must either join an
 * existing workshop by its number (a Manager then approves them) or create a
 * new workshop (they become its Manager). With an invite link (?invite=token)
 * the workshop and role come from the invite and the email is fixed.
 */
export function RegisterPage() {
  const { status, signUp, signInWithGoogle, workshopNumberExists, verifyCode, resendSignupCode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const destination = inviteToken ? `/invite/${inviteToken}` : '/dashboard';

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
  const [step, setStep] = useState<'form' | 'code' | 'welcome'>('form');
  // A sign-up started on this page: show the welcome step instead of redirecting at once.
  const [entering, setEntering] = useState(false);

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

  // Where the confirmation email returns to; also used for a resent code.
  const returnTo = inviteToken && invite ? `/invite/${inviteToken}` : '/dashboard';

  if (step === 'welcome') {
    return (
      <AuthScreen>
        <WelcomeStep isNew email={email} onDone={() => navigate(destination, { replace: true })} />
      </AuthScreen>
    );
  }
  if (status === 'signed-in' && !entering) return <Navigate to={destination} replace />;

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
    setEntering(true);
    if (!invite && choice === 'join' && !(await workshopNumberExists(workshopNumber))) {
      setEntering(false);
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
      returnTo,
    });
    setBusy(false);
    if (result.error) {
      setEntering(false);
      setError(result.error);
    } else if (result.needsConfirmation) {
      setEntering(false);
      setStep('code');
    } else {
      // Supabase signed the user in straight away (email confirmation is off).
      setStep('welcome');
    }
  }

  async function onVerify(code: string) {
    setEntering(true);
    const err = await verifyCode(email, code, 'signup');
    if (err) {
      setEntering(false);
      return err;
    }
    setStep('welcome');
    return null;
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

  if (step === 'code') {
    return (
      <AuthScreen>
        <CodeStep
          email={email.trim()}
          purpose="signup"
          onVerify={onVerify}
          onResend={() => resendSignupCode(email, returnTo)}
          onBack={() => setStep('form')}
        />
      </AuthScreen>
    );
  }

  const subtitle = invite
    ? `You are joining ${invite.workshopName} as ${invite.role}.`
    : 'Join your workshop with its number, or create a new workshop.';

  return (
    <AuthShell
      title="Create an account"
      subtitle={subtitle}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={inviteToken ? { from: `/invite/${inviteToken}` } : undefined} className={textLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!invite && (
          <fieldset className="space-y-3">
            <legend className="mb-2 px-1 text-xs font-medium text-fg2">Workshop</legend>
            <AuthSegmented
              label="Workshop"
              value={choice}
              options={[
                ['join', 'Join existing'],
                ['create', 'Create new'],
              ]}
              onChange={(value) => {
                setChoice(value);
                setError(null);
              }}
            />
            {choice === 'join' ? (
              <AuthField
                id="workshop-number"
                label="Workshop number"
                inputMode="numeric"
                placeholder="6 digits, from your manager"
                maxLength={6}
                required
                value={workshopNumber}
                hint="The workshop manager approves your request and assigns your role."
                onChange={(e) => setWorkshopNumber(e.target.value.replace(/\D/g, ''))}
              />
            ) : (
              <AuthField
                id="workshop-name"
                label="Workshop name"
                placeholder="For example, Bravo Motors"
                maxLength={80}
                required
                value={workshopName}
                hint="You become the Manager of the new workshop."
                onChange={(e) => setWorkshopName(e.target.value)}
              />
            )}
          </fieldset>
        )}

        <AuthField
          id="full-name"
          label="Full name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <AuthField
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          readOnly={Boolean(invite)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          id="confirm-password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <AuthAlert>{error}</AuthAlert>}
        <p className="px-1 text-xs leading-relaxed text-fg3">
          By creating an account you agree to the{' '}
          <Link to="/terms" target="_blank" className="font-medium text-accent hover:underline">
            Terms and Conditions
          </Link>{' '}
          and{' '}
          <Link to="/privacy" target="_blank" className="font-medium text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <PrimaryButton busy={busy} busyLabel="Creating account...">
          Create account
        </PrimaryButton>
      </form>
      <OrDivider />
      <GoogleButton onClick={() => void onGoogle()} disabled={busy} />
      {!invite && <p className="mt-2 px-1 text-center text-xs text-fg3">With Google, you choose your workshop after signing in.</p>}
    </AuthShell>
  );
}
