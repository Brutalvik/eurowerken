import type { ThemeMode } from './ThemeProvider';

/**
 * Recharts writes colors into SVG attributes, where CSS variables are not
 * reliable, so charts read concrete hex values keyed by theme mode.
 * Keep in sync with the CSS variables in index.css.
 */
export interface ChartPalette {
  accent: string;
  ok: string;
  warn: string;
  bad: string;
  grid: string;
  axis: string;
  target: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const PALETTES: Record<ThemeMode, ChartPalette> = {
  light: {
    accent: '#1D6FF0',
    ok: '#059669',
    warn: '#B45309',
    bad: '#DC2626',
    grid: '#D3D9E2',
    axis: '#506178',
    target: '#6E7E94',
    tooltipBg: '#EBEEF2',
    tooltipBorder: '#CCD3DE',
    tooltipText: '#1E283A',
  },
  dark: {
    accent: '#4F8EF7',
    ok: '#34D399',
    warn: '#FBBF24',
    bad: '#F87171',
    grid: '#1C2D47',
    axis: '#7B93BF',
    target: '#5B7399',
    tooltipBg: '#152035',
    tooltipBorder: '#1C2D47',
    tooltipText: '#EDF2FF',
  },
};

export function chartPalette(mode: ThemeMode): ChartPalette {
  return PALETTES[mode];
}
