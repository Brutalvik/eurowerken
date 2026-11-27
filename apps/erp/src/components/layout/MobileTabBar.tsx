import { NavLink } from 'react-router-dom';
import { Menu, Mic } from 'lucide-react';
import { useNotifications } from '@/notifications/NotificationsContext';
import { useVoice } from '@/voice/VoiceProvider';
import { useNavItems } from './navItems';
import type { NavItem } from './navItems';

/** Short labels for the bar, where space is tight. */
const SHORT: Record<string, string> = {
  dashboard: 'Dashboard',
  appointments: 'Appts',
  'repair-orders': 'Repairs',
  inventory: 'Parts',
  invoices: 'Invoices',
  customers: 'Customers',
  'service-history': 'History',
  help: 'Help',
};

/** The two pages on each side of the microphone: the first ones this person may open, in this order. */
const LEFT = ['dashboard', 'appointments', 'repair-orders'];
const RIGHT = ['inventory', 'repair-orders', 'invoices', 'customers', 'service-history', 'help'];

function pick(items: NavItem[], order: string[], skip: Set<string>): NavItem | null {
  for (const key of order) {
    const item = items.find((i) => i.key === key && !skip.has(i.key));
    if (item) return item;
  }
  return null;
}

/** Phones only: a floating frosted bar with the main pages, a centred microphone and More (the full menu). */
export function MobileTabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const items = useNavItems();
  const { openVoice, supported } = useVoice();
  const { unopened } = useNotifications();

  const used = new Set<string>();
  const left: NavItem[] = [];
  for (let i = 0; i < 2; i++) {
    const item = pick(items, LEFT, used);
    if (item) {
      left.push(item);
      used.add(item.key);
    }
  }
  const right = pick(items, RIGHT, used);

  const tab = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.key}
        to={item.to}
        className={({ isActive }) =>
          `relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition ${
            isActive ? 'glass-active' : 'text-fg2 hover:text-fg'
          }`
        }
      >
        <Icon className="h-5 w-5" aria-hidden />
        <span className="max-w-full truncate">{SHORT[item.key] ?? item.label}</span>
        {item.key === 'appointments' && unopened > 0 && (
          <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-bad" aria-label={`${unopened} new`} />
        )}
      </NavLink>
    );
  };

  return (
    <nav
      aria-label="Quick navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="glass-strong pointer-events-auto mx-auto flex max-w-md items-center gap-1 rounded-3xl px-2 py-1.5">
        {left.map(tab)}
        <div className="flex w-16 shrink-0 justify-center">
          <button
            type="button"
            onClick={() => openVoice({ listen: supported })}
            aria-label={supported ? 'Voice command' : 'Type a command'}
            className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_28px_-8px_rgb(var(--accent)/0.85)] transition active:scale-95 [[data-contrast=high]_&]:border-2 [[data-contrast=high]_&]:border-fg [[data-contrast=high]_&]:shadow-none"
          >
            <Mic className="h-6 w-6" aria-hidden />
          </button>
        </div>
        {right && tab(right)}
        <button
          type="button"
          onClick={onMore}
          aria-label="More pages"
          aria-expanded={moreOpen}
          className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition ${
            moreOpen ? 'glass-active' : 'text-fg2 hover:text-fg'
          }`}
        >
          <Menu className="h-5 w-5" aria-hidden />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
