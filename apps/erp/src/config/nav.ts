import { CalendarDays } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModuleId } from '@/auth/rbac';

/**
 * Pages that are not modules of the permission matrix but borrow one
 * module's access (view to see, full to change). The sidebar places each
 * right after the module named in `after`; the header shows its label.
 */
export interface ExtraPage {
  path: string;
  label: string;
  icon: LucideIcon;
  module: ModuleId;
  after: ModuleId;
}

export const EXTRA_PAGES: ExtraPage[] = [
  { path: 'appointments', label: 'Appointments', icon: CalendarDays, module: 'repair-orders', after: 'dashboard' },
];

export function extraPage(path: string): ExtraPage | undefined {
  return EXTRA_PAGES.find((p) => p.path === path);
}
