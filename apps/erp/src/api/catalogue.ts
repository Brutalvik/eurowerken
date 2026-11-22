/**
 * Typed data access for the workshop catalogue (supabase/migrations/005):
 * services, team members, parts, part costs and public photos. Every call is
 * checked by row level security; these functions only turn the results and
 * errors into something the screens can show.
 */
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_BUCKET,
  publicImagePath,
  publicImageUrl,
} from '@eurowerken/shared';
import type { PartCostRow, PartRow, ServiceRow, TeamMemberRow } from '@eurowerken/shared';
import { supabase } from '@/lib/supabase';

type Managed = 'id' | 'workshop_id' | 'created_at' | 'updated_at';

export type ServiceInput = Omit<ServiceRow, Managed>;
export type TeamMemberInput = Omit<TeamMemberRow, Managed>;
export type PartInput = Omit<PartRow, Managed>;
export type ImageArea = 'logo' | 'services' | 'team' | 'parts';

/** Slug rule of public.parts (the database check). */
export const PART_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/;

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

/** Turns a Supabase error into a sentence a workshop user can act on. */
export function friendlyError(err: DbError): string {
  const text = `${err.message} ${err.details ?? ''}`;
  if (err.code === '23505' || /duplicate key/i.test(text)) {
    if (/sku/i.test(text)) return 'Another part already uses that SKU. Use a different SKU.';
    if (/slug/i.test(text)) return 'Another part already uses that web address (slug). Change the slug.';
    return 'That entry already exists.';
  }
  if (err.code === '42501' || /row-level security|permission denied/i.test(text)) {
    return 'You do not have permission to make this change.';
  }
  if (err.code === '23514' || /violates check constraint/i.test(text)) {
    return 'One of the values is not allowed (too long, negative or the wrong format). Check the fields and try again.';
  }
  if (err.code === 'PGRST116') return 'The record was not found, or you do not have permission to change it.';
  if (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(text)) {
    return 'The database is not set up for this yet. Apply migration 005 (npm run db:migrate).';
  }
  if (/failed to fetch|network/i.test(text)) return 'Could not reach the server. Check your connection and try again.';
  return err.message;
}

function fail(err: DbError): never {
  throw new Error(friendlyError(err));
}

/** Empty or whitespace-only strings become null, as the database expects. */
function nullEmpty<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
  ) as T;
}

function toNumber(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function normalizeService(row: ServiceRow): ServiceRow {
  return { ...row, price_from: toNumber(row.price_from) };
}

function normalizePart(row: PartRow): PartRow {
  return {
    ...row,
    price: toNumber(row.price),
    compare_at: row.compare_at === null ? null : toNumber(row.compare_at),
    specs: Array.isArray(row.specs) ? row.specs : [],
  };
}

async function removeRow(table: 'services' | 'team_members' | 'parts', id: string): Promise<void> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new Error('Nothing was deleted. It may be gone already, or you do not have permission.');
}

// Services ----------------------------------------------------------------------

export async function listServices(workshopId: string): Promise<ServiceRow[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('workshop_id', workshopId)
    .order('sort_order')
    .order('name');
  if (error) fail(error);
  return ((data ?? []) as ServiceRow[]).map(normalizeService);
}

export async function createService(workshopId: string, input: ServiceInput): Promise<ServiceRow> {
  const { data, error } = await supabase
    .from('services')
    .insert({ ...nullEmpty(input), workshop_id: workshopId })
    .select('*')
    .single();
  if (error) fail(error);
  return normalizeService(data as ServiceRow);
}

export async function updateService(id: string, patch: Partial<ServiceInput>): Promise<ServiceRow> {
  const { data, error } = await supabase.from('services').update(nullEmpty(patch)).eq('id', id).select('*').single();
  if (error) fail(error);
  return normalizeService(data as ServiceRow);
}

export async function deleteService(service: Pick<ServiceRow, 'id' | 'image_path'>): Promise<void> {
  await removeRow('services', service.id);
  if (service.image_path) await removePublicImage(service.image_path);
}

// Team members ------------------------------------------------------------------

export async function listTeamMembers(workshopId: string): Promise<TeamMemberRow[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('workshop_id', workshopId)
    .order('sort_order')
    .order('name');
  if (error) fail(error);
  return (data ?? []) as TeamMemberRow[];
}

export async function createTeamMember(workshopId: string, input: TeamMemberInput): Promise<TeamMemberRow> {
  const { data, error } = await supabase
    .from('team_members')
    .insert({ ...nullEmpty(input), workshop_id: workshopId })
    .select('*')
    .single();
  if (error) fail(error);
  return data as TeamMemberRow;
}

export async function updateTeamMember(id: string, patch: Partial<TeamMemberInput>): Promise<TeamMemberRow> {
  const { data, error } = await supabase.from('team_members').update(nullEmpty(patch)).eq('id', id).select('*').single();
  if (error) fail(error);
  return data as TeamMemberRow;
}

export async function deleteTeamMember(member: Pick<TeamMemberRow, 'id' | 'photo_path'>): Promise<void> {
  await removeRow('team_members', member.id);
  if (member.photo_path) await removePublicImage(member.photo_path);
}

// Parts -------------------------------------------------------------------------

export async function listParts(workshopId: string): Promise<PartRow[]> {
  const { data, error } = await supabase.from('parts').select('*').eq('workshop_id', workshopId).order('name');
  if (error) fail(error);
  return ((data ?? []) as PartRow[]).map(normalizePart);
}

export async function createPart(workshopId: string, input: PartInput): Promise<PartRow> {
  const { data, error } = await supabase
    .from('parts')
    .insert({ ...nullEmpty(input), workshop_id: workshopId })
    .select('*')
    .single();
  if (error) fail(error);
  return normalizePart(data as PartRow);
}

export async function updatePart(id: string, patch: Partial<PartInput>): Promise<PartRow> {
  const { data, error } = await supabase.from('parts').update(nullEmpty(patch)).eq('id', id).select('*').single();
  if (error) fail(error);
  return normalizePart(data as PartRow);
}

export async function deletePart(part: Pick<PartRow, 'id' | 'image_paths'>): Promise<void> {
  await removeRow('parts', part.id);
  await removePublicImages(part.image_paths);
}

// Part costs (staff only) -------------------------------------------------------

/** Unit costs of the workshop's parts, by part id. */
export async function listPartCosts(workshopId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('part_costs').select('part_id, unit_cost').eq('workshop_id', workshopId);
  if (error) fail(error);
  return new Map(((data ?? []) as Pick<PartCostRow, 'part_id' | 'unit_cost'>[]).map((r) => [r.part_id, toNumber(r.unit_cost)]));
}

export async function getPartCost(partId: string): Promise<number | null> {
  const { data, error } = await supabase.from('part_costs').select('unit_cost').eq('part_id', partId).maybeSingle();
  if (error) fail(error);
  return data ? toNumber((data as Pick<PartCostRow, 'unit_cost'>).unit_cost) : null;
}

/** The database fills workshop_id from the part (trigger part_costs_set_workshop). */
export async function upsertPartCost(partId: string, workshopId: string, unitCost: number): Promise<number> {
  const { data, error } = await supabase
    .from('part_costs')
    .upsert({ part_id: partId, workshop_id: workshopId, unit_cost: unitCost }, { onConflict: 'part_id' })
    .select('unit_cost')
    .single();
  if (error) fail(error);
  return toNumber((data as Pick<PartCostRow, 'unit_cost'>).unit_cost);
}

// Ordering ----------------------------------------------------------------------

interface Sortable {
  id: string;
  sort_order: number;
}

/**
 * Moves one row up or down among the rows that share its group (for example a
 * service category), then renumbers the whole list in steps of 10 and saves
 * the rows whose order changed. Returns the rows with their new sort_order.
 */
export async function moveRow<T extends Sortable>(
  table: 'services' | 'team_members',
  rows: T[],
  id: string,
  direction: -1 | 1,
  sameGroup: (a: T, b: T) => boolean = () => true,
): Promise<T[]> {
  const list = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const from = list.findIndex((r) => r.id === id);
  if (from < 0) return rows;
  let to = from + direction;
  while (to >= 0 && to < list.length && !sameGroup(list[to], list[from])) to += direction;
  if (to < 0 || to >= list.length) return rows;
  [list[from], list[to]] = [list[to], list[from]];
  const next = list.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
  const changed = next.filter((r) => rows.find((o) => o.id === r.id)?.sort_order !== r.sort_order);
  const results = await Promise.all(
    changed.map((r) => supabase.from(table).update({ sort_order: r.sort_order }).eq('id', r.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) fail(failed.error);
  return next;
}

/** The next free sort_order at the end of a list. */
export function nextSortOrder(rows: Sortable[]): number {
  return rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 10;
}

// Images ------------------------------------------------------------------------

/** Checks type and size before anything is sent. Returns a message, or null when fine. */
export function checkImage(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: use a JPEG, PNG or WebP image.`;
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/** Uploads one image to the workshop's public folder and returns its storage path. */
export async function uploadPublicImage(file: File, area: ImageArea, workshopId: string): Promise<string> {
  const problem = checkImage(file);
  if (problem) throw new Error(problem);
  const path = publicImagePath(workshopId, area, file.name);
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    const msg = error.message;
    if (/row-level security|unauthorized|permission/i.test(msg)) throw new Error('You do not have permission to upload images.');
    if (/bucket not found/i.test(msg)) throw new Error('Image storage is not set up yet. Apply migration 005 (npm run db:migrate).');
    if (/size|too large/i.test(msg)) throw new Error(`${file.name} is too large. The limit is 5 MB.`);
    if (/mime|type/i.test(msg)) throw new Error(`${file.name}: use a JPEG, PNG or WebP image.`);
    throw new Error(`${file.name} could not be uploaded: ${msg}`);
  }
  return path;
}

/** Deletes an uploaded image. Best effort: a leftover file is harmless. */
export async function removePublicImage(path: string): Promise<void> {
  await removePublicImages([path]);
}

export async function removePublicImages(paths: string[]): Promise<void> {
  const own = paths.filter((p) => p && !/^https?:\/\//.test(p));
  if (own.length === 0) return;
  try {
    await supabase.storage.from(PUBLIC_BUCKET).remove(own);
  } catch {
    // Ignored on purpose.
  }
}

/** Removes the images in `from` that are not in `keep` (after a save, or on cancel). */
export async function discardImages(from: (string | null)[], keep: (string | null)[]): Promise<void> {
  const kept = new Set(keep.filter(Boolean));
  await removePublicImages(from.filter((p): p is string => Boolean(p) && !kept.has(p)));
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';

/** Public URL for a stored image path (full URLs pass through). */
export function imageUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return publicImageUrl(SUPABASE_URL, path);
}

// Small parsing helpers the forms share ---------------------------------------------

/** Splits text on commas or new lines into trimmed, non-empty, unique entries. */
export function splitList(text: string, by: 'comma-or-line' | 'line' = 'comma-or-line'): string[] {
  const parts = text.split(by === 'line' ? /\n/ : /[\n,]/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

/** Parses a money or count field. Empty gives null; anything unreadable gives NaN. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, '');
  if (t === '') return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

// Form drafts ---------------------------------------------------------------------
// The forms edit text; these turn a row into a draft and a draft back into a
// checked input, so the screens hold no rules of their own.

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function money(label: string, text: string, errors: string[], required = false): number | null {
  const n = parseNumber(text);
  if (n === null) {
    if (required) errors.push(`${label} is required.`);
    return null;
  }
  if (Number.isNaN(n) || n < 0) errors.push(`${label} must be a number of 0 or more.`);
  else if (n > 99_999_999) errors.push(`${label} is too large.`);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

function count(label: string, text: string, errors: string[], maxValue = 2_000_000_000): number | null {
  const n = parseNumber(text);
  if (n === null) return null;
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) errors.push(`${label} must be a whole number of 0 or more.`);
  else if (n > maxValue) errors.push(`${label} must be ${maxValue} or less.`);
  return Number.isNaN(n) ? null : n;
}

function length(label: string, text: string, maxLen: number, errors: string[], minLen = 0): string {
  const t = text.trim();
  if (minLen > 0 && t.length < minLen) errors.push(`${label} needs at least ${minLen} characters.`);
  if (t.length > maxLen) errors.push(`${label} can be at most ${maxLen} characters (now ${t.length}).`);
  return t;
}

// Parts

export interface SpecDraft {
  key: number;
  label: string;
  value: string;
}

export interface PartDraft {
  name: string;
  slug: string;
  slugEdited: boolean;
  sku: string;
  brand: string;
  category: string;
  quality: PartRow['quality'];
  fitment: PartRow['fitment'];
  part_number: string;
  price: string;
  compare_at: string;
  stock: string;
  min_stock: string;
  unit_cost: string;
  summary: string;
  description: string;
  features: string;
  specs: SpecDraft[];
  oem_refs: string;
  warranty: string;
  image_paths: string[];
  published: boolean;
}

let specKey = 0;
export function newSpec(label = '', value = ''): SpecDraft {
  specKey += 1;
  return { key: specKey, label, value };
}

export function partDraft(part: PartRow | null, unitCost: number | null): PartDraft {
  return {
    name: part?.name ?? '',
    slug: part?.slug ?? '',
    slugEdited: Boolean(part),
    sku: part?.sku ?? '',
    brand: part?.brand ?? '',
    category: part?.category ?? '',
    quality: part?.quality ?? 'OEM',
    fitment: part?.fitment ?? 'guaranteed',
    part_number: part?.part_number ?? '',
    price: part ? String(part.price) : '',
    compare_at: part?.compare_at != null ? String(part.compare_at) : '',
    stock: part ? String(part.stock) : '0',
    min_stock: part ? String(part.min_stock) : '0',
    unit_cost: unitCost != null ? String(unitCost) : '',
    summary: part?.summary ?? '',
    description: part?.description ?? '',
    features: (part?.features ?? []).join('\n'),
    specs: (part?.specs ?? []).map((s) => newSpec(s.label, s.value)),
    oem_refs: (part?.oem_refs ?? []).join('\n'),
    warranty: part?.warranty ?? '',
    image_paths: part?.image_paths ?? [],
    published: part?.published ?? false,
  };
}

export function validatePart(d: PartDraft): Validated<{ part: PartInput; unitCost: number | null }> {
  const errors: string[] = [];
  const name = length('Name', d.name, 120, errors, 2);
  const slug = d.slug.trim();
  if (!PART_SLUG_PATTERN.test(slug)) {
    errors.push('Slug: lowercase letters, digits and hyphens, up to 80 characters, not starting or ending with a hyphen.');
  }
  const category = length('Category', d.category, 60, errors, 2);
  const price = money('Price', d.price, errors, true);
  const compareAt = money('Compare-at price', d.compare_at, errors);
  if (price !== null && compareAt !== null && compareAt > 0 && compareAt <= price) {
    errors.push('Compare-at price should be higher than the price (it shows as the old price), or left empty.');
  }
  const stock = count('Stock', d.stock, errors) ?? 0;
  const minStock = count('Minimum stock', d.min_stock, errors) ?? 0;
  const unitCost = money('Unit cost', d.unit_cost, errors);
  const specs = d.specs
    .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
    .filter((s) => s.label || s.value);
  if (specs.some((s) => !s.label || !s.value)) errors.push('Each specification needs both a label and a value.');
  const part: PartInput = {
    slug,
    name,
    sku: length('SKU', d.sku, 40, errors) || null,
    brand: length('Brand', d.brand, 60, errors) || null,
    category,
    quality: d.quality,
    fitment: d.fitment,
    part_number: length('Part number', d.part_number, 60, errors) || null,
    price: price ?? 0,
    compare_at: compareAt,
    stock,
    min_stock: minStock,
    summary: length('Summary', d.summary, 200, errors) || null,
    description: length('Description', d.description, 4000, errors) || null,
    features: splitList(d.features, 'line'),
    specs,
    oem_refs: splitList(d.oem_refs, 'line'),
    warranty: length('Warranty', d.warranty, 200, errors) || null,
    image_paths: d.image_paths,
    published: d.published,
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { part, unitCost } };
}

/** Creates or updates the part, then its unit cost. A failed cost save keeps the saved part. */
export async function savePart(
  workshopId: string,
  existingId: string | null,
  input: PartInput,
  unitCost: number | null,
): Promise<{ part: PartRow; unitCost: number | null; costError: string | null }> {
  const part = existingId ? await updatePart(existingId, input) : await createPart(workshopId, input);
  if (unitCost === null) return { part, unitCost: null, costError: null };
  try {
    return { part, unitCost: await upsertPartCost(part.id, workshopId, unitCost), costError: null };
  } catch (err) {
    return { part, unitCost: null, costError: err instanceof Error ? err.message : 'Unit cost was not saved.' };
  }
}

// Services

export interface ServiceDraft {
  name: string;
  category: ServiceRow['category'];
  description: string;
  duration_text: string;
  price_from: string;
  badge: '' | 'Popular' | 'Recommended';
  icon: ServiceRow['icon'];
  image_path: string | null;
  active: boolean;
  sort_order: string;
}

export function serviceDraft(s: ServiceRow | null, defaultSort: number): ServiceDraft {
  return {
    name: s?.name ?? '',
    category: s?.category ?? 'maintenance',
    description: s?.description ?? '',
    duration_text: s?.duration_text ?? '',
    price_from: s ? String(s.price_from) : '',
    badge: s?.badge ?? '',
    icon: s?.icon ?? 'wrench',
    image_path: s?.image_path ?? null,
    active: s?.active ?? true,
    sort_order: String(s?.sort_order ?? defaultSort),
  };
}

export function validateService(d: ServiceDraft): Validated<ServiceInput> {
  const errors: string[] = [];
  const value: ServiceInput = {
    name: length('Name', d.name, 80, errors, 2),
    category: d.category,
    description: length('Description', d.description, 400, errors) || null,
    duration_text: length('Duration', d.duration_text, 40, errors) || null,
    price_from: money('Price from', d.price_from, errors) ?? 0,
    badge: d.badge || null,
    icon: d.icon,
    image_path: d.image_path,
    active: d.active,
    sort_order: count('Sort order', d.sort_order, errors) ?? 0,
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

// Team members

export interface TeamDraft {
  name: string;
  role_title: string;
  bio: string;
  specialties: string;
  makes: string;
  languages: string;
  years: string;
  certifications: string;
  photo_path: string | null;
  is_public: boolean;
  sort_order: string;
}

export function teamDraft(m: TeamMemberRow | null, defaultSort: number): TeamDraft {
  return {
    name: m?.name ?? '',
    role_title: m?.role_title ?? '',
    bio: m?.bio ?? '',
    specialties: (m?.specialties ?? []).join(', '),
    makes: (m?.makes ?? []).join(', '),
    languages: (m?.languages ?? []).join(', '),
    years: m?.years != null ? String(m.years) : '',
    certifications: (m?.certifications ?? []).join('\n'),
    photo_path: m?.photo_path ?? null,
    is_public: m?.is_public ?? true,
    sort_order: String(m?.sort_order ?? defaultSort),
  };
}

export function validateTeamMember(d: TeamDraft, profileId: string | null): Validated<TeamMemberInput> {
  const errors: string[] = [];
  const value: TeamMemberInput = {
    profile_id: profileId,
    name: length('Name', d.name, 80, errors, 2),
    role_title: length('Role title', d.role_title, 60, errors) || null,
    bio: length('Bio', d.bio, 600, errors) || null,
    specialties: splitList(d.specialties),
    makes: splitList(d.makes),
    languages: splitList(d.languages),
    years: count('Years of experience', d.years, errors, 70),
    certifications: splitList(d.certifications),
    photo_path: d.photo_path,
    is_public: d.is_public,
    sort_order: count('Sort order', d.sort_order, errors) ?? 0,
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}
