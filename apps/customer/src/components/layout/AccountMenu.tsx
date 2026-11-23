import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BellRing, Car, ChevronDown, LogOut, MessageSquare, UserRound } from 'lucide-react';
import { alertAge, useCustomerAlerts } from '@/auth/CustomerAlerts';
import type { CustomerAlert } from '@/auth/CustomerAlerts';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { sitePath, useSite } from '@/site/SiteContext';

/** The customer's photo (from Google) or their initials. */
export function Avatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { account, initials } = useCustomerAuth();
  const [broken, setBroken] = useState(false);
  const box = size === 'sm' ? 'h-8 w-8 text-[11px]' : size === 'lg' ? 'h-20 w-20 text-xl' : 'h-9 w-9 text-xs';
  const url = account?.avatar_url;
  useEffect(() => setBroken(false), [url]);
  if (url && !broken) {
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${box} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span aria-hidden className={`${box} flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-fg`}>
      {initials}
    </span>
  );
}

/** Red count bubble for unread alerts; nothing when there are none. */
export function AlertCount({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-black/60 ${className}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/** The newest alert as a menu row: what happened, a short preview, and a link to that repair's messages. */
export function LatestAlertLink({ alert, more, className = '' }: { alert: CustomerAlert; more: number; className?: string }) {
  const site = useSite();
  if (!alert.repair) return null;
  const Icon = alert.kind === 'approval' ? BellRing : MessageSquare;
  return (
    <Link
      to={sitePath(site, `track/${encodeURIComponent(alert.repair.tracking_code)}#messages`)}
      className={`flex w-full items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-left transition hover:bg-red-500/15 focus-visible:bg-red-500/15 coarse:min-h-11 ${className}`}
    >
      <span className="relative mt-0.5 shrink-0">
        <Icon className="h-4 w-4 text-red-500" aria-hidden />
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-600" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{alert.title}</span>
        <span className="mt-0.5 line-clamp-2 block break-words text-xs text-fg2">{alert.body}</span>
        <span className="mt-1 block text-[11px] text-fg3">
          {alert.repair.number}
          <span aria-hidden> · </span>
          {alertAge(alert.created_at)}
          {more > 0 && (
            <>
              <span aria-hidden> · </span>
              {more} more
            </>
          )}
        </span>
      </span>
    </Link>
  );
}

/** Signed-in account button in the header: a disclosure with My Garage, Account and Sign out. */
export function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const site = useSite();
  const { displayName, account } = useCustomerAuth();
  const { alerts, unread } = useCustomerAlerts();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-fg transition hover:bg-surface2 focus-visible:bg-surface2 coarse:min-h-11';

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${displayName}${unread > 0 ? `, ${unread} new notification${unread === 1 ? '' : 's'}` : ''}`}
        className="flex h-10 items-center gap-1 rounded-xl px-1 text-fg2 transition hover:bg-surface2 hover:text-fg"
      >
        <span className="relative">
          <Avatar size="sm" />
          <AlertCount count={unread} className="absolute -right-1.5 -top-1.5" />
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={menuId} className="glass-menu absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl p-2">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
            {account?.email && <p className="truncate text-xs text-fg3">{account.email}</p>}
          </div>
          {alerts[0] && (
            <div className="border-b border-line py-2">
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg3">New notification</p>
              <LatestAlertLink alert={alerts[0]} more={alerts.length - 1} />
            </div>
          )}
          <ul className="pt-1">
            <li>
              <Link to={sitePath(site, 'garage')} className={item}>
                <Car className="h-4 w-4 text-fg3" aria-hidden />
                My Garage
              </Link>
            </li>
            <li>
              <Link to={sitePath(site, 'account')} className={item}>
                <UserRound className="h-4 w-4 text-fg3" aria-hidden />
                Account
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className={item}
              >
                <LogOut className="h-4 w-4 text-fg3" aria-hidden />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
