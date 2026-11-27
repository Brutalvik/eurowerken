/**
 * The "Deploy your website" setup's data: the draft of a workshop_sites row, how it is checked, saved and how its
 * pictures are uploaded. The setup page, its steps and the Design panel in Settings, Website use this.
 */
import {
  DEFAULT_ACCENT,
  PUBLIC_BUCKET,
  SITE_THEME_PRESETS,
  SLUG_PATTERN,
  hexToRgbTriplet,
  normalizeSiteSections,
  normalizeSiteTheme,
} from '@eurowerken/shared';
import type { NavStyle, SiteSection, SiteTheme, WorkshopSite } from '@eurowerken/shared';
import { supabase } from '@/lib/supabase';

/** The row as the setup edits it: theme and sections normalised, every other column kept for the preview. */
export type SiteDraft = Omit<WorkshopSite, 'theme' | 'sections' | 'nav_style'> & {
  theme: SiteTheme;
  sections: SiteSection[];
  nav_style: NavStyle;
} & Record<string, unknown>;

/** Columns the setup writes. published and setup_completed_at only change on Deploy. */
export const EDITABLE_KEYS = [
  'slug',
  'display_name',
  'tagline',
  'hero_title',
  'hero_highlight',
  'hero_subtitle',
  'hero_image_url',
  'logo_url',
  'accent_color',
  'phone',
  'email',
  'address',
  'hours',
  'instagram_url',
  'facebook_url',
  'youtube_url',
  'own_website_url',
  'nav_style',
  'theme',
  'sections',
] as const;

/** Paths of the customer app (supabase/migrations/004_workshop_sites.sql is_reserved_slug). */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'erp', 'help', 'images', 'login',
  'logout', 'register', 'signup', 'signin', 'static', 'support', 'www', 'workshops',
]);

export const SLUG_RULE = 'Web address: 3 to 48 lowercase letters, digits or hyphens, not starting or ending with a hyphen.';

export function toDraft(row: WorkshopSite): SiteDraft {
  return {
    ...(row as unknown as Record<string, unknown>),
    ...row,
    accent_color: hexToRgbTriplet(row.accent_color) ? row.accent_color : DEFAULT_ACCENT,
    nav_style: row.nav_style === 'classic' ? 'classic' : 'tabbar',
    theme: normalizeSiteTheme(row.theme),
    sections: normalizeSiteSections(row.sections),
  };
}

export function isSetUp(site: Pick<WorkshopSite, 'setup_completed_at'> | null): boolean {
  return Boolean(site?.setup_completed_at);
}

export function themeName(theme: SiteTheme): string {
  if (theme.preset === 'custom') return 'Custom';
  return SITE_THEME_PRESETS.find((p) => p.id === theme.preset)?.label ?? 'Custom';
}

export function cleanSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

// Checks --------------------------------------------------------------------------------------------------------------

export function slugErrors(slug: string): string[] {
  const s = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(s)) return [SLUG_RULE];
  if (RESERVED_SLUGS.has(s)) return [`The web address "${s}" is reserved. Choose another.`];
  return [];
}

export function addressErrors(d: SiteDraft): string[] {
  const out = slugErrors(d.slug);
  const name = (d.display_name ?? '').trim();
  if (name.length < 2 || name.length > 60) out.push('Name on the website: 2 to 60 characters.');
  if ((d.tagline ?? '').length > 120) out.push('Tagline: at most 120 characters.');
  return out;
}

export function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function styleErrors(d: SiteDraft): string[] {
  return isHex(d.accent_color) ? [] : ['Brand colour must look like #1d6ff0.'];
}

const HTTPS = /^https:\/\/\S+$/;
const OWN_SITE = /^https?:\/\/[^\s/$.?#].[^\s]*$/;

export function contentErrors(d: SiteDraft): string[] {
  const out: string[] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (str(d.hero_title).length > 120) out.push('Headline: at most 120 characters.');
  if (str(d.hero_highlight).length > 60) out.push('Word to colour: at most 60 characters.');
  if (str(d.hero_subtitle).length > 300) out.push('Intro text: at most 300 characters.');
  if (str(d.phone).length > 40) out.push('Phone: at most 40 characters.');
  if (str(d.email).length > 120) out.push('Contact email: at most 120 characters.');
  if (str(d.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(d.email))) out.push('Contact email does not look like an email address.');
  if (str(d.address).length > 200) out.push('Address: at most 200 characters.');
  if (str(d.hours).length > 300) out.push('Opening hours: at most 300 characters.');
  for (const [key, label] of [
    ['instagram_url', 'Instagram'],
    ['facebook_url', 'Facebook'],
    ['youtube_url', 'YouTube'],
  ] as const) {
    const v = str(d[key]);
    if (v && !HTTPS.test(v)) out.push(`${label} link must start with https://`);
  }
  const own = str(d.own_website_url);
  if (own && (!OWN_SITE.test(own) || own.length > 300)) out.push('Your own website must be a full address, like https://www.yourworkshop.com');
  return out;
}

export function allErrors(d: SiteDraft): string[] {
  return [...addressErrors(d), ...styleErrors(d), ...contentErrors(d)];
}

// Saving --------------------------------------------------------------------------------------------------------------

/** A database or storage message as something a shop owner can act on. */
export function friendlySaveError(message: string): string {
  if (/duplicate key|workshop_sites_slug_key/i.test(message)) return 'That web address is taken. Choose another.';
  const reserved = /The web address "([^"]*)" is reserved/i.exec(message);
  if (reserved) return `The web address "${reserved[1]}" is reserved. Choose another.`;
  if (/theme|sections|hero_image_url|setup_completed_at/i.test(message) && /column|schema cache/i.test(message)) {
    return 'The database is not set up for website designs yet. Apply migration 028 (npm run db:migrate).';
  }
  const check = /workshop_sites_(\w+?)_check/.exec(message);
  if (check) {
    const field = check[1].replace(/_/g, ' ');
    return `The ${field} value was not accepted. Check it and try again.`;
  }
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to change the website. Ask a manager.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Could not reach the server. Check your connection and try again.';
  return message;
}

function payloadOf(d: SiteDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    const v = d[key];
    out[key] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  out.slug = String(d.slug).trim().toLowerCase();
  out.display_name = String(d.display_name ?? '').trim();
  return out;
}

/** Saves the given columns; returns the saved row or throws a friendly Error. */
export async function saveSitePatch(workshopId: string, patch: Record<string, unknown>): Promise<WorkshopSite> {
  const { data, error } = await supabase.from('workshop_sites').update(patch).eq('workshop_id', workshopId).select('*').single();
  if (error) throw new Error(friendlySaveError(error.message));
  return data as WorkshopSite;
}

/** Saves the draft without publishing it or marking the setup done. */
export function saveDraft(workshopId: string, d: SiteDraft): Promise<WorkshopSite> {
  return saveSitePatch(workshopId, payloadOf(d));
}

/** Saves everything, publishes, and marks the setup done the first time. */
export function deploySite(workshopId: string, d: SiteDraft): Promise<WorkshopSite> {
  const patch = payloadOf(d);
  patch.published = true;
  if (!d.setup_completed_at) patch.setup_completed_at = new Date().toISOString();
  return saveSitePatch(workshopId, patch);
}

/** Only the columns the setup writes, to compare a draft with what was last saved. */
export function draftKey(d: SiteDraft): string {
  return JSON.stringify(payloadOf(d));
}

// Pictures ------------------------------------------------------------------------------------------------------------

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_UPLOAD = 5 * 1024 * 1024;

async function drawScaled(file: File, maxSide: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || maxSide;
    const h0 = img.naturalHeight || maxSide;
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * s));
    canvas.height = Math.max(1, Math.round(h0 * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not read the image.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('Your browser') ? e : new Error('That file could not be opened as an image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Your browser could not read the image.'))), type, quality),
  );
}

export type SiteImageKind = 'hero' | 'logo';

/**
 * Uploads a hero photo (JPEG, at most 2000 px) or a logo (PNG, at most 600 px) to workshop-public under
 * <workshop_id>/site/ and returns its public URL.
 */
export async function uploadSiteImage(file: File, kind: SiteImageKind, workshopId: string): Promise<string> {
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image under 20 MB.');
  let blob: Blob;
  let path: string;
  if (kind === 'hero') {
    const canvas = await drawScaled(file, 2000);
    blob = await toBlob(canvas, 'image/jpeg', 0.85);
    if (blob.size > MAX_UPLOAD) blob = await toBlob(canvas, 'image/jpeg', 0.6);
    path = `${workshopId}/site/hero-${crypto.randomUUID()}.jpg`;
  } else {
    const canvas = await drawScaled(file, 600);
    blob = await toBlob(canvas, 'image/png');
    path = `${workshopId}/site/logo-${crypto.randomUUID()}.png`;
  }
  if (blob.size > MAX_UPLOAD) throw new Error('The image is still over 5 MB after shrinking. Choose a smaller one.');
  const up = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (up.error) throw new Error(friendlySaveError(up.error.message));
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The storage path of a picture this setup uploaded (under <workshop_id>/site/), to delete it once replaced. */
export function ownSitePath(url: string | null | undefined, workshopId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PUBLIC_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = decodeURIComponent(url.slice(at + marker.length));
  return path.startsWith(`${workshopId}/site/`) ? path : null;
}

export function removeSiteFile(path: string | null): void {
  if (path) void supabase.storage.from(PUBLIC_BUCKET).remove([path]);
}
