/**
 * A workshop's public website settings: public.workshop_sites. Edited by the
 * workshop's Manager in the ERP (Settings, Customer website), read by the
 * customer app without sign-in when published.
 */
export interface WorkshopSite {
  workshop_id: string;
  /** URL name: the customer site lives at /<slug>. Lowercase letters, digits and hyphens. */
  slug: string;
  display_name: string;
  tagline: string | null;
  hero_title: string | null;
  /** Part of hero_title shown in the accent colour, if it appears in it. */
  hero_highlight: string | null;
  hero_subtitle: string | null;
  logo_url: string | null;
  /** Brand colour as #rrggbb. */
  accent_color: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Opening hours, one line per entry, for example "Mon to Fri: 8:00 to 18:00". */
  hours: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  /** The workshop's own existing website, linked from the customer site (migration 009). */
  own_website_url?: string | null;
  /** Customer site navigation (migration 007): the liquid-glass tab bar or the classic header menu. */
  nav_style?: NavStyle;
  published: boolean;
  updated_at: string;
}

export type NavStyle = 'tabbar' | 'classic';

/** Editable fields (everything except keys and timestamps). */
export type WorkshopSiteInput = Omit<WorkshopSite, 'workshop_id' | 'updated_at'>;

export const DEFAULT_ACCENT = '#1d6ff0';

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
