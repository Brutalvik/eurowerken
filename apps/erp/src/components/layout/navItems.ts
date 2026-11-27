import { useMemo } from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Contact,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { MODULE_LABELS, MODULE_ORDER } from '@/auth/rbac';
import type { ModuleId } from '@/auth/rbac';
import { EXTRA_PAGES, HELP_PAGE } from '@/config/nav';

export const NAV_ICONS: Record<ModuleId, LucideIcon> = {
  dashboard: LayoutDashboard,
  inventory: Boxes,
  'repair-orders': Wrench,
  customers: Contact,
  sales: BadgeDollarSign,
  invoices: FileText,
  reports: BarChart3,
  users: ShieldCheck,
  settings: Settings,
};

export interface NavItem {
  /** Route path without the slash, e.g. "appointments". */
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The pages this person may open, in sidebar order: their modules, the extra pages that borrow a module's access,
 * Platform admin for platform admins, and Help last. Shared by the sidebar, the phone tab bar and voice commands.
 */
export function useNavItems(): NavItem[] {
  const { accessFor, isPlatformAdmin } = useAuth();
  const access = MODULE_ORDER.map((m) => accessFor(m)).join('|');
  return useMemo(() => {
    const items: NavItem[] = [];
    for (const module of MODULE_ORDER) {
      if (accessFor(module) !== 'none') {
        items.push({ key: module, to: `/${module}`, label: MODULE_LABELS[module], icon: NAV_ICONS[module] });
      }
      for (const extra of EXTRA_PAGES) {
        if (extra.after === module && accessFor(extra.module) !== 'none') {
          items.push({ key: extra.path, to: `/${extra.path}`, label: extra.label, icon: extra.icon });
        }
      }
    }
    if (isPlatformAdmin) items.push({ key: 'admin', to: '/admin', label: 'Platform admin', icon: ShieldAlert });
    items.push({ key: HELP_PAGE.path, to: `/${HELP_PAGE.path}`, label: HELP_PAGE.label, icon: HELP_PAGE.icon });
    return items;
    // accessFor changes identity on every render in some auth setups; the joined access string is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, isPlatformAdmin]);
}
