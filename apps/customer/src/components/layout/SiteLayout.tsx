import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { normalizeSiteTheme } from '@eurowerken/shared';
import { CustomerAuthProvider } from '@/auth/CustomerAuthContext';
import { CartProvider } from '@/cart/CartContext';
import { SiteProvider, useSiteLoader } from '@/site/SiteContext';
import { isPreview } from '@/site/preview';
import { useTheme } from '@/theme/ThemeProvider';
import { SiteNotFound } from '@/pages/SiteNotFound';
import { PageBoundary } from './PageBoundary';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { SiteTabBar } from './SiteTabBar';
import { CustomerAlertsProvider } from '@/auth/CustomerAlerts';

/** Every page under /:slug: loads the workshop's published site, then header, page, footer. */
export function SiteLayout() {
  const { slug } = useParams();
  const state = useSiteLoader(slug);
  const { pathname } = useLocation();
  const { setDefaultMode } = useTheme();

  // The site's light or dark default, used until the visitor picks one themselves.
  const defaultMode = state.status === 'ready' ? normalizeSiteTheme(state.site.theme).mode : null;
  useEffect(() => {
    if (defaultMode) setDefaultMode(defaultMode);
  }, [defaultMode, setDefaultMode]);
  useEffect(() => () => setDefaultMode('light'), [setDefaultMode]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
        {isPreview() && <PreviewBadge />}
      </div>
    );
  }
  if (state.status !== 'ready') {
    return <SiteNotFound message={state.status === 'error' ? state.message : undefined} />;
  }

  return (
    <SiteProvider site={state.site}>
      <CustomerAuthProvider slug={state.site.slug}>
      <CustomerAlertsProvider>
      <CartProvider siteSlug={state.site.slug}>
      <div className="flex min-h-[100dvh] flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main
          id="main"
          className={
            state.site.nav_style !== 'classic'
              ? // The floating header overlaps the top of the page: the first section gets a transparent top border of the
                // header's height, so its own background runs up behind the pill and its content starts below it.
                'flex-1 [&>*:first-child]:border-solid [&>*:first-child]:border-transparent [&>*:first-child]:border-t-[calc(4.25rem+env(safe-area-inset-top))] xl:[&>*:first-child]:border-t-[calc(4.5rem+env(safe-area-inset-top))]'
              : 'flex-1'
          }
        >
          <PageBoundary resetKey={pathname}>
            <Outlet />
          </PageBoundary>
        </main>
        <SiteFooter />
        {state.site.nav_style !== 'classic' && (
          <>
            {/* Room under the footer so the docked tab bar never covers it. */}
            <div aria-hidden className="h-[calc(96px+env(safe-area-inset-bottom))] bg-sidebar sm:h-[124px]" />
            <SiteTabBar />
          </>
        )}
        {isPreview() && <PreviewBadge />}
      </div>
      </CartProvider>
      </CustomerAlertsProvider>
      </CustomerAuthProvider>
    </SiteProvider>
  );
}

/** Shown only in the ERP's live preview. */
function PreviewBadge() {
  return (
    <p className="pointer-events-none fixed bottom-3 left-3 z-[60] rounded-full bg-ink/85 px-3 py-1.5 text-[11px] font-semibold text-bg shadow-lg backdrop-blur">
      Preview of your website — not live
    </p>
  );
}
