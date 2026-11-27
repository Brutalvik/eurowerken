/**
 * Digital vehicle inspections (supabase/migrations/032): templates (checklists), inspections run on a repair order,
 * their items (good / attention / urgent / N/A, a measurement, a note, photos and videos) and findings turned into
 * estimate lines that wait for the customer's approval.
 *
 * Reading follows Repair Orders view. Inspecting (start, check items, photos, complete, send, reopen, add to estimate)
 * needs Repair Orders full and goes through database functions only. Templates are changed with Settings full.
 */
import { supabase } from '@/lib/supabase';
import { friendlyError } from './catalogue';
import { MEDIA_BUCKET, checkMedia } from './repairOrders';
import type { ItemKind, RepairItem, RepairMedia, RepairOrder } from './repairOrders';

export const SETUP_MESSAGE = 'Apply migration 032 (npm run db:migrate).';

// Types ------------------------------------------------------------------------------------------------

export type Condition = 'good' | 'attention' | 'urgent' | 'na';
export type ItemType = 'condition' | 'measurement';
export type InspectionStatus = 'in_progress' | 'completed' | 'sent';

export const CONDITION_LABEL: Record<Condition, string> = { good: 'Good', attention: 'Attention', urgent: 'Urgent', na: 'N/A' };
export const STATUS_LABEL: Record<InspectionStatus, string> = { in_progress: 'In progress', completed: 'Completed', sent: 'Sent to customer' };

export interface TemplateItem {
  key: string;
  section: string;
  label: string;
  kind: ItemType;
  unit?: string;
  help?: string;
}

export interface InspectionTemplate {
  id: string;
  workshop_id: string;
  name: string;
  is_default: boolean;
  items: TemplateItem[];
  created_at: string;
  updated_at: string;
}

export interface Inspection {
  id: string;
  workshop_id: string;
  repair_order_id: string;
  template_id: string | null;
  name: string;
  status: InspectionStatus;
  started_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  sent_by: string | null;
  sent_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionItem {
  id: string;
  inspection_id: string;
  workshop_id: string;
  key: string;
  section: string;
  label: string;
  kind: ItemType;
  help: string | null;
  condition: Condition | null;
  measurement: number | null;
  unit: string | null;
  note: string | null;
  sort_order: number;
  estimate_item_id: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface InspectionMedia extends RepairMedia {
  inspection_item_id: string | null;
}

export interface InspectionCounts {
  total: number;
  checked: number;
  good: number;
  attention: number;
  urgent: number;
  na: number;
}

/** An inspection with its counts, for the list on the repair order page. */
export interface InspectionSummary extends Inspection {
  counts: InspectionCounts;
}

export interface InspectionDetail {
  inspection: Inspection;
  items: InspectionItem[];
  media: InspectionMedia[];
}

// Errors ----------------------------------------------------------------------------------------------

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

/** Turns a database error into a sentence; a missing table or function says which migration to apply. */
export function setupError(err: DbError | Error): Error {
  const message = err.message;
  const code = 'code' in err ? err.code : undefined;
  if (code === 'P0001') return new Error(message);
  if (
    code === '42P01' ||
    code === '42703' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    /(inspection|inspections|inspection_items|inspection_templates|inspection_item_id|start_inspection|update_inspection_item|complete_inspection|send_inspection|reopen_inspection|add_inspection_finding_to_estimate|set_default_inspection_template).*(does not exist|not find|schema cache)/i.test(message)
  ) {
    return new Error(`The database is not set up for inspections yet. ${SETUP_MESSAGE}`);
  }
  if (/failed to fetch|network|load failed|fetch failed/i.test(message)) return new Error('No connection. Check the Wi-Fi; your changes are kept and sent again.');
  return new Error(friendlyError(err as DbError));
}

function fail(err: DbError): never {
  throw setupError(err);
}

/** True for errors worth trying again (no connection, server busy); false for a refusal such as "completed". */
export function isRetryable(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /no connection|failed to fetch|network|load failed|timeout|timed out|503|502|504|fetch/i.test(m);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeItem(row: Record<string, unknown>): InspectionItem {
  return { ...(row as unknown as InspectionItem), measurement: num(row.measurement), sort_order: num(row.sort_order) ?? 0 };
}

function normalizeTemplate(row: Record<string, unknown>): InspectionTemplate {
  const items = Array.isArray(row.items) ? (row.items as TemplateItem[]) : [];
  return { ...(row as unknown as InspectionTemplate), items };
}

// Counts and hints ------------------------------------------------------------------------------------

export function countItems(items: Pick<InspectionItem, 'condition'>[]): InspectionCounts {
  const c: InspectionCounts = { total: items.length, checked: 0, good: 0, attention: 0, urgent: 0, na: 0 };
  for (const i of items) {
    if (!i.condition) continue;
    c.checked += 1;
    c[i.condition] += 1;
  }
  return c;
}

/** Tread depth and brake pad thickness in mm: good 5 or more, attention above 2 and below 5, urgent 2 or less. */
export function hasWearHint(item: Pick<InspectionItem, 'key' | 'label' | 'unit' | 'kind'>): boolean {
  if (item.kind !== 'measurement' || (item.unit ?? '').toLowerCase() !== 'mm') return false;
  return /tread|pad/i.test(`${item.key} ${item.label}`);
}

export function suggestCondition(item: Pick<InspectionItem, 'key' | 'label' | 'unit' | 'kind'>, value: number | null): Condition | null {
  if (value === null || !hasWearHint(item)) return null;
  if (value >= 5) return 'good';
  if (value > 2) return 'attention';
  return 'urgent';
}

/** Parses what was typed in a measurement box: a number, null for empty, or 'invalid'. */
export function parseMeasurement(text: string): number | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d{0,5}(\.\d{0,2})?$/.test(t) || t === '-' || t === '.') return 'invalid';
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= 99999 ? n : 'invalid';
}

export function inspectionPath(repairOrderId: string, inspectionId: string): string {
  return `/repair-orders/${repairOrderId}/inspections/${inspectionId}`;
}

// Templates -------------------------------------------------------------------------------------------

export async function listTemplates(workshopId: string): Promise<InspectionTemplate[]> {
  const { data, error } = await supabase.from('inspection_templates').select('*').eq('workshop_id', workshopId).order('name');
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeTemplate).sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

/** The first problem with a template draft, or null (the database checks the same rules). */
export function templateProblem(name: string, items: TemplateItem[]): string | null {
  const n = name.trim();
  if (n.length < 1) return 'Give the template a name.';
  if (n.length > 80) return `The name can be at most 80 characters (now ${n.length}).`;
  if (items.length === 0) return 'Add at least one item to the checklist.';
  if (items.length > 300) return 'A checklist can have at most 300 items.';
  const keys = new Set<string>();
  for (const [i, it] of items.entries()) {
    const where = `Item ${i + 1}`;
    if (!it.label.trim()) return `${where} needs a name.`;
    if (it.label.trim().length > 120) return `${where}: the name can be at most 120 characters.`;
    if (!it.section.trim()) return `${where} needs a section.`;
    if (it.section.trim().length > 60) return `${where}: the section can be at most 60 characters.`;
    if ((it.unit ?? '').length > 12) return `${where}: the unit can be at most 12 characters.`;
    if ((it.help ?? '').length > 300) return `${where}: the help text can be at most 300 characters.`;
    if (keys.has(it.key)) return `${where} has the same key as another item.`;
    keys.add(it.key);
  }
  return null;
}

/** A unique key for a new item, from its name. */
export function newItemKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

function cleanItems(items: TemplateItem[]): TemplateItem[] {
  return items.map((it) => {
    const out: TemplateItem = { key: it.key, section: it.section.trim(), label: it.label.trim(), kind: it.kind };
    const unit = (it.unit ?? '').trim();
    const help = (it.help ?? '').trim();
    if (unit) out.unit = unit;
    if (help) out.help = help;
    return out;
  });
}

export async function createTemplate(workshopId: string, name: string, items: TemplateItem[]): Promise<InspectionTemplate> {
  const problem = templateProblem(name, items);
  if (problem) throw new Error(problem);
  const { data, error } = await supabase
    .from('inspection_templates')
    .insert({ workshop_id: workshopId, name: name.trim(), items: cleanItems(items) })
    .select('*')
    .single();
  if (error) fail(error);
  return normalizeTemplate(data as Record<string, unknown>);
}

export async function updateTemplate(id: string, name: string, items: TemplateItem[]): Promise<InspectionTemplate> {
  const problem = templateProblem(name, items);
  if (problem) throw new Error(problem);
  const { data, error } = await supabase.from('inspection_templates').update({ name: name.trim(), items: cleanItems(items) }).eq('id', id).select('*').maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error('That template was removed, or you do not have permission to change it.');
  return normalizeTemplate(data as Record<string, unknown>);
}

export async function duplicateTemplate(t: InspectionTemplate, existing: InspectionTemplate[]): Promise<InspectionTemplate> {
  const names = new Set(existing.map((x) => x.name));
  let name = `Copy of ${t.name}`.slice(0, 80);
  for (let n = 2; names.has(name); n += 1) name = `Copy ${n} of ${t.name}`.slice(0, 80);
  return createTemplate(t.workshop_id, name, t.items);
}

export async function deleteTemplate(t: InspectionTemplate): Promise<void> {
  if (t.is_default) throw new Error('The default template cannot be deleted. Make another template the default first.');
  const { data, error } = await supabase.from('inspection_templates').delete().eq('id', t.id).select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new Error('That template could not be deleted. It may be the default, or you do not have permission.');
}

export async function setDefaultTemplate(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_inspection_template', { p_template: id });
  if (error) fail(error);
}

// Inspections -----------------------------------------------------------------------------------------

export async function listInspections(repairOrderId: string): Promise<InspectionSummary[]> {
  if (!UUID.test(repairOrderId)) return [];
  const { data, error } = await supabase.from('inspections').select('*').eq('repair_order_id', repairOrderId).order('created_at', { ascending: false });
  if (error) fail(error);
  const list = (data ?? []) as Inspection[];
  if (list.length === 0) return [];
  const items = await supabase.from('inspection_items').select('inspection_id, condition').in('inspection_id', list.map((i) => i.id));
  if (items.error) fail(items.error);
  const rows = (items.data ?? []) as { inspection_id: string; condition: Condition | null }[];
  return list.map((i) => ({ ...i, counts: countItems(rows.filter((r) => r.inspection_id === i.id)) }));
}

export async function getInspection(id: string): Promise<InspectionDetail | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.from('inspections').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const inspection = data as Inspection;
  const items = await supabase.from('inspection_items').select('*').eq('inspection_id', id).order('sort_order');
  if (items.error) fail(items.error);
  const list = ((items.data ?? []) as Record<string, unknown>[]).map(normalizeItem);
  const media = await listInspectionMedia(inspection.repair_order_id, list.map((i) => i.id));
  return { inspection, items: list, media };
}

async function listInspectionMedia(repairOrderId: string, itemIds: string[]): Promise<InspectionMedia[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await supabase
    .from('repair_order_media')
    .select('*')
    .eq('repair_order_id', repairOrderId)
    .in('inspection_item_id', itemIds)
    .order('created_at');
  if (error) fail(error);
  return (data ?? []) as InspectionMedia[];
}

export async function startInspection(repairOrderId: string, templateId: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('start_inspection', { p_repair_order: repairOrderId, p_template: templateId });
  if (error) fail(error);
  return String(data);
}

export interface ItemValues {
  condition: Condition | null;
  measurement: number | null;
  note: string;
}

/** Saves the whole state of one item; sending the same values twice is harmless. */
export async function saveInspectionItem(itemId: string, values: ItemValues): Promise<InspectionItem> {
  const note = values.note.trim();
  if (note.length > 1000) throw new Error(`A note can be at most 1000 characters (now ${note.length}).`);
  const { data, error } = await supabase.rpc('update_inspection_item', {
    p_item: itemId,
    p_condition: values.condition,
    p_measurement: values.measurement,
    p_note: note || null,
  });
  if (error) fail(error);
  return normalizeItem(data as Record<string, unknown>);
}

export interface FindingInput {
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
}

/** Adds a finding as an estimate line waiting for approval. Returns the new line. */
export async function addFindingToEstimate(itemId: string, input: FindingInput): Promise<RepairItem> {
  const { data, error } = await supabase.rpc('add_inspection_finding_to_estimate', {
    p_item: itemId,
    p_kind: input.kind,
    p_description: input.description.trim(),
    p_quantity: input.quantity,
    p_unit_price: input.unit_price,
  });
  if (error) fail(error);
  const row = data as Record<string, unknown>;
  return { ...(row as unknown as RepairItem), quantity: Number(row.quantity), unit_price: Number(row.unit_price), sort_order: Number(row.sort_order) };
}

export async function completeInspection(id: string, summary: string): Promise<Inspection> {
  const { data, error } = await supabase.rpc('complete_inspection', { p_inspection: id, p_summary: summary.trim() || null });
  if (error) fail(error);
  return data as Inspection;
}

export async function sendInspection(id: string, summary: string): Promise<Inspection> {
  const { data, error } = await supabase.rpc('send_inspection', { p_inspection: id, p_summary: summary.trim() || null });
  if (error) fail(error);
  return data as Inspection;
}

export async function reopenInspection(id: string): Promise<Inspection> {
  const { data, error } = await supabase.rpc('reopen_inspection', { p_inspection: id });
  if (error) fail(error);
  return data as Inspection;
}

// Photos and videos of an item ------------------------------------------------------------------------

function mediaPath(order: Pick<RepairOrder, 'id' | 'workshop_id'>, file: File): string {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type.startsWith('video/') ? 'mp4' : 'jpg');
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${order.workshop_id}/${order.id}/${id}.${ext}`;
}

/**
 * Uploads a photo or video for one item, into the repair-media bucket like the other repair media. The database holds
 * it from the customer until the inspection is sent.
 */
export async function uploadInspectionMedia(order: Pick<RepairOrder, 'id' | 'workshop_id'>, itemId: string, file: File): Promise<InspectionMedia> {
  const problem = checkMedia(file);
  if (problem) throw new Error(problem);
  const path = mediaPath(order, file);
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const up = await bucket.upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message)) throw new Error('The repair-media storage bucket is missing. Apply migration 013 (npm run db:migrate).');
    if (/row-level security|unauthorized|403/i.test(up.error.message)) throw new Error('You do not have permission to add photos or videos.');
    if (/failed to fetch|network|load failed/i.test(up.error.message)) throw new Error(`No connection: ${file.name} was not uploaded. Try again when the Wi-Fi is back.`);
    throw new Error(`${file.name} could not be uploaded. ${up.error.message}`);
  }
  const { data, error } = await supabase
    .from('repair_order_media')
    .insert({
      repair_order_id: order.id,
      workshop_id: order.workshop_id,
      path,
      kind: file.type.startsWith('video/') ? 'video' : 'photo',
      visible_to_customer: false,
      inspection_item_id: itemId,
    })
    .select('*')
    .single();
  if (error) {
    await bucket.remove([path]);
    fail(error);
  }
  return data as InspectionMedia;
}

export async function setInspectionMediaVisible(id: string, visible: boolean): Promise<InspectionMedia> {
  const { data, error } = await supabase.from('repair_order_media').update({ visible_to_customer: visible }).eq('id', id).select('*').maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error('That photo or video was removed, or you do not have permission to change it.');
  return data as InspectionMedia;
}

// Live updates ----------------------------------------------------------------------------------------

export function subscribeInspections(repairOrderId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`inspections-${repairOrderId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections', filter: `repair_order_id=eq.${repairOrderId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
