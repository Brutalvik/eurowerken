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
  /** Bars other than the highlighted one (the current month). */
  barMuted: string;
  /** The highlighted bar's gradient, top to bottom. */
  barTop: string;
  barBottom: string;
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
    barMuted: '#AEBBCF',
    barTop: '#5A9BFF',
    barBottom: '#1D5FD6',
  },
  dark: {
    accent: '#5E92FA',
    ok: '#4AD59A',
    warn: '#F5C042',
    bad: '#F87777',
    grid: '#26324A',
    axis: '#A3B2CC',
    target: '#7C8DAA',
    tooltipBg: '#182133',
    tooltipBorder: '#34435F',
    tooltipText: '#ECF1FA',
    barMuted: '#5B6B88',
    barTop: '#7DAAFF',
    barBottom: '#2F5FD0',
  },
};

/** High contrast: solid, bright marks on obsidian (keep in sync with [data-contrast='high'] in index.css). */
const HIGH_CONTRAST: ChartPalette = {
  accent: '#80B0FF',
  ok: '#56E68C',
  warn: '#FFD65C',
  bad: '#FF8C8C',
  grid: '#4A556B',
  axis: '#DEE5F0',
  target: '#C4CFE0',
  tooltipBg: '#05070B',
  tooltipBorder: '#B0BED6',
  tooltipText: '#FFFFFF',
  barMuted: '#C4CFE0',
  barTop: '#80B0FF',
  barBottom: '#80B0FF',
};

export function chartPalette(mode: ThemeMode, highContrast = false): ChartPalette {
  return highContrast ? HIGH_CONTRAST : PALETTES[mode];
}
