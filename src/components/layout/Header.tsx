import { Bell, Menu, Moon, Sun } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MODULE_LABELS } from '@/auth/rbac';
import type { ModuleId } from '@/auth/rbac';
import { useTheme } from '@/theme/ThemeProvider';

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { mode, toggle } = useTheme();
  const { pathname } = useLocation();
  const module = pathname.split('/')[1] as ModuleId;
  const title = MODULE_LABELS[module] ?? 'Not found';

  return (
    <header className="pt-safe shrink-0 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="-ml-1 rounded-lg p-2 text-fg2 hover:bg-surface2 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-fg">{title}</h1>

      <button
        type="button"
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-fg2 hover:bg-surface2 hover:text-fg"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-surface bg-bad" />
      </button>

      <button
        type="button"
        onClick={toggle}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="rounded-lg border border-line bg-surface2 p-2 text-fg2 hover:text-fg"
      >
        {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      </div>
    </header>
  );
}
