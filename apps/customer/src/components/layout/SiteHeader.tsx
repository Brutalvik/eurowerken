import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, Moon, Search, ShoppingCart, Sun, User, X } from 'lucide-react';
import { useCart } from '@/cart/CartContext';
import { sitePath, useSite } from '@/site/SiteContext';
import { useTheme } from '@/theme/ThemeProvider';
import { Wordmark } from '../Wordmark';
import { NAV } from './nav';

const iconButton =
  'flex h-10 w-10 items-center justify-center rounded-xl text-fg2 transition hover:bg-surface2 hover:text-fg';

export function SiteHeader() {
  const site = useSite();
  const { mode, toggle } = useTheme();
  const { count } = useCart();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

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
    <header className="pt-safe sticky top-0 z-40 border-b border-line/70 bg-surface/85 backdrop-blur-xl">
      <div className="container-site flex h-16 items-center gap-3 xl:h-[76px]">
        <Link to={sitePath(site)} aria-label={`${site.display_name} home`} className="min-w-0 shrink-0">
          <Wordmark site={site} />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-0.5 xl:flex 2xl:ml-8 2xl:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              to={sitePath(site, item.path)}
              end={item.path === ''}
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
          <Link to={sitePath(site, 'garage')} aria-label="My account" className={`${iconButton} hidden sm:flex`}>
            <User className="h-[18px] w-[18px]" />
          </Link>
          <Link to={sitePath(site, 'book')} className="btn-ink ml-1 hidden whitespace-nowrap px-4 py-2.5 md:inline-flex">
            Book Appointment
          </Link>
          <Link to={sitePath(site, 'garage')} className="btn-outline hidden whitespace-nowrap px-4 py-2.5 shadow-none 2xl:inline-flex">
            Dashboard
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`${iconButton} xl:hidden`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Phones and tablets: full-width menu under the header. */}
      {open && (
        <div
          id="mobile-menu"
          className="pb-safe fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-y-auto border-t border-line bg-surface xl:hidden"
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
