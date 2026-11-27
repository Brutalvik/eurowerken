import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { safeNext, useCustomerAuth } from '@/auth/CustomerAuthContext';
import { EMAIL_NOT_CONFIRMED } from '@/lib/errors';
import { sitePath, useSite } from '@/site/SiteContext';
import { PREVIEW_DISABLED_NOTE, isPreview } from '@/site/preview';
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
  focusFirstError,
  isEmail,
  textLinkClass,
} from './AccountUI';
import { WelcomeStep } from './Welcome';

type Step = 'sign-in' | 'forgot' | 'code' | 'welcome';
type Purpose = 'signup' | 'recovery';
type Errors = { email?: string; password?: string };

export function LoginPage() {
  const site = useSite();
  const { status, signIn, signInWithGoogle, sendPasswordReset, verifyCode, resendSignupCode } = useCustomerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), site.slug);

  const [step, setStep] = useState<Step>('sign-in');
  const [purpose, setPurpose] = useState<Purpose>('signup');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A sign-in started on this page: show the welcome step instead of redirecting at once.
  const [entering, setEntering] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    document.title = `Sign in | ${site.display_name}`;
  }, [site.display_name]);

  if (step === 'welcome') {
    return (
      <AuthScreen>
        <WelcomeStep isNew={isNew} email={email} next={next} onDone={() => navigate(next, { replace: true })} />
      </AuthScreen>
    );
  }
  if (status === 'recovery') return <Navigate to={sitePath(site, 'reset-password')} replace />;
  // Already signed in (for example a reload): straight on, no welcome step.
  if (status === 'signed-in' && !entering) return <Navigate to={next} replace />;

  function validate(): Errors {
    const e: Errors = {};
    if (!email.trim()) e.email = 'Enter your email address.';
    else if (!isEmail(email)) e.email = 'Enter a valid email address, for example name@example.com.';
    if (step === 'sign-in' && !password) e.password = 'Enter your password.';
    return e;
  }

  function openCode(nextPurpose: Purpose, initialError: string | null) {
    setPurpose(nextPurpose);
    setCodeError(initialError);
    setFormError(null);
    setStep('code');
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    if (isPreview()) {
      setFormError(PREVIEW_DISABLED_NOTE);
      return;
    }
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(['login-email', 'login-password'], { 'login-email': found.email, 'login-password': found.password });
      return;
    }
    setBusy(true);
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
          openCode('signup', await resendSignupCode(email));
        } else {
          setFormError(err);
        }
      }
    } else {
      const err = await sendPasswordReset(email);
      if (err) setFormError(err);
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
    if (isPreview()) {
      setFormError(PREVIEW_DISABLED_NOTE);
      return;
    }
    setBusy(true);
    setFormError(null);
    const err = await signInWithGoogle(next);
    // On success the browser leaves for Google; only an error comes back here.
    if (err) {
      setFormError(err);
      setBusy(false);
    }
  }

  function switchStep(s: 'sign-in' | 'forgot') {
    setStep(s);
    setErrors({});
    setFormError(null);
    requestAnimationFrame(() => document.getElementById('login-email')?.focus());
  }

  const registerLink = `${sitePath(site, 'register')}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;
  const disabled = busy || status === 'loading';

  if (step === 'code') {
    return (
      <AuthScreen>
        <CodeStep
          key={purpose}
          email={email.trim()}
          purpose={purpose}
          initialError={codeError}
          onVerify={onVerify}
          onResend={() => (purpose === 'recovery' ? sendPasswordReset(email) : resendSignupCode(email))}
          onBack={() => switchStep(purpose === 'recovery' ? 'forgot' : 'sign-in')}
        />
      </AuthScreen>
    );
  }

  if (step === 'forgot') {
    return (
      <AuthShell
        title="Reset your password"
        subtitle="Enter the email you signed up with and we will send you a 6-digit code to set a new password."
        footer={<TextButton onClick={() => switchStep('sign-in')}>Back to sign in</TextButton>}
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <AuthField
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {formError && <AuthAlert>{formError}</AuthAlert>}
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
      subtitle={`Your garage at ${site.display_name}: your vehicles, visits and reminders.`}
      footer={
        <>
          New here?{' '}
          <Link to={registerLink} className={textLinkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <AuthField
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-1 flex justify-end">
            <TextButton onClick={() => switchStep('forgot')} className="text-xs">
              Forgot password?
            </TextButton>
          </div>
        </div>
        {formError && <AuthAlert>{formError}</AuthAlert>}
        <PrimaryButton busy={busy} busyLabel="Signing in...">
          Continue
        </PrimaryButton>
      </form>
      <OrDivider />
      <GoogleButton onClick={() => void onGoogle()} disabled={disabled} />
    </AuthShell>
  );
}
