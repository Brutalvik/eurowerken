import { useEffect, useState } from 'react';
import { listVehicles } from '@/api/vehicles';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { useSite } from '@/site/SiteContext';
import { WelcomeCard } from './AccountUI';

/**
 * The welcome step after a sign-in or a verified code: real progress from the
 * customer auth context (account, link to this workshop) and a vehicles
 * fetch, then onDone.
 */
export function WelcomeStep({ isNew, email, onDone }: { isNew: boolean; email: string; onDone: () => void }) {
  const site = useSite();
  const { status, account, displayName, initials, setupProgress } = useCustomerAuth();
  const ready = status === 'signed-in';
  const accountId = account?.id ?? null;
  const [vehiclesDone, setVehiclesDone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!accountId) {
      setVehiclesDone(true);
      return;
    }
    let cancelled = false;
    // The result is not kept: the garage loads its own list. This only waits for it to be reachable.
    void listVehicles(accountId).then(() => {
      if (!cancelled) setVehiclesDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, accountId]);

  const firstName = ready ? displayName.trim().split(/\s+/)[0] : null;

  return (
    <WelcomeCard
      title={`${isNew ? 'Welcome' : 'Welcome back'}${firstName ? `, ${firstName}` : ''}`}
      subtitle={`Opening your garage at ${site.display_name}`}
      email={account?.email || email.trim()}
      initials={ready ? initials : '?'}
      avatarUrl={account?.avatar_url}
      steps={[
        { label: 'Account', done: setupProgress.account },
        { label: `Linking to ${site.display_name}`, done: setupProgress.linked },
        { label: 'Vehicles', done: ready && vehiclesDone },
      ]}
      onDone={onDone}
    />
  );
}
