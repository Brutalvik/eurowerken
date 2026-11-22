import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Car, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { sitePath, useSite } from '@/site/SiteContext';

/** The customer's photo (from Google) or their initials. */
export function Avatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { account, initials } = useCustomerAuth();
  const [broken, setBroken] = useState(false);
  const box = size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-xs';
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

/** Signed-in account button in the header: a disclosure with My Garage, Account and Sign out. */
export function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const site = useSite();
  const { displayName, account } = useCustomerAuth();
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
        aria-label={`Account menu for ${displayName}`}
        className="flex h-10 items-center gap-1 rounded-xl px-1 text-fg2 transition hover:bg-surface2 hover:text-fg"
      >
        <Avatar size="sm" />
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={menuId} className="glass-strong absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl p-2">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
            {account?.email && <p className="truncate text-xs text-fg3">{account.email}</p>}
          </div>
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
