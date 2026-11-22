import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { AuthShell, Field, FormMessage, GoogleButton, OrDivider } from './AuthShell';

const MIN_LENGTH = 8;

/**
 * Self-registration. A new account has no role: it can sign in but sees no
 * modules until someone with full Users & Roles access assigns one.
 */
export function RegisterPage() {
  const { status, signUp, signInWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  if (status === 'signed-in') return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters for your password.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const result = await signUp(fullName, email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.needsConfirmation) setCheckEmail(true);
    // Otherwise Supabase signed the user in and the redirect above takes over.
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
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

  return (
    <AuthShell title="Create an account" subtitle="A manager approves new accounts and assigns your role.">
      <div className="space-y-4">
        <GoogleButton onClick={() => void onGoogle()} disabled={busy} label="Sign up with Google" />
        <OrDivider />
      </div>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Field
          id="full-name"
          label="Full name"
          autoComplete="name"
          required
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          required
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
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
