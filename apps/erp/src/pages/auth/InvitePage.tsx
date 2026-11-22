import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { fetchInvitePreview } from '@/lib/invites';
import type { InvitePreview } from '@/lib/invites';
import { writePendingInvite } from '@/lib/supabase';
import { AuthShell, FormMessage, FullScreenLoader } from './AuthShell';

/**
 * /invite/:token. Shows who invited you and as what. Signed out: create an
 * account or sign in, then come back here. Signed in: accept.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { status, user, acceptInvite, signOut } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchInvitePreview(token).then((p) => {
      setPreview(p);
      // Remember a usable invite across sign-up, email confirmation and Google redirects.
      writePendingInvite(p?.status === 'valid' ? token : null);
    });
  }, [token]);

  if (preview === undefined || status === 'loading') return <FullScreenLoader />;

  if (!preview || preview.status !== 'valid') {
    const reason =
      preview?.status === 'used'
        ? 'This invite has already been used.'
        : preview?.status === 'expired'
          ? 'This invite has expired. Ask your manager to send a new one.'
          : 'This invite link is not valid. Check that you copied all of it.';
    return (
      <AuthShell title="Invite unavailable" subtitle={reason}>
        <Link to="/dashboard" className="text-sm font-medium text-accent hover:underline">
          Continue to the app
        </Link>
      </AuthShell>
    );
  }

  const heading = `Join ${preview.workshopName}`;
  const detail = `You have been invited as ${preview.role}. This invite is for ${preview.email}.`;

  if (status !== 'signed-in' || !user) {
    return (
      <AuthShell title={heading} subtitle={detail}>
        <div className="space-y-3">
          <Link
            to={`/register?invite=${token}`}
            className="flex w-full items-center justify-center rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Create an account
          </Link>
          <Link
            to="/login"
            state={{ from: `/invite/${token}` }}
            className="flex w-full items-center justify-center rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-fg2 hover:bg-surface2 hover:text-fg"
          >
            I already have an account
          </Link>
        </div>
      </AuthShell>
    );
  }

  const wrongEmail = user.email.toLowerCase() !== preview.email.toLowerCase();

  async function onAccept() {
    setBusy(true);
    setError(null);
    const err = await acceptInvite(token);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    writePendingInvite(null);
    navigate('/dashboard', { replace: true });
  }

  async function onDecline() {
    writePendingInvite(null);
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthShell title={heading} subtitle={detail}>
      <div className="space-y-3">
        {wrongEmail ? (
          <>
            <FormMessage tone="error">
              You are signed in as {user.email}. Sign out and sign in as {preview.email} to accept.
            </FormMessage>
            <Button className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            {user.workshop && user.workshop.name !== preview.workshopName && (
              <FormMessage tone="error">
                You already belong to {user.workshop.name}. An account can belong to one workshop.
              </FormMessage>
            )}
            {error && <FormMessage tone="error">{error}</FormMessage>}
            <Button className="w-full" disabled={busy} onClick={() => void onAccept()}>
              {busy ? 'Joining...' : `Accept and join as ${preview.role}`}
            </Button>
          </>
        )}
        <button
          type="button"
          onClick={() => void onDecline()}
          className="block w-full text-center text-xs font-medium text-fg2 hover:text-fg"
        >
          Not now
        </button>
      </div>
    </AuthShell>
  );
}
