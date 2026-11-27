/**
 * Live preview from the ERP. The ERP shows this site in an iframe at <site>/<slug>?ew-preview=1 and posts the
 * unsaved design (PreviewDataMessage). Preview mode is decided once, when the page loads: inside a frame AND the URL
 * had ?ew-preview=1. It then lasts for the life of the page, so navigating inside the frame keeps it.
 *
 * In preview mode the site, services and team come from the ERP's messages, never from Supabase, and nothing
 * persistent is written (forms that would send data show "Disabled in preview" instead).
 */
import { useSyncExternalStore } from 'react';
import { PREVIEW_PARAM } from '@eurowerken/shared';
import type { PreviewDataMessage, PreviewReadyMessage, ServiceRow, TeamMemberRow, WorkshopSite } from '@eurowerken/shared';

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  let framed: boolean;
  try {
    framed = window.parent !== window;
  } catch {
    framed = true;
  }
  if (!framed) return false;
  try {
    return new URLSearchParams(window.location.search).get(PREVIEW_PARAM) === '1';
  } catch {
    return false;
  }
}

/** Fixed at page load. */
const ACTIVE = detect();

/** True when this page is the ERP's live preview. */
export function isPreview(): boolean {
  return ACTIVE;
}

/** The note shown instead of sending a form in preview mode. */
export const PREVIEW_DISABLED_NOTE = 'Disabled in preview.';

export interface PreviewData {
  site: WorkshopSite;
  services: ServiceRow[];
  team: TeamMemberRow[];
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The ERP origins we accept messages from: our own (both apps on one address), VITE_ERP_ORIGIN, and the ERP's
 *  dev server while developing. */
function allowedOrigins(): Set<string> {
  const out = new Set<string>([window.location.origin]);
  const erp = originOf(import.meta.env.VITE_ERP_ORIGIN);
  if (erp) out.add(erp);
  if (import.meta.env.DEV) out.add('http://localhost:5174');
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function rows<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter(isRecord) as unknown as T[]) : [];
}

function parse(data: unknown): PreviewData | null {
  if (!isRecord(data) || data.type !== 'ew-site-preview') return null;
  const site = data.site;
  if (!isRecord(site) || typeof site.slug !== 'string' || typeof site.display_name !== 'string') return null;
  const msg = data as unknown as PreviewDataMessage;
  return {
    site: site as unknown as WorkshopSite,
    services: rows<ServiceRow>(msg.services),
    team: rows<TeamMemberRow>(msg.team),
  };
}

// Store --------------------------------------------------------------------------------------------------------------

let current: PreviewData | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): PreviewData | null {
  return current;
}

function start(): void {
  const allowed = allowedOrigins();
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || !allowed.has(event.origin)) return;
    const next = parse(event.data);
    if (!next) return;
    current = next;
    listeners.forEach((l) => l());
  });

  // Tell the ERP we are ready; repeat a few times until the first data arrives, whichever loads first.
  const ready: PreviewReadyMessage = { type: 'ew-site-preview-ready' };
  for (const delay of [0, 300, 1000, 2500]) {
    window.setTimeout(() => {
      if (current) return;
      try {
        // The message carries no data, so any target is fine.
        window.parent.postMessage(ready, '*');
      } catch {
        // parent gone
      }
    }, delay);
  }
}

if (ACTIVE) start();

/** The latest preview data from the ERP (null until the first message, and always null outside preview). */
export function usePreviewData(): PreviewData | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Services as the live query returns them: active ones, in the workshop's order. */
export function previewServices(list: ServiceRow[]): ServiceRow[] {
  return list.filter((s) => s.active === true).sort(byOrderThenName);
}

/** Team as the live query returns it: public members, in the workshop's order. */
export function previewTeam(list: TeamMemberRow[]): TeamMemberRow[] {
  return list.filter((t) => t.is_public === true).sort(byOrderThenName);
}

function byOrderThenName(a: { sort_order: number; name: string }, b: { sort_order: number; name: string }): number {
  return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name));
}
