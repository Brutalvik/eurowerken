import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { AuthShell, Field, FormMessage, FullScreenLoader } from './AuthShell';

const MIN_LENGTH = 8;

/**
 * Reached from the reset (or invite) email link. Supabase signs the user in
 * from the link and fires PASSWORD_RECOVERY; the user then sets a password.
 * A signed-in user can also use this page to change their password.
 */
export function ResetPasswordPage() {
  const { status, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <FullScreenLoader />;

  if (status === 'signed-out') {
    return (
      <AuthShell title="Link expired or invalid" subtitle="Password links work once and expire after a short time.">
        <Link to="/login" className="text-sm font-medium text-accent hover:underline">
          Back to sign in to request a new link
        </Link>
      </AuthShell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setError(err);
    else navigate('/dashboard', { replace: true });
  }

  return (
    <AuthShell title="Set a new password" subtitle={`At least ${MIN_LENGTH} characters.`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="confirm-password"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Saving...' : 'Save password'}
        </Button>
      </form>
    </AuthShell>
  );
}
