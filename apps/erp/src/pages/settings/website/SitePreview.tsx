import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Monitor, RotateCw, Smartphone } from 'lucide-react';
import { PREVIEW_PARAM, SLUG_PATTERN } from '@eurowerken/shared';
import type { PreviewDataMessage, ServiceRow, TeamMemberRow } from '@eurowerken/shared';
import { CUSTOMER_SITE_URL } from '@/config/customerSite';
import type { SiteDraft } from './siteDraft';

export const SITE_ORIGIN: string | null = (() => {
  try {
    return new URL(CUSTOMER_SITE_URL).origin;
  } catch {
    return null;
  }
})();

type Device = 'desktop' | 'phone';

const SIZES: Record<Device, { w: number; h: number }> = {
  desktop: { w: 1280, h: 860 },
  phone: { w: 390, h: 844 },
};

/**
 * The real customer site in a frame, fed the unsaved draft (protocol in packages/shared/src/siteDesign.ts).
 * The frame's address carries only the slug and ew-preview=1; everything else is posted to it once it says it
 * is ready, and again on every change.
 */
export function SitePreview({ draft, services, team }: { draft: SiteDraft; services: ServiceRow[]; team: TeamMemberRow[] }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  // The frame follows the slug, but only once it is a valid one and the typing has paused.
  const [frameSlug, setFrameSlug] = useState(() => (SLUG_PATTERN.test(draft.slug) ? draft.slug : ''));
  useEffect(() => {
    if (!SLUG_PATTERN.test(draft.slug) || draft.slug === frameSlug) return;
    const t = window.setTimeout(() => setFrameSlug(draft.slug), 600);
    return () => window.clearTimeout(t);
  }, [draft.slug, frameSlug]);

  const src = frameSlug ? `${CUSTOMER_SITE_URL}/${encodeURIComponent(frameSlug)}?${PREVIEW_PARAM}=1` : null;

  // The latest data, for whenever the frame asks.
  const dataRef = useRef<PreviewDataMessage>({ type: 'ew-site-preview', site: draft, services, team });
  dataRef.current = { type: 'ew-site-preview', site: draft, services, team };

  const post = () => {
    const win = frameRef.current?.contentWindow;
    if (!win || !SITE_ORIGIN) return;
    win.postMessage(dataRef.current, SITE_ORIGIN);
  };

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!SITE_ORIGIN || e.origin !== SITE_ORIGIN) return;
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      const data = e.data as { type?: unknown } | null;
      if (!data || data.type !== 'ew-site-preview-ready') return;
      setReady(true);
      setTimedOut(false);
      post();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // A new address (or Reload): wait for a fresh ready message, give up after 6 s.
  useEffect(() => {
    setReady(false);
    setTimedOut(false);
    if (!src) return;
    const t = window.setTimeout(() => setTimedOut(true), 6000);
    return () => window.clearTimeout(t);
  }, [src, reloadKey]);

  // Every draft change goes to the frame, debounced.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(post, 120);
    return () => window.clearTimeout(t);
  }, [draft, services, team, ready]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setBoxWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const size = SIZES[device];
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / size.w) : 1;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Preview width" className="inline-flex rounded-xl glass-field p-0.5">
          {(
            [
              ['desktop', 'Desktop', Monitor],
              ['phone', 'Phone', Smartphone],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition coarse:min-h-9 ${
                device === value ? 'bg-surface text-fg shadow-sm' : 'text-fg2 hover:text-fg'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg2 hover:text-fg coarse:min-h-9"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Reload
        </button>
      </div>

      <div ref={boxRef} className="w-full">
        <div
          className={`relative mx-auto overflow-hidden glass-field ${device === 'phone' ? 'rounded-[28px]' : 'rounded-lg'}`}
          style={{ width: size.w * scale, height: size.h * scale }}
        >
          {src ? (
            <iframe
              key={`${src}#${reloadKey}`}
              ref={frameRef}
              title="Website preview"
              src={src}
              className="absolute left-0 top-0 border-0 bg-white"
              style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            />
          ) : (
            <p className="p-4 text-xs text-fg2">Enter a valid web address to see the preview.</p>
          )}
          {src && !ready && !timedOut && (
            <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-[11px] text-fg3">Loading preview...</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-fg3" aria-live="polite">
        {timedOut && !ready
          ? `The preview could not load. Check that the customer site is running at ${CUSTOMER_SITE_URL}.`
          : ready
            ? 'Preview of your unsaved changes. Visitors see them after you deploy or save.'
            : ''}
      </p>
    </div>
  );
}
