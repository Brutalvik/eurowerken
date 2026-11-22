import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { UserX } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const user = useCurrentUser();
  const { profileError } = useAuth();
  const { pathname } = useLocation();

  // Phone drawer: close on navigation and on Escape.
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Not in a workshop yet: choose one first (or finish a saved invite).
  if (!user.workshop && !profileError) return <Navigate to="/onboarding" replace />;

  return (
    // 100dvh follows mobile browser toolbars; h-screen would hide the bottom under them.
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setNavOpen(true)} />
        <main className="pb-safe flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:p-6">
          {user.role ? (
            <Outlet />
          ) : (
            <NoRoleNotice active={user.active} error={profileError} workshopName={user.workshop?.name ?? null} />
          )}
        </main>
      </div>
    </div>
  );
}

function NoRoleNotice({
  active,
  error,
  workshopName,
}: {
  active: boolean;
  error: string | null;
  workshopName: string | null;
}) {
  const { cancelJoinRequest } = useAuth();
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  let title = 'Waiting for approval';
  let message = `Your request to join ${workshopName ?? 'the workshop'} has been sent. Its manager needs to approve it and assign your role.`;
  let canCancel = true;
  if (!active) {
    title = 'Account deactivated';
    message = 'Your account has been deactivated. Ask a manager if you think this is a mistake.';
    canCancel = false;
  }
  if (error) {
    title = 'Something went wrong';
    message = `Your profile could not be loaded: ${error}`;
    canCancel = false;
  }

  async function onCancel() {
    setBusy(true);
    const err = await cancelJoinRequest();
    setBusy(false);
    if (err) setCancelError(err);
    // On success the profile has no workshop and the layout sends the user to onboarding.
  }

  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
      <UserX className="h-8 w-8 text-fg3" aria-hidden />
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-fg2">{message}</p>
      {canCancel && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onCancel()}>
          Wrong workshop? Cancel request
        </Button>
      )}
      {cancelError && <p className="text-xs text-bad">{cancelError}</p>}
    </div>
  );
}
