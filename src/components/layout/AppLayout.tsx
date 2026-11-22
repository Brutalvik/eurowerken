import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const user = useCurrentUser();
  const { profileError } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {user.role ? <Outlet /> : <NoRoleNotice active={user.active} error={profileError} />}
        </main>
      </div>
    </div>
  );
}

function NoRoleNotice({ active, error }: { active: boolean; error: string | null }) {
  let title = 'Waiting for approval';
  let message = 'Your account is set up. A manager needs to approve it and assign your role before you can use the console.';
  if (!active) {
    title = 'Account deactivated';
    message = 'Your account has been deactivated. Ask a manager if you think this is a mistake.';
  }
  if (error) {
    title = 'Something went wrong';
    message = `Your profile could not be loaded: ${error}`;
  }

  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
      <UserX className="h-8 w-8 text-fg3" aria-hidden />
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-fg2">{message}</p>
    </div>
  );
}
