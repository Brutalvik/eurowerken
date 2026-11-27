/** The app's own path prefix: '' locally, '/erp' or '/site' when served under a path (Vite base). */
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** A full URL to a page of this app, for links that leave the app (sign-in emails, invites, OAuth). */
export function appUrl(path: string): string {
  return `${window.location.origin}${APP_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** A file from public/, wherever the app is served. */
export function publicFile(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
