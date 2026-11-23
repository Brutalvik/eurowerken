import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Car, Globe, LogIn, LogOut, Menu, Moon, Search, ShoppingCart, Star, Sun, UserRound, X } from 'lucide-react';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { useResolvedCart } from '@/cart/CartContext';
import { sitePath, useSite } from '@/site/SiteContext';
import { useTheme } from '@/theme/ThemeProvider';
import { Wordmark } from '../Wordmark';
import { AccountMenu, AlertCount, Avatar, LatestAlertLink } from './AccountMenu';
import { useCustomerAlerts } from '@/auth/CustomerAlerts';
import { NAV } from './nav';

const iconButtonBase =
  'flex h-10 w-10 items-center justify-center rounded-xl text-fg2 transition hover:bg-surface2 hover:text-fg';
/** Liquid-glass style: round icon buttons inside the floating glass pill. */
const iconButtonPill =
  'flex h-10 w-10 items-center justify-center rounded-full text-fg2 transition hover:bg-white/10 hover:text-fg';

export function SiteHeader() {
  const site = useSite();
  // Navigation style chosen by the workshop in the ERP (Settings, Website).
  const classic = site.nav_style === 'classic';
  // Liquid-glass style: a floating glass pill at the top (with the tab bar at the bottom).
  // Classic style: the original full-width header with every section in it.
  const pill = !classic;
  const iconButton = pill ? iconButtonPill : iconButtonBase;
  const { mode, toggle } = useTheme();
  const { count } = useResolvedCart();
  const { pathname } = useLocation();
  // My Garage has its own Book button, so the header doesn't repeat it there.
  const onGarage = pathname.replace(/\/+$/, '') === sitePath(site, 'garage').replace(/\/+$/, '');
  const [open, setOpen] = useState(false);
  const { status, signOut } = useCustomerAuth();
  const navigate = useNavigate();
  const signedIn = status === 'signed-in' || status === 'recovery';
  const { unread } = useCustomerAlerts();

  async function onSignOut() {
    setOpen(false);
    await signOut();
    navigate(sitePath(site), { replace: true });
  }

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={
        pill
          ? // Liquid-glass style: a floating dark glass pill with a gap around it.
            // Negative bottom margin: the pill floats over the page, so no strip of page background shows behind it.
            'pt-safe sticky top-0 z-40 -mb-[calc(4.25rem+env(safe-area-inset-top))] px-3 pt-3 sm:px-4 xl:-mb-[calc(4.5rem+env(safe-area-inset-top))]'
          : 'pt-safe sticky top-0 z-40 border-b border-line/70'
      }
    >
      {/* The frosting sits on its own layer, not on the header or the pill: a browser cannot blur through two
          nested frosted layers, so the account menu inside would show the page through it, unblurred. */}
      {!pill && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-surface/85 backdrop-blur-xl" />}
      <div
        className={
          pill
            ? 'dark relative z-0 mx-auto flex h-14 max-w-7xl items-center gap-2 rounded-full border border-white/10 pl-4 pr-2 text-fg sm:gap-3 xl:h-[60px]'
            : 'container-site flex h-16 items-center gap-3 xl:h-[76px]'
        }
      >
        {pill && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-black/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(255,255,255,0.04),0_14px_40px_rgba(0,0,0,0.28)] backdrop-blur-2xl backdrop-saturate-150"
          />
        )}
        <Link to={sitePath(site)} aria-label={`${site.display_name} home`} className="min-w-0 shrink-0">
          <Wordmark site={site} />
        </Link>

{classic ? (
        <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-0.5 xl:flex 2xl:ml-8 2xl:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              to={sitePath(site, item.path)}
              end={item.path.length === 0}
              className={({ isActive }) =>
                `relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition 2xl:px-4 ${
                  isActive
                    ? 'text-accent after:absolute after:inset-x-2.5 after:-bottom-[18px] after:h-0.5 after:rounded after:bg-accent 2xl:after:inset-x-4'
                    : 'text-fg hover:text-accent'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        ) : (
          // Tab-bar mode: the main sections live in the bottom bar; Experts sits under Services.
          // Reviews gets a small glass chip here (it will show the real average once reviews are stored).
          <div className="ml-3 hidden flex-1 sm:flex">
            <NavLink
              to={sitePath(site, 'reviews')}
              className={({ isActive }) =>
                `glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition hover:text-fg coarse:min-h-11 ${
                  isActive ? 'text-accent' : 'text-fg2'
                }`
              }
            >
              <Star className="h-3.5 w-3.5 fill-warn text-warn" aria-hidden />
              Reviews
            </NavLink>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <Link to={sitePath(site, 'parts')} aria-label="Search parts" className={`${iconButton} hidden sm:flex`}>
            <Search className="h-[18px] w-[18px]" />
          </Link>
          <Link to={sitePath(site, 'cart')} aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`} className={`${iconButton} relative`}>
            <ShoppingCart className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`${iconButton} hidden sm:flex`}
          >
            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          {signedIn ? (
            <AccountMenu onSignOut={() => void onSignOut()} />
          ) : (
            <Link
              to={sitePath(site, 'login')}
              className={
                pill
                  ? 'hidden h-10 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium text-fg2 transition hover:text-fg sm:inline-flex'
                  : 'hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-fg transition hover:bg-surface2 sm:inline-flex'
              }
            >
              {!pill && <LogIn className="h-4 w-4" aria-hidden />}
              Sign in
            </Link>
          )}
          {!onGarage && (
          <Link
            to={sitePath(site, 'book')}
            className={
              pill
                ? 'ml-1 hidden items-center whitespace-nowrap rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg shadow-[0_6px_18px_rgba(0,0,0,0.25)] transition hover:opacity-90 coarse:min-h-11 md:inline-flex'
                : 'btn-ink ml-1 hidden whitespace-nowrap px-4 py-2.5 md:inline-flex'
            }
          >
            Book Appointment
          </Link>
          )}
          {!pill && (
            <Link to={sitePath(site, 'garage')} className="btn-outline hidden whitespace-nowrap px-4 py-2.5 shadow-none 2xl:inline-flex">
              Dashboard
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : `Open menu${signedIn && unread > 0 ? `, ${unread} new notification${unread === 1 ? '' : 's'}` : ''}`}
            className={`${iconButton} relative xl:hidden`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            {/* Phones: the account menu lives in here, so the count shows on this button. */}
            {signedIn && !open && <AlertCount count={unread} className="absolute -right-0.5 -top-0.5 sm:hidden" />}
          </button>
        </div>
      </div>

      {/* Phones and tablets: full-width menu under the header. */}
      {open && (
        <div
          id="mobile-menu"
          className={
            pill
              ? 'dark pb-safe fixed inset-x-3 bottom-3 top-[calc(4.75rem+env(safe-area-inset-top))] overflow-y-auto rounded-3xl border border-white/10 bg-black/75 text-fg shadow-2xl backdrop-blur-2xl backdrop-saturate-150 sm:inset-x-4 xl:hidden'
              : 'pb-safe fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto border-t border-white/30 bg-surface/90 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-surface/85 xl:hidden'
          }
        >
          <nav aria-label="Mobile" className="container-site flex flex-col py-4">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                to={sitePath(site, item.path)}
                end={item.path === ''}
                className={({ isActive }) =>
                  `border-b border-line py-4 font-display text-lg font-semibold ${isActive ? 'text-accent' : 'text-fg'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link to={sitePath(site, 'book')} className="btn-ink">
                Book Appointment
              </Link>
              <Link to={sitePath(site, 'garage')} className="btn-outline">
                My Garage
              </Link>
            </div>
            {site.own_website_url && (
              <a
                href={site.own_website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center gap-2 text-sm font-semibold text-accent coarse:min-h-11"
              >
                <Globe className="h-4 w-4" aria-hidden />
                Visit our website
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <MobileAccount signedIn={signedIn} loginHref={sitePath(site, 'login')} onSignOut={() => void onSignOut()} />
            <button type="button" onClick={toggle} className="mt-6 flex items-center gap-2 text-sm font-medium text-fg2">
              {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {mode === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

function MobileAccount({ signedIn, loginHref, onSignOut }: { signedIn: boolean; loginHref: string; onSignOut: () => void }) {
  const site = useSite();
  const { displayName, account } = useCustomerAuth();
  const { alerts } = useCustomerAlerts();
  const row = 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-fg transition hover:bg-surface2 coarse:min-h-11';

  if (!signedIn) {
    return (
      <div className="mt-6 rounded-2xl border border-line p-2">
        <Link to={loginHref} className={row}>
          <LogIn className="h-4 w-4 text-fg3" aria-hidden />
          Sign in
        </Link>
        <Link to={sitePath(site, 'register')} className={row}>
          <UserRound className="h-4 w-4 text-fg3" aria-hidden />
          Create an account
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-2xl border border-line p-2">
      <div className="flex items-center gap-3 px-3 py-2">
        <Avatar />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
          {account?.email && <p className="truncate text-xs text-fg3">{account.email}</p>}
        </div>
      </div>
      {alerts[0] && <LatestAlertLink alert={alerts[0]} more={alerts.length - 1} className="my-1" />}
      <Link to={sitePath(site, 'garage')} className={row}>
        <Car className="h-4 w-4 text-fg3" aria-hidden />
        My Garage
      </Link>
      <Link to={sitePath(site, 'account')} className={row}>
        <UserRound className="h-4 w-4 text-fg3" aria-hidden />
        Account
      </Link>
      <button type="button" onClick={onSignOut} className={`${row} w-full text-left`}>
        <LogOut className="h-4 w-4 text-fg3" aria-hidden />
        Sign out
      </button>
    </div>
  );
}
