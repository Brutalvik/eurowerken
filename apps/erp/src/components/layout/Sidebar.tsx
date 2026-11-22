import { NavLink } from 'react-router-dom';
import { useNotifications } from '@/notifications/NotificationsContext';
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Contact,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { LegalFooter } from '@/pages/legal/LegalPage';
import { MODULE_LABELS, MODULE_ORDER } from '@/auth/rbac';
import type { ModuleId } from '@/auth/rbac';
import { EXTRA_PAGES } from '@/config/nav';

const NAV_ICONS: Record<ModuleId, LucideIcon> = {
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

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { accessFor, signOut, isPlatformAdmin, acting } = useAuth();
  const user = useCurrentUser();
  const { unopened } = useNotifications();
  const items: { key: string; to: string; label: string; icon: LucideIcon }[] = [];
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

  return (
    // Phone (< md): slide-out drawer. Tablet (md to lg): icon rail. Desktop (lg+): full sidebar.
    <aside
      aria-label="Sidebar"
      className={`pt-safe pb-safe pl-safe fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-sidebar text-white transition-transform duration-200 md:static md:w-16 md:translate-x-0 lg:w-56 ${
        open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-5 md:max-lg:justify-center md:max-lg:px-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
          <Wrench className="h-4 w-4 text-white" aria-hidden />
        </span>
        <div className="md:max-lg:hidden">
          <div className="font-display text-[15px] font-bold leading-none">
            {BRAND.prefix}
            <span className="text-accent">{BRAND.suffix}</span>
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-widest text-white/50">{BRAND.product}</div>
        </div>
      </div>

      {user.workshop && (
        <div className="border-b border-white/10 px-4 py-3 md:max-lg:hidden">
          <div className="text-[9px] uppercase tracking-widest text-white/50">Workshop</div>
          <div className="mt-0.5 truncate text-xs font-semibold" title={user.workshop.name}>
            {user.workshop.name}
          </div>
          <div className="font-mono text-[10px] text-white/50">No. {user.workshop.number}</div>
          {acting && <div className="mt-0.5 text-[10px] font-semibold text-warn">(support session)</div>}
        </div>
      )}

      <nav aria-label="Main" className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.to}
              onClick={onNavigate}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition coarse:py-3 md:max-lg:justify-center md:max-lg:px-0 ${
                  isActive ? 'bg-accent font-semibold text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="relative">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.key === 'appointments' && unopened > 0 && (
                  // Tablet rail: a small dot on the icon (the full count shows beside the label elsewhere).
                  <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-bad md:max-lg:block" aria-hidden />
                )}
              </span>
              <span className="md:max-lg:sr-only">{item.label}</span>
              {item.key === 'appointments' && unopened > 0 && (
                <span
                  className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1.5 text-[10px] font-bold leading-none text-white md:max-lg:hidden"
                  aria-label={`${unopened} new`}
                >
                  {unopened > 99 ? '99+' : unopened}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3 md:max-lg:flex-col md:max-lg:px-2">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/25 text-[10px] font-bold text-white">
            {user.initials}
          </span>
        )}
        <div className="min-w-0 flex-1 md:max-lg:hidden">
          <div className="truncate text-xs font-semibold">{user.name}</div>
          <div className="truncate text-[10px] text-white/50">{user.role ?? (isPlatformAdmin ? 'Platform admin' : user.suspended ? 'Workshop suspended' : 'Awaiting approval')}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white coarse:p-2.5 md:max-lg:mx-auto lg:ml-auto"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <LegalFooter tone="sidebar" className="px-3 pb-3 md:max-lg:hidden" />
    </aside>
  );
}
