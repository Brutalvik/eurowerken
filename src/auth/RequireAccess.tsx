import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from './AuthContext';
import type { ModuleId } from './rbac';

export function RequireAccess({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { can } = useAuth();

  if (!can(module, 'view')) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
        <Lock className="h-8 w-8 text-fg3" aria-hidden />
        <h2 className="font-display text-base font-semibold">Access restricted</h2>
        <p className="text-sm text-fg2">Your role does not have permission to view this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
