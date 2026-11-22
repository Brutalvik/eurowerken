import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { fetchInvitePreview } from '@/lib/invites';
import type { InvitePreview } from '@/lib/invites';
import { writePendingInvite } from '@/lib/supabase';
import { AuthAlert, AuthLoader, AuthShell, PrimaryButton, TextButton, authButtonClass } from './AuthUI';

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

  if (preview === undefined || status === 'loading') return <AuthLoader />;

  if (!preview || preview.status !== 'valid') {
    const reason =
      preview?.status === 'used'
        ? 'This invite has already been used.'
        : preview?.status === 'expired'
          ? 'This invite has expired. Ask your manager to send a new one.'
          : 'This invite link is not valid. Check that you copied all of it.';
    return (
      <AuthShell title="Invite unavailable" subtitle={reason}>
        <Link to="/dashboard" className={authButtonClass.primary}>
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
            className={authButtonClass.primary}
          >
            Create an account
          </Link>
          <Link
            to="/login"
            state={{ from: `/invite/${token}` }}
            className={authButtonClass.secondary}
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
            <AuthAlert>
              You are signed in as {user.email}. Sign out and sign in as {preview.email} to accept.
            </AuthAlert>
            <PrimaryButton type="button" onClick={() => void signOut()}>
              Sign out
            </PrimaryButton>
          </>
        ) : (
          <>
            {user.workshop && user.workshop.name !== preview.workshopName && (
              <AuthAlert>
                You already belong to {user.workshop.name}. An account can belong to one workshop.
              </AuthAlert>
            )}
            {error && <AuthAlert>{error}</AuthAlert>}
            <PrimaryButton type="button" busy={busy} busyLabel="Joining..." onClick={() => void onAccept()}>
              {`Accept and join as ${preview.role}`}
            </PrimaryButton>
          </>
        )}
        <div className="flex justify-center">
          <TextButton onClick={() => void onDecline()} className="text-sm text-fg2 hover:text-fg">
            Not now
          </TextButton>
        </div>
      </div>
    </AuthShell>
  );
}
