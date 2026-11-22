import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Ban, ShieldAlert, UserX } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { Header } from './Header';
import { PageBoundary } from './PageBoundary';
import { Sidebar } from './Sidebar';
import { NotificationsProvider } from '@/notifications/NotificationsContext';

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const user = useCurrentUser();
  const { profileError, isPlatformAdmin, acting } = useAuth();
  const { pathname } = useLocation();
  const onAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  // Phone drawer: close on navigation and on Escape.
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Not in a workshop yet: choose one first (or finish a saved invite). A platform admin
  // needs no workshop of their own and goes to the console instead.
  if (!user.workshop && !profileError) {
    if (!isPlatformAdmin) return <Navigate to="/onboarding" replace />;
    if (!onAdmin) return <Navigate to="/admin" replace />;
  }

  return (
    // 100dvh follows mobile browser toolbars; h-screen would hide the bottom under them.
    <NotificationsProvider>
      <div className="flex h-[100dvh] overflow-hidden">
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
          {acting && <ActingBanner workshopName={user.workshop?.name ?? 'this workshop'} />}
          <Header onMenuClick={() => setNavOpen(true)} safeTop={!acting} />
          <main className="pb-safe flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:p-6">
            {user.role || (isPlatformAdmin && onAdmin) ? (
              <PageBoundary resetKey={pathname}>
                <Outlet />
              </PageBoundary>
            ) : user.suspended && !profileError ? (
              <SuspendedNotice />
            ) : (
              <NoRoleNotice active={user.active} error={profileError} workshopName={user.workshop?.name ?? null} />
            )}
          </main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

/** Shown while a platform admin acts as Manager of a workshop. Stays above the page; the page scrolls under it. */
function ActingBanner({ workshopName }: { workshopName: string }) {
  const { stopActing } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExit() {
    setBusy(true);
    setError(null);
    const err = await stopActing();
    setBusy(false);
    if (err) setError(err);
    else navigate('/admin', { replace: true });
  }

  return (
    <div role="region" aria-label="Support session" className="glass-strong pt-safe relative z-20 shrink-0 border-x-0 border-t-0 !border-b-warn/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-warn/15 px-4 py-1.5 lg:px-6">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warn" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-fg">
          Acting as Manager in <span className="font-semibold">{workshopName}</span>
          <span className="text-fg2"> · Everything you do is recorded</span>
          {error && <span className="block text-bad">{error}</span>}
        </p>
        <Button
          variant="ghost"
          onClick={() => void onExit()}
          disabled={busy}
          className="min-h-11 shrink-0 border-warn/50 !text-fg"
        >
          {busy ? 'Exiting...' : 'Exit'}
        </Button>
      </div>
    </div>
  );
}

function SuspendedNotice() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
      <Ban className="h-8 w-8 text-bad" aria-hidden />
      <h2 className="font-display text-base font-semibold">Workshop suspended</h2>
      <p className="max-w-sm text-sm text-fg2">
        This workshop is suspended. Contact EuroWerken support.
      </p>
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
