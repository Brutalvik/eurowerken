import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { brightenForDark, hexToRgbTriplet, readableOn } from '@eurowerken/shared';
import type { WorkshopSite } from '@eurowerken/shared';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type SiteState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; site: WorkshopSite };

const SiteContext = createContext<WorkshopSite | null>(null);

/** Loads the published site for /:slug and applies the workshop's brand colour. */
export function useSiteLoader(slug: string | undefined): SiteState {
  const [state, setState] = useState<SiteState>({ status: 'loading' });

  useEffect(() => {
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
  }, [slug]);

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
