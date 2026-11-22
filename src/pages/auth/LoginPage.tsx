import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { AuthShell, Field, FormMessage } from './AuthShell';

type Mode = 'sign-in' | 'forgot';

export function LoginPage() {
  const { status, signIn, sendPasswordReset } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (status === 'signed-in') return <Navigate to={from} replace />;
  if (status === 'recovery') return <Navigate to="/reset-password" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === 'sign-in') {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await sendPasswordReset(email);
      if (err) setError(err);
      else setSent(true);
    }
    setBusy(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSent(false);
  }

  if (mode === 'forgot') {
    return (
      <AuthShell title="Reset your password" subtitle="We will email you a link to set a new password.">
        <form onSubmit={onSubmit} className="space-y-4">
          {sent ? (
            <FormMessage tone="success">
              If an account exists for {email.trim()}, a reset link is on its way. Check your inbox.
            </FormMessage>
          ) : (
            <>
              <Field
                id="email"
                label="Work email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <FormMessage tone="error">{error}</FormMessage>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Sending...' : 'Send reset link'}
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => switchMode('sign-in')}
            className="block w-full text-center text-xs font-medium text-accent hover:underline"
          >
            Back to sign in
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Staff access only. Accounts are created by a manager.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
        <button
          type="button"
          onClick={() => switchMode('forgot')}
          className="block w-full text-center text-xs font-medium text-accent hover:underline"
        >
          Forgot your password?
        </button>
      </form>
    </AuthShell>
  );
}
