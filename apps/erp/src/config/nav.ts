import { CalendarDays, History, LifeBuoy } from 'lucide-react';
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
  { path: 'service-history', label: 'Service history', icon: History, module: 'repair-orders', after: 'repair-orders' },
];

export function extraPage(path: string): ExtraPage | undefined {
  return EXTRA_PAGES.find((p) => p.path === path);
}

/** The usage guide: open to every signed-in role, not part of the permission matrix. Last in the sidebar. */
export const HELP_PAGE = { path: 'help', label: 'Help', icon: LifeBuoy } as const;
