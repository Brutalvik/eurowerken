import { Accessibility, Mic, Moon, Sun } from 'lucide-react';
import { NotificationBell } from '@/notifications/NotificationBell';
import { useLocation } from 'react-router-dom';
import { MODULE_LABELS } from '@/auth/rbac';
import type { ModuleId } from '@/auth/rbac';
import { HELP_PAGE, extraPage } from '@/config/nav';
import { useTheme } from '@/theme/ThemeProvider';
import { useVoice } from '@/voice/VoiceProvider';

/** safeTop: pad for the notch. Off when something above the header (the support session banner) already does. */
export function Header({ safeTop = true }: { safeTop?: boolean }) {
  const { mode, toggle, highContrast, toggleContrast } = useTheme();
  const { openVoice, supported } = useVoice();
  const { pathname } = useLocation();
  const segment = pathname.split('/')[1] ?? '';
  const title =
    segment === 'admin' ? 'Platform admin' : segment === HELP_PAGE.path ? HELP_PAGE.label : (MODULE_LABELS[segment as ModuleId] ?? extraPage(segment)?.label ?? 'Not found');
  const iconButton =
    'glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-fg2 transition hover:text-fg';

  return (
    <header className={`${safeTop ? 'pt-safe ' : ''}relative z-30 shrink-0`}>
      <div className="flex h-16 items-center gap-3 px-4 md:h-[84px] md:px-5 lg:px-6">
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold tracking-tight text-fg md:text-[32px] lg:flex-none lg:basis-1/4">
          {title}
        </h1>

        {/* Command bar (tablets and up). Phones use the microphone in the bottom bar. */}
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <button
            type="button"
            onClick={() => openVoice({ listen: supported })}
            aria-label={supported ? 'Voice command: say or type a command' : 'Type a command'}
            aria-keyshortcuts="Meta+K Control+K"
            className="glass flex h-11 w-full max-w-[16rem] items-center gap-3 rounded-2xl px-4 text-left text-sm text-fg3 transition hover:text-fg2"
          >
            <Mic className="h-4 w-4 shrink-0 text-fg2" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{supported ? 'Say a command...' : 'Type a command...'}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:basis-1/4 lg:justify-end">
          {highContrast ? (
            // High contrast: a labelled switch, so the way back is obvious.
            <button
              type="button"
              role="switch"
              aria-checked
              onClick={toggleContrast}
              className="flex h-11 items-center gap-2.5 rounded-2xl px-1 text-sm font-medium text-fg"
            >
              <span>High Contrast: On</span>
              <span aria-hidden className="relative inline-block h-6 w-11 shrink-0 rounded-full border-2 border-fg bg-accent">
                <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-fg" />
              </span>
            </button>
          ) : (
            <button type="button" onClick={toggleContrast} aria-pressed={false} aria-label="Turn on high contrast" title="High contrast" className={iconButton}>
              <Accessibility className="h-5 w-5" aria-hidden />
            </button>
          )}

          <NotificationBell />

          {!highContrast && (
            <button
              type="button"
              onClick={toggle}
              aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
              className={iconButton}
            >
              {mode === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
