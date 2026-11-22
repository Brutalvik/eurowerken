import { Menu, Moon, Sun } from 'lucide-react';
import { NotificationBell } from '@/notifications/NotificationBell';
import { useLocation } from 'react-router-dom';
import { MODULE_LABELS } from '@/auth/rbac';
import type { ModuleId } from '@/auth/rbac';
import { extraPage } from '@/config/nav';
import { useTheme } from '@/theme/ThemeProvider';

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { mode, toggle } = useTheme();
  const { pathname } = useLocation();
  const segment = pathname.split('/')[1] ?? '';
  const title = MODULE_LABELS[segment as ModuleId] ?? extraPage(segment)?.label ?? 'Not found';

  return (
    <header className="pt-safe relative z-30 shrink-0 border-b border-white/30 bg-surface/70 shadow-[inset_0_-1px_0_rgb(var(--line)/0.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.07] dark:bg-surface/60">
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

      <NotificationBell />

      <button
        type="button"
        onClick={toggle}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="rounded-lg border border-line/70 bg-surface2/70 p-2 text-fg2 hover:text-fg"
      >
        {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      </div>
    </header>
  );
}
