import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { sitePath, useSite } from '@/site/SiteContext';
import { useCustomerAuth } from './CustomerAuthContext';

/** Pages for signed-in customers only. Signed-out visitors go to sign in and come back after. */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const site = useSite();
  const { status } = useCustomerAuth();
  const { pathname, search } = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading your account">
        <Loader2 className="h-6 w-6 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }
  if (status === 'signed-out') {
    return <Navigate to={`${sitePath(site, 'login')}?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  if (status === 'recovery') return <Navigate to={sitePath(site, 'reset-password')} replace />;
  return <>{children}</>;
}
