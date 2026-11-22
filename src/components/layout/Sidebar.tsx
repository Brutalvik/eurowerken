import { NavLink } from 'react-router-dom';
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { MODULE_LABELS, MODULE_ORDER } from '@/auth/rbac';
import type { ModuleId } from '@/auth/rbac';

const NAV_ICONS: Record<ModuleId, LucideIcon> = {
  dashboard: LayoutDashboard,
  inventory: Boxes,
  'repair-orders': Wrench,
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
  const { accessFor, signOut } = useAuth();
  const user = useCurrentUser();
  const visible = MODULE_ORDER.filter((m) => accessFor(m) !== 'none');

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-white/10 bg-sidebar text-white transition-transform lg:static lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <Wrench className="h-4 w-4 text-white" aria-hidden />
        </span>
        <div>
          <div className="font-display text-[15px] font-bold leading-none">
            {BRAND.prefix}
            <span className="text-accent">{BRAND.suffix}</span>
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-widest text-white/50">{BRAND.product}</div>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {visible.map((module) => {
          const Icon = NAV_ICONS[module];
          return (
            <NavLink
              key={module}
              to={`/${module}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition ${
                  isActive ? 'bg-accent font-semibold text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {MODULE_LABELS[module]}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{user.name}</div>
          <div className="truncate text-[10px] text-white/50">{user.role ?? 'Awaiting approval'}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="ml-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
