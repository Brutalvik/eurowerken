import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isPreview } from '@/site/preview';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  /** The visitor's own choice: saved, so it wins over the site's default on later visits. */
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
  /** The site's default (theme.mode), used while the visitor has not chosen. Not saved. */
  setDefaultMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'ew-site-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The visitor's saved choice, if any. The ERP's preview never reads it: it shows the draft's mode. */
function savedChoice(): ThemeMode | null {
  if (isPreview()) return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage unavailable
  }
  return null;
}

function saveChoice(mode: ThemeMode): void {
  if (isPreview()) return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeMode | null>(savedChoice);
  const [defaultMode, setDefaultModeState] = useState<ThemeMode>('light');
  const mode = choice ?? defaultMode;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setChoice(next);
    saveChoice(next);
  }, []);
  const toggle = useCallback(() => setMode(mode === 'dark' ? 'light' : 'dark'), [mode, setMode]);
  const setDefaultMode = useCallback((next: ThemeMode) => {
    setDefaultModeState(next);
    // In the preview a toggle lasts only until the draft's mode changes, so the ERP always shows its choice.
    if (isPreview()) setChoice(null);
  }, []);

  const value = useMemo(() => ({ mode, toggle, setMode, setDefaultMode }), [mode, toggle, setMode, setDefaultMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
