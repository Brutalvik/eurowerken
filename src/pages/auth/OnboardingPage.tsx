import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { readPendingInvite } from '@/lib/supabase';
import { AuthShell, Field, FormMessage } from './AuthShell';

type Choice = 'join' | 'create';

/**
 * For a signed-in account that is not in a workshop yet: Google sign-ups,
 * email sign-ups whose number was wrong, and anyone who cancelled a request.
 */
export function OnboardingPage() {
  const user = useCurrentUser();
  const { createWorkshop, requestJoin, signOut } = useAuth();
  const [choice, setChoice] = useState<Choice>('join');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user.workshop) return <Navigate to="/dashboard" replace />;
  const pendingInvite = readPendingInvite();
  if (pendingInvite) return <Navigate to={`/invite/${pendingInvite}`} replace />;

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
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface2 p-1" role="radiogroup">
          {(
            [
              ['join', 'Join existing'],
              ['create', 'Create new'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={choice === v}
              onClick={() => {
                setChoice(v);
                setValue('');
                setError(null);
              }}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                choice === v ? 'bg-surface text-fg shadow-sm' : 'text-fg2 hover:text-fg'
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
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          />
        ) : (
          <Field
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
        <p className="text-[11px] text-fg3">
          {choice === 'join'
            ? 'The workshop manager approves your request and assigns your role.'
            : 'You become the Manager of the new workshop and can invite your team.'}
        </p>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait...' : choice === 'join' ? 'Request to join' : 'Create workshop'}
        </Button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="block w-full text-center text-xs font-medium text-fg2 hover:text-fg"
        >
          Sign out ({user.email})
        </button>
      </form>
    </AuthShell>
  );
}
