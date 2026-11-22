import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { readPendingInvite } from '@/lib/supabase';
import { AuthAlert, AuthField, AuthSegmented, AuthShell, PrimaryButton, TextButton } from './AuthUI';

type Choice = 'join' | 'create';

/**
 * For a signed-in account that is not in a workshop yet: Google sign-ups,
 * email sign-ups whose number was wrong, and anyone who cancelled a request.
 */
export function OnboardingPage() {
  const user = useCurrentUser();
  const { createWorkshop, requestJoin, signOut, isPlatformAdmin } = useAuth();
  const [choice, setChoice] = useState<Choice>('join');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user.workshop) return <Navigate to="/dashboard" replace />;
  const pendingInvite = readPendingInvite();
  if (pendingInvite) return <Navigate to={`/invite/${pendingInvite}`} replace />;
  // A platform admin needs no workshop of their own: the console is their home.
  if (isPlatformAdmin) return <Navigate to="/admin" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (choice === 'join' && !/^\d{6}$/.test(value.trim())) {
      setError('Enter the 6-digit workshop number your manager gave you.');
      return;
    }
    if (choice === 'create' && value.trim().length < 2) {
      setError('Enter a name for your workshop.');
      return;
    }
    setBusy(true);
    const err = choice === 'join' ? await requestJoin(value) : await createWorkshop(value);
    setBusy(false);
    if (err) setError(err);
    // On success the profile reloads with a workshop and the redirect above takes over.
  }

  return (
    <AuthShell
      title={`Welcome, ${user.name.split(' ')[0]}`}
      subtitle="Join your workshop with its number, or create a new workshop."
      footer={
        <TextButton onClick={() => void signOut()} className="break-all text-fg2 hover:text-fg">
          Sign out ({user.email})
        </TextButton>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthSegmented
          label="Workshop"
          value={choice}
          options={[
            ['join', 'Join existing'],
            ['create', 'Create new'],
          ]}
          onChange={(v) => {
            setChoice(v);
            setValue('');
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
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          />
        ) : (
          <AuthField
            id="workshop-name"
            label="Workshop name"
            placeholder="For example, Bravo Motors"
            maxLength={80}
            required
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <p className="px-1 text-xs text-fg3">
          {choice === 'join'
            ? 'The workshop manager approves your request and assigns your role.'
            : 'You become the Manager of the new workshop and can invite your team.'}
        </p>
        {error && <AuthAlert>{error}</AuthAlert>}
        <PrimaryButton busy={busy} busyLabel="Please wait...">
          {choice === 'join' ? 'Request to join' : 'Create workshop'}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
