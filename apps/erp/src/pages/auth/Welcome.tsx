import { useAuth } from '@/auth/AuthContext';
import { WelcomeCard } from './AuthUI';

/**
 * The welcome step after a sign-in or a verified code: real progress from
 * AuthContext (profile, permission matrix, workshop), then onDone.
 */
export function WelcomeStep({ isNew, email, onDone }: { isNew: boolean; email: string; onDone: () => void }) {
  const { status, user, permissionsReady } = useAuth();
  const profileReady = status === 'signed-in' && Boolean(user);
  const firstName = profileReady && user ? user.name.trim().split(/\s+/)[0] : null;
  const title = `${isNew ? 'Welcome' : 'Welcome back'}${firstName ? `, ${firstName}` : ''}`;
  const workshop = profileReady ? user?.workshop : null;

  return (
    <WelcomeCard
      title={title}
      subtitle={workshop ? `Opening the ${workshop.name} workspace` : 'Opening your workspace'}
      email={user?.email || email.trim()}
      initials={user?.initials ?? '?'}
      avatarUrl={user?.avatarUrl}
      steps={[
        { label: 'Profile', done: profileReady },
        { label: 'Permissions', done: profileReady && permissionsReady },
        { label: 'Workshop', done: profileReady && permissionsReady },
      ]}
      onDone={onDone}
    />
  );
}
