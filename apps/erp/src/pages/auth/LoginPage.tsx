import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { EMAIL_NOT_CONFIRMED, useAuth } from '@/auth/AuthContext';
import {
  AuthAlert,
  AuthField,
  AuthScreen,
  AuthShell,
  CodeStep,
  GoogleButton,
  OrDivider,
  PrimaryButton,
  TextButton,
  textLinkClass,
} from './AuthUI';
import { WelcomeStep } from './Welcome';

type Step = 'sign-in' | 'forgot' | 'code' | 'welcome';
type Purpose = 'signup' | 'recovery';

export function LoginPage() {
  const { status, signIn, signInWithGoogle, sendPasswordReset, verifyCode, resendSignupCode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [step, setStep] = useState<Step>('sign-in');
  const [purpose, setPurpose] = useState<Purpose>('signup');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A sign-in started on this page: show the welcome step instead of redirecting at once.
  const [entering, setEntering] = useState(false);
  const [isNew, setIsNew] = useState(false);

  if (step === 'welcome') {
    return (
      <AuthScreen>
        <WelcomeStep isNew={isNew} email={email} onDone={() => navigate(from, { replace: true })} />
      </AuthScreen>
    );
  }
  if (status === 'recovery') return <Navigate to="/reset-password" replace />;
  // Already signed in (for example a reload): straight on, no welcome step.
  if (status === 'signed-in' && !entering) return <Navigate to={from} replace />;

  function openCode(next: Purpose, initialError: string | null) {
    setPurpose(next);
    setCodeError(initialError);
    setError(null);
    setStep('code');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (step === 'sign-in') {
      setEntering(true);
      const err = await signIn(email, password);
      if (!err) {
        setIsNew(false);
        setStep('welcome');
      } else {
        setEntering(false);
        if (err === EMAIL_NOT_CONFIRMED) {
          // Send a fresh code and let them confirm right here.
          openCode('signup', await resendSignupCode(email, from));
        } else {
          setError(err);
        }
      }
    } else {
      const err = await sendPasswordReset(email);
      if (err) setError(err);
      else openCode('recovery', null);
    }
    setBusy(false);
  }

  async function onVerify(code: string) {
    if (purpose === 'recovery') {
      // On success the status turns to recovery and the redirect above opens the new-password screen.
      return verifyCode(email, code, 'recovery');
    }
    setEntering(true);
    const err = await verifyCode(email, code, 'signup');
    if (err) {
      setEntering(false);
      return err;
    }
    setIsNew(true);
    setStep('welcome');
    return null;
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const err = await signInWithGoogle();
    // On success the page redirects to Google; only an error brings us back here.
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  function switchStep(next: 'sign-in' | 'forgot') {
    setStep(next);
    setError(null);
  }

  if (step === 'code') {
    return (
      <AuthScreen>
        <CodeStep
          key={purpose}
          email={email.trim()}
          purpose={purpose}
          initialError={codeError}
          onVerify={onVerify}
          onResend={() => (purpose === 'recovery' ? sendPasswordReset(email) : resendSignupCode(email, from))}
          onBack={() => switchStep(purpose === 'recovery' ? 'forgot' : 'sign-in')}
        />
      </AuthScreen>
    );
  }

  if (step === 'forgot') {
    return (
      <AuthShell
        title="Reset your password"
        subtitle="We will email you a 6-digit code to set a new password."
        footer={<TextButton onClick={() => switchStep('sign-in')}>Back to sign in</TextButton>}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <AuthAlert>{error}</AuthAlert>}
          <PrimaryButton busy={busy} busyLabel="Sending...">
            Send code
          </PrimaryButton>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Sign in to the workshop console."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className={textLinkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <AuthField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-1 flex justify-end">
            <TextButton onClick={() => switchStep('forgot')} className="text-xs">
              Forgot password?
            </TextButton>
          </div>
        </div>
        {error && <AuthAlert>{error}</AuthAlert>}
        <PrimaryButton busy={busy} busyLabel="Signing in...">
          Continue
        </PrimaryButton>
      </form>
      <OrDivider />
      <GoogleButton onClick={() => void onGoogle()} disabled={busy} />
    </AuthShell>
  );
}
