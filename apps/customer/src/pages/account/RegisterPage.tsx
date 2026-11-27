import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { safeNext, useCustomerAuth } from '@/auth/CustomerAuthContext';
import { sitePath, useSite } from '@/site/SiteContext';
import { PREVIEW_DISABLED_NOTE, isPreview } from '@/site/preview';
import {
  AuthAlert,
  AuthField,
  AuthScreen,
  AuthShell,
  CodeStep,
  GoogleButton,
  MIN_PASSWORD,
  OrDivider,
  PrimaryButton,
  focusFirstError,
  isEmail,
  textLinkClass,
} from './AccountUI';
import { WelcomeStep } from './Welcome';

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'password' | 'confirm', string>>;

const ORDER: (keyof Errors)[] = ['name', 'email', 'phone', 'password', 'confirm'];
const fieldId = (key: keyof Errors) => `register-${key}`;

export function RegisterPage() {
  const site = useSite();
  const { status, signUp, signInWithGoogle, verifyCode, resendSignupCode } = useCustomerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), site.slug);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'form' | 'code' | 'welcome'>('form');
  // A sign-up started on this page: show the welcome step instead of redirecting at once.
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    document.title = `Create an account | ${site.display_name}`;
  }, [site.display_name]);

  if (step === 'welcome') {
    return (
      <AuthScreen>
        <WelcomeStep isNew email={email} next={next} onDone={() => navigate(next, { replace: true })} />
      </AuthScreen>
    );
  }
  if (status === 'signed-in' && !entering) return <Navigate to={next} replace />;
  if (status === 'recovery') return <Navigate to={sitePath(site, 'reset-password')} replace />;

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Enter your name.';
    else if (name.trim().length > 120) e.name = 'Use 120 characters or fewer.';
    if (!email.trim()) e.email = 'Enter your email address.';
    else if (!isEmail(email)) e.email = 'Enter a valid email address, for example name@example.com.';
    if (phone.trim() && !/^\+?[\d\s().-]{7,20}$/.test(phone.trim())) e.phone = 'Enter a phone number with digits only, for example 403 555 0123.';
    if (password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (!e.password && confirm !== password) e.confirm = 'The two passwords do not match.';
    return e;
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
      focusFirstError(
        ORDER.map(fieldId),
        Object.fromEntries(ORDER.map((k) => [fieldId(k), found[k]])),
      );
      return;
    }
    setBusy(true);
    setEntering(true);
    const { error, needsConfirmation } = await signUp({ fullName: name, email, phone, password });
    setBusy(false);
    if (error) {
      setEntering(false);
      setFormError(error);
    } else if (needsConfirmation) {
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
    if (isPreview()) {
      setFormError(PREVIEW_DISABLED_NOTE);
      return;
    }
    setBusy(true);
    setFormError(null);
    const err = await signInWithGoogle(next);
    if (err) {
      setFormError(err);
      setBusy(false);
    }
  }

  const loginLink = `${sitePath(site, 'login')}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  if (step === 'code') {
    return (
      <AuthScreen>
        <CodeStep
          email={email.trim()}
          purpose="signup"
          onVerify={onVerify}
          onResend={() => resendSignupCode(email)}
          onBack={() => setStep('form')}
        />
      </AuthScreen>
    );
  }

  const disabled = busy || status === 'loading';

  return (
    <AuthShell
      title="Create your account"
      subtitle={`Keep your vehicles, bookings and reminders in one place at ${site.display_name}.`}
      footer={
        <>
          Already have an account?{' '}
          <Link to={loginLink} className={textLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthField
          id={fieldId('name')}
          label="Full name"
          autoComplete="name"
          value={name}
          maxLength={120}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <AuthField
          id={fieldId('email')}
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          id={fieldId('phone')}
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          maxLength={40}
          hint="For reminders and updates about your car, if you turn them on."
          error={errors.phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <AuthField
          id={fieldId('password')}
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={errors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          id={fieldId('confirm')}
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {formError && <AuthAlert>{formError}</AuthAlert>}
        <p className="px-1 text-xs leading-relaxed text-fg3">
          By creating an account you agree to the{' '}
          <Link to={sitePath(site, 'terms')} className="font-medium text-accent hover:underline">
            Terms and Conditions
          </Link>{' '}
          and the{' '}
          <Link to={sitePath(site, 'privacy')} className="font-medium text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <PrimaryButton busy={busy} busyLabel="Creating account...">
          Create account
        </PrimaryButton>
      </form>
      <OrDivider />
      <GoogleButton onClick={() => void onGoogle()} disabled={disabled} />
    </AuthShell>
  );
}
