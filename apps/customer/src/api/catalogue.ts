/**
 * The workshop's public catalogue: services, team and parts (tables from
 * supabase/migrations/005). Rows are mapped to the shapes the pages use, and
 * results are cached in memory per workshop, so moving between pages does not
 * fetch everything again.
 *
 * Visitors only ever see active services, public team members and published
 * parts of a published site (RLS). Staff who are signed in can read more, so
 * every query also filters on those flags. part_costs is never read here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SERVICE_CATEGORY_LABELS, SERVICE_ICONS, publicImageUrl } from '@eurowerken/shared';
import type { PartQuality, PartRow, ServiceCategoryId, ServiceIcon, ServiceRow, TeamMemberRow } from '@eurowerken/shared';
import { supabase } from '@/lib/supabase';
import { useSite } from '@/site/SiteContext';
import { isPreview, previewServices, previewTeam, usePreviewData } from '@/site/preview';

// Page-facing shapes ----------------------------------------------------------------

export type Quality = PartQuality;
export type Fitment = PartRow['fitment'];

export interface Part {
  /** uuid: the cart key. */
  id: string;
  /** URL name: /<site>/parts/<slug>. */
  slug: string;
  name: string;
  brand: string;
  category: string;
  quality: Quality;
  fitment: Fitment;
  partNumber: string;
  price: number;
  compareAt?: number;
  /** Not collected yet; pages hide ratings while these are missing. */
  rating?: number;
  reviewCount?: number;
  /** Full image URLs, first is the main photo. */
  images: string[];
  /** The main photo, if any. */
  image?: string;
  stock: number;
  summary: string;
  /** Paragraphs. */
  description: string[];
  features: string[];
  specs: { label: string; value: string }[];
  oemReferences: string[];
  warranty: string;
}

export interface Service {
  id: string;
  category: ServiceCategoryId;
  categoryLabel: string;
  name: string;
  text: string;
  /** Free text, for example "45 to 60 mins"; empty when the workshop left it out. */
  duration: string;
  priceFrom: number;
  badge?: 'Popular' | 'Recommended';
  icon: ServiceIcon;
  /** Full image URL, if the workshop uploaded one. */
  image?: string;
}

export interface Technician {
  id: string;
  name: string;
  role: string;
  /** Full photo URL, if the workshop uploaded one. */
  image?: string;
  specialties: string[];
  makes: string[];
  languages: string[];
  years: number | null;
  /** Not collected yet; pages hide these while missing. */
  rating?: number;
  jobs?: number;
  bio: string;
  certifications: string[];
}

// Mapping -----------------------------------------------------------------------------

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';

function imageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return SUPABASE_URL ? publicImageUrl(SUPABASE_URL, path) : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

function paragraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function mapService(row: ServiceRow): Service {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: SERVICE_CATEGORY_LABELS[row.category] ?? row.category,
    name: row.name,
    text: row.description ?? '',
    duration: row.duration_text ?? '',
    priceFrom: Number(row.price_from) || 0,
    badge: row.badge ?? undefined,
    icon: (SERVICE_ICONS as readonly string[]).includes(row.icon) ? row.icon : 'wrench',
    image: imageUrl(row.image_path),
  };
}

export function mapTeamMember(row: TeamMemberRow): Technician {
  return {
    id: row.id,
    name: row.name,
    role: row.role_title?.trim() || 'Technician',
    image: imageUrl(row.photo_path),
    specialties: strings(row.specialties),
    makes: strings(row.makes),
    languages: strings(row.languages),
    years: row.years ?? null,
    bio: row.bio ?? '',
    certifications: strings(row.certifications),
  };
}

export function mapPart(row: PartRow): Part {
  const images = strings(row.image_paths)
    .map((p) => imageUrl(p))
    .filter((u): u is string => Boolean(u));
  const specs = Array.isArray(row.specs)
    ? row.specs.filter((s) => s && typeof s.label === 'string' && typeof s.value === 'string' && s.label.trim() !== '')
    : [];
  const compareAt = row.compare_at === null ? undefined : Number(row.compare_at);
  const price = Number(row.price) || 0;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? '',
    category: row.category,
    quality: row.quality,
    fitment: row.fitment,
    partNumber: row.part_number ?? row.sku ?? '',
    price,
    compareAt: compareAt !== undefined && compareAt > price ? compareAt : undefined,
    images,
    image: images[0],
    stock: Number(row.stock) || 0,
    summary: row.summary ?? '',
    description: paragraphs(row.description),
    features: strings(row.features),
    specs,
    oemReferences: strings(row.oem_refs),
    warranty: row.warranty ?? '',
  };
}

// Fetching ------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export async function fetchServices(workshopId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ServiceRow[]).map(mapService);
}

export async function fetchTeam(workshopId: string): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('is_public', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeamMemberRow[]).map(mapTeamMember);
}

export async function fetchParts(workshopId: string): Promise<Part[]> {
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('published', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PartRow[]).map(mapPart);
}

/** One published part by its slug, or null when there is none. */
export async function fetchPart(workshopId: string, slug: string): Promise<Part | null> {
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('published', true)
    .eq('slug', slug.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPart(data as PartRow) : null;
}

/** Published parts with these ids; ids that are not uuids, removed or unpublished are left out. */
export async function fetchPartsByIds(workshopId: string, ids: string[]): Promise<Part[]> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('published', true)
    .in('id', valid);
  if (error) throw new Error(error.message);
  return ((data ?? []) as PartRow[]).map(mapPart);
}

// In-memory cache -------------------------------------------------------------------------

interface Entry<T> {
  promise: Promise<T>;
  done: boolean;
  data?: T;
}

const cache = new Map<string, Entry<unknown>>();

function cached<T>(key: string): T | undefined {
  const hit = cache.get(key) as Entry<T> | undefined;
  return hit?.done ? hit.data : undefined;
}

function isCached(key: string): boolean {
  return cache.get(key)?.done === true;
}

function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit) return hit.promise;
  const entry: Entry<T> = { done: false, promise: Promise.resolve() as Promise<T> };
  entry.promise = fetcher().then(
    (data) => {
      entry.done = true;
      entry.data = data;
      return data;
    },
    (err: unknown) => {
      // Failed loads are not kept, so Retry (or the next visit) asks again.
      if (cache.get(key) === entry) cache.delete(key);
      throw err;
    },
  );
  cache.set(key, entry);
  return entry.promise;
}

// Hooks -------------------------------------------------------------------------------------

export interface Loadable<T> {
  /** Set once loaded. */
  data: T | undefined;
  loading: boolean;
  /** Technical message when the load failed; show a friendly text instead. */
  error: string | null;
  retry: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Drops every cached entry whose key starts with `prefix`, so the next use loads it again. */
export function forgetCached(prefix: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

/** Loads `key` once per session (shared across components); key null means nothing to load. */
export function useLoadable<T>(key: string | null, fetcher: () => Promise<T>): Loadable<T> {
  const [nonce, setNonce] = useState(0);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [, setLoadedKey] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (key === null || isCached(key)) return;
    let cancelled = false;
    load(key, fetcherRef.current).then(
      () => {
        if (!cancelled) setLoadedKey(key);
      },
      (err: unknown) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const retry = useCallback(() => {
    if (key !== null) cache.delete(key);
    setFailed(null);
    setNonce((n) => n + 1);
  }, [key]);

  if (key === null) return { data: undefined, loading: false, error: null, retry };
  if (isCached(key)) return { data: cached<T>(key), loading: false, error: null, retry };
  if (failed?.key === key) return { data: undefined, loading: false, error: failed.message, retry };
  return { data: undefined, loading: true, error: null, retry };
}

const keys = {
  services: (w: string) => `services:${w}`,
  team: (w: string) => `team:${w}`,
  parts: (w: string) => `parts:${w}`,
  part: (w: string, slug: string) => `part:${w}:${slug.toLowerCase()}`,
  partsByIds: (w: string, ids: string[]) => `parts-by-ids:${w}:${ids.join(',')}`,
};

const noRetry = () => {};

/** Active services of the current workshop, in the workshop's order. In the ERP's preview: the ones it sent. */
export function useServices(): Loadable<Service[]> {
  const { workshop_id: w } = useSite();
  const preview = isPreview();
  const sent = usePreviewData()?.services;
  const fromPreview = useMemo(() => (preview ? previewServices(sent ?? []).map(mapService) : undefined), [preview, sent]);
  const live = useLoadable(preview ? null : keys.services(w), () => fetchServices(w));
  return fromPreview ? { data: fromPreview, loading: false, error: null, retry: noRetry } : live;
}

/** Public team members (technicians and advisors) of the current workshop. In the ERP's preview: the ones it sent. */
export function useTeam(): Loadable<Technician[]> {
  const { workshop_id: w } = useSite();
  const preview = isPreview();
  const sent = usePreviewData()?.team;
  const fromPreview = useMemo(() => (preview ? previewTeam(sent ?? []).map(mapTeamMember) : undefined), [preview, sent]);
  const live = useLoadable(preview ? null : keys.team(w), () => fetchTeam(w));
  return fromPreview ? { data: fromPreview, loading: false, error: null, retry: noRetry } : live;
}

/** Published parts of the current workshop. */
export function useParts(): Loadable<Part[]> {
  const { workshop_id: w } = useSite();
  return useLoadable(keys.parts(w), () => fetchParts(w));
}

/** One published part by slug; data is null when it does not exist or is not published. */
export function usePart(slug: string | undefined): Loadable<Part | null> {
  const { workshop_id: w } = useSite();
  const list = cached<Part[]>(keys.parts(w));
  const fromList = slug && list ? (list.find((p) => p.slug === slug.toLowerCase()) ?? null) : undefined;
  const key = !slug || fromList !== undefined ? null : keys.part(w, slug);
  const one = useLoadable<Part | null>(key, () => fetchPart(w, slug ?? ''));
  if (!slug) return { data: null, loading: false, error: null, retry: one.retry };
  if (fromList !== undefined) return { data: fromList, loading: false, error: null, retry: one.retry };
  return one;
}

/**
 * Published parts for these ids (for example the cart). Ids that no longer
 * exist or are unpublished are simply missing from the result.
 */
export function usePartsByIds(ids: string[]): Loadable<Part[]> {
  const { workshop_id: w } = useSite();
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const list = cached<Part[]>(keys.parts(w));
  const fromList = useMemo(() => {
    if (!list) return undefined;
    const wanted = new Set(sorted);
    return list.filter((p) => wanted.has(p.id));
  }, [list, sorted]);
  const key = sorted.length === 0 || fromList ? null : keys.partsByIds(w, sorted);
  const some = useLoadable(key, () => fetchPartsByIds(w, sorted));
  if (sorted.length === 0) return { data: [], loading: false, error: null, retry: some.retry };
  if (fromList) return { data: fromList, loading: false, error: null, retry: some.retry };
  return some;
}
