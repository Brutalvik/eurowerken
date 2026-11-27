import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ContrastMode = 'standard' | 'high';

interface ThemeContextValue {
  /** The light or dark choice. */
  mode: ThemeMode;
  /** What is on screen: high contrast is always dark. Charts and anything else that needs real colours read this. */
  effective: ThemeMode;
  contrast: ContrastMode;
  highContrast: boolean;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
  toggleContrast: () => void;
  setContrast: (contrast: ContrastMode) => void;
}

const STORAGE_KEY = 'ew-erp-theme';
const CONTRAST_KEY = 'ew-erp-contrast';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: the choice lasts until reload
  }
}

function initialMode(): ThemeMode {
  const saved = read(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // The midnight canvas is the default; a light system theme still starts light.
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initialContrast(): ContrastMode {
  const saved = read(CONTRAST_KEY);
  if (saved === 'standard' || saved === 'high') return saved;
  return window.matchMedia('(prefers-contrast: more)').matches ? 'high' : 'standard';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [contrast, setContrastState] = useState<ContrastMode>(initialContrast);
  const [contrastSaved, setContrastSaved] = useState(() => read(CONTRAST_KEY) !== null);
  const highContrast = contrast === 'high';
  const effective: ThemeMode = highContrast ? 'dark' : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', effective === 'dark');
    if (highContrast) root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');
  }, [effective, highContrast]);

  useEffect(() => write(STORAGE_KEY, mode), [mode]);

  // Until someone picks a contrast here, follow the system's "increase contrast" setting as it changes.
  useEffect(() => {
    if (contrastSaved) return;
    const mq = window.matchMedia('(prefers-contrast: more)');
    const update = () => setContrastState(mq.matches ? 'high' : 'standard');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [contrastSaved]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggle = useCallback(() => setModeState((m) => (m === 'dark' ? 'light' : 'dark')), []);
  const setContrast = useCallback((next: ContrastMode) => {
    setContrastState(next);
    setContrastSaved(true);
    write(CONTRAST_KEY, next);
  }, []);
  const toggleContrast = useCallback(() => setContrast(contrast === 'high' ? 'standard' : 'high'), [contrast, setContrast]);

  const value = useMemo(
    () => ({ mode, effective, contrast, highContrast, toggle, setMode, toggleContrast, setContrast }),
    [mode, effective, contrast, highContrast, toggle, setMode, toggleContrast, setContrast],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
