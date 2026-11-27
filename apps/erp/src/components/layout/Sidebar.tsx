import { useCallback, useEffect, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useNotifications } from '@/notifications/NotificationsContext';
import { LogOut, PanelLeftClose, PanelLeftOpen, Wrench } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { LegalFooter } from '@/pages/legal/LegalPage';
import { useNavItems } from './navItems';

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

const COLLAPSED_KEY = 'ew-erp-sidebar-collapsed';

/** Desktop only: the sidebar folded down to an icon rail. Remembered on this device. */
function useCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // Not saved; the choice lasts until reload.
      }
      return !c;
    });
  }, []);
  return [collapsed, toggle];
}

/** True while the sidebar shows icons only: tablets always, desktops when collapsed. */
function useRail(collapsed: boolean): boolean {
  const query = collapsed ? '(min-width: 768px)' : '(min-width: 768px) and (max-width: 1023.98px)';
  const [rail, setRail] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setRail(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return rail;
}

interface Tip {
  label: string;
  top: number;
  left: number;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { signOut, isPlatformAdmin, acting } = useAuth();
  const user = useCurrentUser();
  const { unopened } = useNotifications();
  const [collapsed, toggleCollapsed] = useCollapsed();
  const rail = useRail(collapsed);
  const [tip, setTip] = useState<Tip | null>(null);
  // Desktop classes that copy the tablet rail while collapsed (written out so Tailwind keeps them).
  const lg = (cls: string) => (collapsed ? cls : '');

  useEffect(() => {
    if (!rail) setTip(null);
  }, [rail]);

  const showTip = (label: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!rail) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);

  const items = useNavItems();

  return (
    // Phone (< md): slide-out drawer. Tablet (md to lg): icon rail. Desktop (lg+): full sidebar.
    <aside
      aria-label="Sidebar"
      className={`glass-strong pt-safe pb-safe pl-safe fixed inset-y-0 left-0 z-40 flex w-72 flex-col rounded-r-3xl text-fg transition-[transform,width] duration-200 md:static md:my-3 md:ml-3 md:w-[72px] md:translate-x-0 md:rounded-3xl ${
        collapsed ? 'lg:w-[72px]' : 'lg:w-60'
      } ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className={`flex items-center gap-2.5 px-4 pb-4 pt-5 md:max-lg:justify-center md:max-lg:px-0 ${lg('lg:flex-col lg:justify-center lg:px-0')}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">
          <Wrench className="h-4 w-4 text-accent-fg" aria-hidden />
        </span>
        <div className={`min-w-0 md:max-lg:hidden ${lg('lg:hidden')}`}>
          <div className="font-display text-[17px] font-bold leading-none tracking-tight">
            {BRAND.prefix}
            <span className="text-accent">{BRAND.suffix}</span>
          </div>
          <div className="mt-1 text-[11px] text-fg2">{BRAND.product}</div>
        </div>
        {/* Desktop: fold the sidebar to icons, or open it again. */}
        <button
          type="button"
          onClick={() => {
            hideTip();
            toggleCollapsed();
          }}
          onMouseEnter={showTip('Expand sidebar')}
          onMouseLeave={hideTip}
          onFocus={showTip('Expand sidebar')}
          onBlur={hideTip}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? undefined : 'Collapse sidebar'}
          className={`hidden rounded-lg p-1.5 text-fg3 transition hover:bg-fg/10 hover:text-fg lg:flex ${collapsed ? '' : 'ml-auto'}`}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      {user.workshop && (
        <div className={`mx-4 border-b border-line/50 pb-3 md:max-lg:hidden ${lg('lg:hidden')}`}>
          <div className="truncate text-xs font-semibold text-fg" title={user.workshop.name}>
            {user.workshop.name}
          </div>
          <div className="text-[11px] text-fg2">Workshop No. {user.workshop.number}</div>
          {acting && <div className="mt-0.5 text-[10px] font-semibold text-warn">(support session)</div>}
        </div>
      )}

      <nav aria-label="Main" className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.to}
              onClick={() => {
                hideTip();
                onNavigate();
              }}
              onMouseEnter={showTip(item.label)}
              onMouseLeave={hideTip}
              onFocus={showTip(item.label)}
              onBlur={hideTip}
              aria-label={rail ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition coarse:min-h-11 md:max-lg:justify-center md:max-lg:px-0 ${lg('lg:justify-center lg:px-0')} ${
                  isActive ? 'glass-active font-semibold' : 'text-fg2 hover:bg-fg/[0.06] hover:text-fg'
                }`
              }
            >
              <span className="relative">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.key === 'appointments' && unopened > 0 && (
                  // Tablet rail: a small dot on the icon (the full count shows beside the label elsewhere).
                  <span className={`absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-bad md:max-lg:block ${lg('lg:block')}`} aria-hidden />
                )}
              </span>
              <span className={`md:max-lg:sr-only ${lg('lg:sr-only')}`}>{item.label}</span>
              {item.key === 'appointments' && unopened > 0 && (
                <span
                  className={`ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1.5 text-[10px] font-bold leading-none text-white md:max-lg:hidden ${lg('lg:hidden')}`}
                  aria-label={`${unopened} new`}
                >
                  {unopened > 99 ? '99+' : unopened}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={`glass-field mx-3 mb-2 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 md:max-lg:mx-2 md:max-lg:flex-col md:max-lg:px-1 ${lg('lg:mx-2 lg:flex-col lg:px-1')}`}>
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-line/60"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/25 text-[11px] font-bold text-fg">
            {user.initials}
          </span>
        )}
        <div className={`min-w-0 flex-1 md:max-lg:hidden ${lg('lg:hidden')}`}>
          <div className="truncate text-[13px] font-semibold">{user.name}</div>
          <div className="truncate text-[11px] text-fg2">{user.role ?? (isPlatformAdmin ? 'Platform admin' : user.suspended ? 'Workshop suspended' : 'Awaiting approval')}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          onMouseEnter={showTip('Sign out')}
          onMouseLeave={hideTip}
          onFocus={showTip('Sign out')}
          onBlur={hideTip}
          title={rail ? undefined : 'Sign out'}
          className={`rounded-lg p-1.5 text-fg3 transition hover:bg-fg/10 hover:text-fg coarse:p-2.5 md:max-lg:mx-auto ${collapsed ? 'lg:mx-auto' : 'lg:ml-auto'}`}
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <LegalFooter className={`px-4 pb-3 md:max-lg:hidden ${lg('lg:hidden')}`} />
      {rail &&
        tip &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="glass-strong pointer-events-none fixed z-[60] -translate-y-1/2 animate-fade-in whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg"
          >
            {tip.label}
          </div>,
          document.body,
        )}
    </aside>
  );
}
