import { APP_BASE } from '@/lib/appUrl';

/**
 * Where the customer website lives, without a trailing slash (each workshop's site is <this>/<slug>).
 * VITE_CUSTOMER_SITE_URL wins when set. Otherwise, when the ERP is served under a path (/erp), both apps share
 * one address and the site is at /site on it; locally it is the customer dev server.
 */
export const CUSTOMER_SITE_URL: string = (() => {
  const set = (import.meta.env.VITE_CUSTOMER_SITE_URL as string | undefined)?.trim();
  if (set) return set.replace(/\/+$/, '');
  if (APP_BASE) return `${window.location.origin}/site`;
  return 'http://localhost:5175';
})();
