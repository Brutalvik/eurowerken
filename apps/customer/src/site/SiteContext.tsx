import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { brightenForDark, hexToRgbTriplet, normalizeSiteTheme, readableOn, siteFont, siteRadiusScale } from '@eurowerken/shared';
import type { WorkshopSite } from '@eurowerken/shared';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isPreview, usePreviewData } from './preview';

type SiteState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; site: WorkshopSite };

const SiteContext = createContext<WorkshopSite | null>(null);

const FONT_LINK_ATTR = 'data-ew-site-font';

/**
 * Loads the published site for /:slug and applies the workshop's design (brand colour, fonts, corners). In the ERP's
 * live preview the site comes from the ERP's messages instead, and is never queried.
 */
export function useSiteLoader(slug: string | undefined): SiteState {
  const preview = isPreview();
  const previewData = usePreviewData();
  const [loaded, setState] = useState<SiteState>({ status: 'loading' });
  const state: SiteState = preview
    ? previewData
      ? { status: 'ready', site: previewData.site }
      : { status: 'loading' }
    : loaded;

  useEffect(() => {
    if (preview) return;
    if (!slug || !supabaseConfigured) {
      setState(supabaseConfigured ? { status: 'not-found' } : { status: 'error', message: 'Supabase is not configured.' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void supabase
      .from('workshop_sites')
      .select('*')
      .eq('slug', slug.toLowerCase())
      .eq('published', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ status: 'error', message: error.message });
        else if (!data) setState({ status: 'not-found' });
        else setState({ status: 'ready', site: data as WorkshopSite });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, preview]);

  const site = state.status === 'ready' ? state.site : null;

  // Brand colour: the workshop's colour, and a brightened version for dark areas (dark mode, or a dark section such
  // as the sign-in screens or the classic glass header). index.css maps --accent to whichever applies.
  useEffect(() => {
    const root = document.documentElement;
    const names = ['--brand-accent', '--brand-accent-fg', '--brand-accent-dark', '--brand-accent-fg-dark'];
    const triplet = hexToRgbTriplet(site?.accent_color);
    if (triplet) {
      const dark = brightenForDark(triplet);
      root.style.setProperty('--brand-accent', triplet);
      root.style.setProperty('--brand-accent-fg', readableOn(triplet));
      root.style.setProperty('--brand-accent-dark', dark);
      root.style.setProperty('--brand-accent-fg-dark', readableOn(dark));
    } else {
      names.forEach((n) => root.style.removeProperty(n));
    }
    return () => names.forEach((n) => root.style.removeProperty(n));
  }, [site?.accent_color]);

  // Fonts: the design's display and body fonts, loaded from Google Fonts. 'modern' (Poppins and Inter) is already
  // loaded by index.html. One link element is reused, so switching fonts in the preview does not stack them.
  const theme = normalizeSiteTheme(site?.theme);
  const fontId = site ? theme.font : null;
  useEffect(() => {
    if (!fontId) return;
    const root = document.documentElement;
    const font = siteFont(fontId);
    root.style.setProperty('--font-display', font.display);
    root.style.setProperty('--font-sans', font.body);
    let link = document.head.querySelector<HTMLLinkElement>(`link[${FONT_LINK_ATTR}]`);
    if (font.id === 'modern') {
      link?.remove();
    } else {
      const href = `https://fonts.googleapis.com/css2?${font.googleQuery}&display=swap`;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.setAttribute(FONT_LINK_ATTR, '');
        document.head.appendChild(link);
      }
      if (link.getAttribute('href') !== href) link.href = href;
    }
    return () => {
      root.style.removeProperty('--font-display');
      root.style.removeProperty('--font-sans');
    };
  }, [fontId]);
  useEffect(
    () => () => {
      document.head.querySelector(`link[${FONT_LINK_ATTR}]`)?.remove();
    },
    [],
  );

  // Corners: tailwind.config.js multiplies every rounded-* size by --site-radius.
  const radius = site ? siteRadiusScale(theme.radius) : null;
  useEffect(() => {
    if (radius === null) return;
    const root = document.documentElement;
    root.style.setProperty('--site-radius', String(radius));
    return () => {
      root.style.removeProperty('--site-radius');
    };
  }, [radius]);

  useEffect(() => {
    if (site) document.title = `${site.display_name}${site.tagline ? ` | ${site.tagline}` : ''}`;
  }, [site]);

  return state;
}

export function SiteProvider({ site, children }: { site: WorkshopSite; children: ReactNode }) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}

export function useSite(): WorkshopSite {
  const site = useContext(SiteContext);
  if (!site) throw new Error('useSite must be used inside SiteProvider');
  return site;
}

/** Link helper: path inside the current workshop's site, for example sitePath(site, 'services'). */
export function sitePath(site: WorkshopSite, path = ''): string {
  return `/${site.slug}${path ? `/${path.replace(/^\//, '')}` : ''}`;
}
