import { Outlet, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { SiteProvider, useSiteLoader } from '@/site/SiteContext';
import { SiteNotFound } from '@/pages/SiteNotFound';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/** Every page under /:slug: loads the workshop's published site, then header, page, footer. */
export function SiteLayout() {
  const { slug } = useParams();
  const state = useSiteLoader(slug);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
      </div>
    );
  }
  if (state.status !== 'ready') {
    return <SiteNotFound message={state.status === 'error' ? state.message : undefined} />;
  }

  return (
    <SiteProvider site={state.site}>
      <div className="flex min-h-[100dvh] flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </SiteProvider>
  );
}
