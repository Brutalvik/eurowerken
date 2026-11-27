/**
 * The customer website's design choices, shared by the ERP (the "Deploy your website" setup and its live preview)
 * and the customer app (which applies them). Stored on workshop_sites (migration 028):
 *   accent_color  the brand colour (#rrggbb, existing column)
 *   theme         { preset, font, radius, mode }
 *   sections      the home page's shop-specific sections, in order, each on or off
 *   nav_style     the layout of the navigation (existing column)
 *
 * The fixed parts of every site (booking, repair tracking and approvals, My Garage, sign-in, invoices) are not
 * choices: they are always there, styled with the shop's design.
 */
import type { ServiceRow, TeamMemberRow } from './catalogue';

// Fonts ------------------------------------------------------------------------------------------------------------

export type SiteFontId = 'modern' | 'classic' | 'luxury' | 'technical' | 'friendly';

export interface SiteFont {
  id: SiteFontId;
  label: string;
  description: string;
  /** CSS font-family values. */
  display: string;
  body: string;
  /** Google Fonts css2 query (family=...&family=...), loaded by the customer app. */
  googleQuery: string;
}

export const SITE_FONTS: SiteFont[] = [
  {
    id: 'modern',
    label: 'Modern',
    description: 'Poppins headings, Inter text. Clean and confident.',
    display: "'Poppins', 'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    googleQuery: 'family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600',
  },
  {
    id: 'classic',
    label: 'Classic',
    description: 'Merriweather headings, Source Sans text. Trusted and established.',
    display: "'Merriweather', Georgia, serif",
    body: "'Source Sans 3', system-ui, sans-serif",
    googleQuery: 'family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;500;600',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    description: 'Playfair Display headings, Inter text. Elegant and premium.',
    display: "'Playfair Display', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
    googleQuery: 'family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600',
  },
  {
    id: 'technical',
    label: 'Technical',
    description: 'Space Grotesk throughout. Precise, performance-minded.',
    display: "'Space Grotesk', system-ui, sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
    googleQuery: 'family=Space+Grotesk:wght@400;500;600;700',
  },
  {
    id: 'friendly',
    label: 'Friendly',
    description: 'Nunito throughout. Warm and approachable.',
    display: "'Nunito', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
    googleQuery: 'family=Nunito:wght@400;600;700;800',
  },
];

// Corners -----------------------------------------------------------------------------------------------------------

export type SiteRadiusId = 'sharp' | 'soft' | 'round';

/** Multiplies the site's corner sizes (customer app tailwind: borderRadius uses var(--site-radius)). */
export const SITE_RADII: { id: SiteRadiusId; label: string; scale: number }[] = [
  { id: 'sharp', label: 'Sharp', scale: 0.3 },
  { id: 'soft', label: 'Soft', scale: 1 },
  { id: 'round', label: 'Round', scale: 1.5 },
];

// Themes ------------------------------------------------------------------------------------------------------------

export type SiteMode = 'light' | 'dark';

export interface SiteTheme {
  /** The preset it started from, or 'custom'. */
  preset: string;
  font: SiteFontId;
  radius: SiteRadiusId;
  /** What first-time visitors see; visitors can still switch. */
  mode: SiteMode;
}

export interface SiteThemePreset extends SiteTheme {
  id: string;
  label: string;
  description: string;
  accent: string;
}

export const SITE_THEME_PRESETS: SiteThemePreset[] = [
  { id: 'performance', preset: 'performance', label: 'Performance', description: 'Dark, bold and fast. For European performance shops.', accent: '#e11d2e', font: 'technical', radius: 'sharp', mode: 'dark' },
  { id: 'classic', preset: 'classic', label: 'Classic Garage', description: 'Clean and trustworthy. The garage people have used for years.', accent: '#1d6ff0', font: 'classic', radius: 'soft', mode: 'light' },
  { id: 'luxury', preset: 'luxury', label: 'Luxury', description: 'Minimal and elegant, for premium marques.', accent: '#b08d57', font: 'luxury', radius: 'sharp', mode: 'light' },
  { id: 'modern', preset: 'modern', label: 'Modern', description: 'Bright, rounded and friendly on phones.', accent: '#0d9488', font: 'modern', radius: 'round', mode: 'light' },
  { id: 'midnight', preset: 'midnight', label: 'Midnight', description: 'Dark with a cool electric accent.', accent: '#6366f1', font: 'modern', radius: 'soft', mode: 'dark' },
  { id: 'family', preset: 'family', label: 'Family Garage', description: 'Warm colours and friendly type for a neighbourhood shop.', accent: '#ea580c', font: 'friendly', radius: 'round', mode: 'light' },
];

export const DEFAULT_SITE_THEME: SiteTheme = { preset: 'classic', font: 'modern', radius: 'soft', mode: 'light' };

// Sections ----------------------------------------------------------------------------------------------------------

export type SiteSectionId = 'quick_actions' | 'services' | 'garage_preview' | 'team' | 'reviews' | 'call_to_action';

export interface SiteSectionDef {
  id: SiteSectionId;
  label: string;
  description: string;
}

/** The home page's optional sections, in their default order. The hero always comes first. */
export const SITE_SECTIONS: SiteSectionDef[] = [
  { id: 'quick_actions', label: 'Quick actions', description: 'Buttons to book, track a repair and open My Garage.' },
  { id: 'services', label: 'Services', description: 'Your services with starting prices, from Settings, Services.' },
  { id: 'garage_preview', label: 'My Garage preview', description: 'Shows customers what their online garage offers.' },
  { id: 'team', label: 'Our team', description: 'Your technicians, from Settings, Team.' },
  { id: 'reviews', label: 'Reviews', description: 'What customers say.' },
  { id: 'call_to_action', label: 'Book now banner', description: 'A closing banner inviting visitors to book.' },
];

export interface SiteSection {
  id: SiteSectionId;
  enabled: boolean;
}

export const DEFAULT_SITE_SECTIONS: SiteSection[] = SITE_SECTIONS.map((s) => ({ id: s.id, enabled: true }));

/** The fixed parts every site has; shown in the setup as included, never as choices. */
export const SITE_FIXED_FEATURES: { label: string; description: string }[] = [
  { label: 'Online booking', description: 'Customers pick services and a time from your opening hours.' },
  { label: 'Repair tracking and approvals', description: 'Live progress, photos, messages, and approving work online.' },
  { label: 'My Garage', description: "Customers' cars, appointments, service history and invoices." },
  { label: 'Customer accounts', description: 'Sign in with email or Google, password reset, privacy settings.' },
  { label: 'Invoices', description: 'Invoices to view, download and print.' },
];

// Normalising stored values ---------------------------------------------------------------------------------------------

const FONT_IDS = new Set(SITE_FONTS.map((f) => f.id));
const RADIUS_IDS = new Set(SITE_RADII.map((r) => r.id));
const SECTION_IDS = new Set(SITE_SECTIONS.map((s) => s.id));

/** A stored theme (any shape, possibly empty) as a complete SiteTheme. */
export function normalizeSiteTheme(raw: unknown): SiteTheme {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    preset: typeof t.preset === 'string' && t.preset ? t.preset : DEFAULT_SITE_THEME.preset,
    font: FONT_IDS.has(t.font as SiteFontId) ? (t.font as SiteFontId) : DEFAULT_SITE_THEME.font,
    radius: RADIUS_IDS.has(t.radius as SiteRadiusId) ? (t.radius as SiteRadiusId) : DEFAULT_SITE_THEME.radius,
    mode: t.mode === 'dark' ? 'dark' : 'light',
  };
}

/** Stored sections as a complete, ordered list: unknown ids dropped, missing ones added at the end (on). */
export function normalizeSiteSections(raw: unknown): SiteSection[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SiteSection[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const s = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const id = s?.id as SiteSectionId | undefined;
    if (!id || !SECTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, enabled: s?.enabled !== false });
  }
  for (const def of SITE_SECTIONS) if (!seen.has(def.id)) out.push({ id: def.id, enabled: true });
  return out;
}

export function siteFont(id: SiteFontId): SiteFont {
  return SITE_FONTS.find((f) => f.id === id) ?? SITE_FONTS[0];
}

export function siteRadiusScale(id: SiteRadiusId): number {
  return SITE_RADII.find((r) => r.id === id)?.scale ?? 1;
}

// Live preview protocol ---------------------------------------------------------------------------------------------
//
// The ERP shows the real customer site in an iframe at <site>/<slug>?ew-preview=1 and sends it the unsaved design.
// The customer app accepts messages only from the ERP's origin, keeps preview mode for the life of the frame, and
// renders from the data it is sent (so an unpublished site can be previewed). It never saves anything.

export const PREVIEW_PARAM = 'ew-preview';

/** ERP to site: the whole draft site row (with theme and sections), plus services and team to show. */
export interface PreviewDataMessage {
  type: 'ew-site-preview';
  site: Record<string, unknown>;
  /** The workshop's services and team, as rows of services and team_members (staff can read them; an unpublished
   *  site's visitors cannot, so the preview is given them). */
  services: ServiceRow[];
  team: TeamMemberRow[];
}

/** Site to ERP: the frame is ready for data (sent on load, and again after any reload). */
export interface PreviewReadyMessage {
  type: 'ew-site-preview-ready';
}
