/**
 * Repair orders (supabase/migrations/012 and 013): the job created when a booking is checked in, its line
 * items, timeline, photos and videos, and the message thread with the customer. Every call is checked by
 * row level security (repair-orders view to read, full to change); these functions only shape the data and
 * turn errors into sentences.
 */
import type { Tone } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { friendlyError } from './catalogue';
import type { AppointmentVehicle, Urgency } from './appointments';
import { CUSTOMER_SITE_URL } from '@/config/customerSite';
import { FALLBACK_TAX_COMPONENTS, computeTaxes, sumTaxes } from '@eurowerken/shared';
import type { TaxComponent, TaxLine } from '@eurowerken/shared';
import { getTaxSettings } from './taxes';

// Types ------------------------------------------------------------------------------------------

export const REPAIR_STATUSES = [
  'checked_in',
  'diagnosing',
  'awaiting_approval',
  'in_progress',
  'quality_check',
  'ready',
  'completed',
  'cancelled',
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  checked_in: 'Checked in',
  diagnosing: 'Diagnosing',
  awaiting_approval: 'Awaiting approval',
  in_progress: 'In progress',
  quality_check: 'Quality check',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const REPAIR_STATUS_TONE: Record<RepairStatus, Tone> = {
  checked_in: 'violet',
  diagnosing: 'info',
  awaiting_approval: 'warn',
  in_progress: 'info',
  quality_check: 'violet',
  ready: 'ok',
  completed: 'ok',
  cancelled: 'neutral',
};

/** The working steps, in order, for the stepper (cancelled is not a step). */
export const REPAIR_STEPS: RepairStatus[] = ['checked_in', 'diagnosing', 'awaiting_approval', 'in_progress', 'quality_check', 'ready', 'completed'];

export type ItemKind = 'service' | 'labour' | 'part' | 'fee';
export type Approval = 'approved' | 'pending' | 'declined';

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  service: 'Service',
  labour: 'Labour',
  part: 'Part',
  fee: 'Fee',
};

export interface RepairItem {
  id: string;
  repair_order_id: string;
  workshop_id: string;
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  service_id: string | null;
  part_id: string | null;
  approval: Approval;
  /** False for an exempt line: in the subtotal, not taxed (migration 029; true before it). */
  taxable: boolean;
  sort_order: number;
  created_at: string;
}

export interface RepairEvent {
  id: string;
  repair_order_id: string;
  kind: 'status' | 'note' | 'check_in' | 'approval';
  title: string;
  body: string | null;
  visible_to_customer: boolean;
  created_at: string;
}

export interface RepairMedia {
  id: string;
  repair_order_id: string;
  workshop_id: string;
  path: string;
  kind: 'photo' | 'video';
  caption: string | null;
  visible_to_customer: boolean;
  created_at: string;
}

export interface RepairMessage {
  id: string;
  repair_order_id: string;
  sender: 'staff' | 'customer';
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface RepairOrder {
  id: string;
  workshop_id: string;
  number: string;
  tracking_code: string;
  appointment_id: string | null;
  status: RepairStatus;
  customer_id: string | null;
  vehicle: AppointmentVehicle;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  urgency: Urgency;
  technician_id: string | null;
  customer_notes: string | null;
  staff_notes: string | null;
  labour_rate: number;
  promised_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A row of the list: the order, its technician's name and its totals. */
export interface RepairOrderSummary extends RepairOrder {
  technician_name: string | null;
  totals: RepairTotals;
}

/** One recorded customer decision (migration 018). Never changed once written. */
export interface RepairApproval {
  id: string;
  repair_order_id: string;
  /** Null when the item was deleted later; item_description keeps what it was. */
  item_id: string | null;
  item_description: string;
  /** Quantity x unit price at the moment of the decision, before tax. */
  amount: number;
  amount_with_tax: number;
  decision: 'approved' | 'declined';
  method: 'online' | 'phone';
  customer_email: string | null;
  signed_in: boolean;
  ip_address: string | null;
  user_agent: string | null;
  recorded_by: string | null;
  /** The staff member who recorded a phone decision ("staff" when their profile cannot be read). */
  recorded_by_name: string | null;
  note: string | null;
  decided_at: string;
}

export interface RepairOrderDetail {
  order: RepairOrder;
  items: RepairItem[];
  events: RepairEvent[];
  media: RepairMedia[];
  messages: RepairMessage[];
}

export interface RepairTotals {
  /** Approved items before tax. */
  subtotal: number;
  /** Items waiting for the customer (not in the subtotal). */
  pending: number;
  /** Approved, taxable items (the base every tax is charged on). */
  taxable: number;
  /** Each of the shop's taxes on the taxable amount, in order. */
  taxes: TaxLine[];
  /** All taxes together. */
  tax: number;
  /** @deprecated Same as `tax` (all taxes together), kept for older callers. */
  gst: number;
  /** Approved subtotal plus all taxes. */
  total: number;
}

/** @deprecated Taxes come from the shop's settings (api/taxes.ts useTaxSettings); this is only the fallback rate. */
export const GST_RATE = 0.05;
export const MEDIA_BUCKET = 'repair-media';
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'];

// Errors and rows ---------------------------------------------------------------------------------

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

function fail(err: DbError): never {
  const text = `${err.message} ${err.details ?? ''}`;
  if (err.code === 'P0001') throw new Error(err.message);
  if (err.code === '42P01' || err.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(text)) {
    throw new Error('The database is not set up for repair orders yet. Apply migrations 012 and 013 (npm run db:migrate).');
  }
  throw new Error(friendlyError(err));
}

const CHANGED_ELSEWHERE = 'Someone else changed this repair order a moment ago. It has been reloaded; check it and try again.';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const cents = (n: number) => Math.round(n * 100) / 100;

function normalizeOrder(row: Record<string, unknown>): RepairOrder {
  const vehicle = row.vehicle && typeof row.vehicle === 'object' ? (row.vehicle as AppointmentVehicle) : {};
  return {
    id: String(row.id),
    workshop_id: String(row.workshop_id),
    number: String(row.number ?? ''),
    tracking_code: String(row.tracking_code ?? ''),
    appointment_id: (row.appointment_id as string | null) ?? null,
    status: row.status as RepairStatus,
    customer_id: (row.customer_id as string | null) ?? null,
    vehicle,
    contact_name: String(row.contact_name ?? ''),
    contact_email: (row.contact_email as string | null) ?? null,
    contact_phone: (row.contact_phone as string | null) ?? null,
    urgency: ((row.urgency as Urgency | null) ?? 'routine') as Urgency,
    technician_id: (row.technician_id as string | null) ?? null,
    customer_notes: (row.customer_notes as string | null) ?? null,
    staff_notes: (row.staff_notes as string | null) ?? null,
    labour_rate: num(row.labour_rate),
    promised_at: (row.promised_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

function normalizeItem(row: Record<string, unknown>): RepairItem {
  return {
    ...(row as unknown as RepairItem),
    quantity: num(row.quantity),
    unit_price: num(row.unit_price),
    sort_order: num(row.sort_order),
    taxable: row.taxable !== false,
  };
}

const byOrder = (a: RepairItem, b: RepairItem) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
const byTime = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);

// Totals and labels ----------------------------------------------------------------------------------

export function lineTotal(item: Pick<RepairItem, 'quantity' | 'unit_price'>): number {
  return cents(item.quantity * item.unit_price);
}

type TotalsItem = Pick<RepairItem, 'quantity' | 'unit_price' | 'approval'> & { taxable?: boolean };

/**
 * Approved subtotal, each of the shop's taxes on the approved taxable lines, the total, and the amount still waiting
 * for the customer. Same math as the invoice in the database (each tax rounded half-up to the cent). Without
 * components it uses GST 5% (the fallback); pass useTaxSettings().components.
 */
export function repairTotals(items: TotalsItem[], components: readonly TaxComponent[] = FALLBACK_TAX_COMPONENTS): RepairTotals {
  let subtotal = 0;
  let taxable = 0;
  let pending = 0;
  for (const i of items) {
    if (i.approval === 'approved') {
      // Sum in cents so many lines never drift.
      const c = Math.round(lineTotal(i) * 100);
      subtotal += c;
      if (i.taxable !== false) taxable += c;
    } else if (i.approval === 'pending') pending += Math.round(lineTotal(i) * 100);
  }
  const taxes = computeTaxes(taxable / 100, components);
  const tax = sumTaxes(taxes);
  return {
    subtotal: subtotal / 100,
    taxable: taxable / 100,
    pending: pending / 100,
    taxes,
    tax,
    gst: tax,
    total: (subtotal + Math.round(tax * 100)) / 100,
  };
}

export function plateOf(v: AppointmentVehicle): string {
  return (v.plate ?? '').toString().trim();
}

/** Search across number, contact name, plate and tracking code (and email or phone), ignoring case. */
export function matchesRepairSearch(o: RepairOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [o.number, o.contact_name, plateOf(o.vehicle), o.tracking_code, o.contact_email ?? '', o.contact_phone ?? '']
    .some((x) => x.toLowerCase().includes(q));
}

export function countRepairStatuses(list: Pick<RepairOrder, 'status'>[]): Record<RepairStatus, number> {
  const out = Object.fromEntries(REPAIR_STATUSES.map((s) => [s, 0])) as Record<RepairStatus, number>;
  for (const o of list) out[o.status] += 1;
  return out;
}

export interface RepairAction {
  to: RepairStatus;
  label: string;
  /** The suggested next step (shown as the main button). */
  primary?: boolean;
}

/** The sensible next steps from a status (cancel is offered separately). */
export function repairActions(status: RepairStatus): RepairAction[] {
  switch (status) {
    case 'checked_in':
      return [{ to: 'diagnosing', label: 'Start diagnosis', primary: true }, { to: 'in_progress', label: 'Start repair' }];
    case 'diagnosing':
      return [{ to: 'awaiting_approval', label: 'Send for approval', primary: true }, { to: 'in_progress', label: 'Start repair' }];
    case 'awaiting_approval':
      return [{ to: 'in_progress', label: 'Start repair', primary: true }];
    case 'in_progress':
      return [{ to: 'quality_check', label: 'Quality check', primary: true }, { to: 'ready', label: 'Ready for pickup' }];
    case 'quality_check':
      return [{ to: 'ready', label: 'Ready for pickup', primary: true }, { to: 'in_progress', label: 'Back to repair' }];
    case 'ready':
      return [{ to: 'completed', label: 'Complete', primary: true }];
    default:
      return [];
  }
}

export function canCancel(status: RepairStatus): boolean {
  return status !== 'completed' && status !== 'cancelled';
}

/** The customer's tracking page for a repair, or null without a site slug. */
export function trackingLink(slug: string | null | undefined, code: string): string | null {
  if (!slug) return null;
  return `${CUSTOMER_SITE_URL}/${slug}/track?id=${encodeURIComponent(code)}`;
}

export function mediaUrl(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Reading ---------------------------------------------------------------------------------------------

// Items with * so the list still loads before migration 029 adds `taxable`.
const LIST_SELECT = '*, technician:team_members(name), items:repair_order_items(*)';

export interface RepairListFilter {
  status?: RepairStatus | 'all';
  search?: string;
}

/** The workshop's repair orders, newest first, with technician names and totals. Optional status and search. */
export async function listRepairOrders(workshopId: string, filter: RepairListFilter = {}): Promise<RepairOrderSummary[]> {
  let q = supabase.from('repair_orders').select(LIST_SELECT).eq('workshop_id', workshopId).order('created_at', { ascending: false }).limit(1000);
  if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
  // The shop's taxes for the totals (cached); GST 5% if they cannot be read.
  const [{ data, error }, taxSettings] = await Promise.all([q, getTaxSettings(workshopId).catch(() => null)]);
  if (error) fail(error);
  const components = taxSettings?.components ?? FALLBACK_TAX_COMPONENTS;
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const tech = row.technician as { name?: string } | null;
    const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
    return {
      ...normalizeOrder(row),
      technician_name: tech?.name ?? null,
      totals: repairTotals(items.map((i) => ({ quantity: num(i.quantity), unit_price: num(i.unit_price), approval: i.approval as Approval, taxable: i.taxable !== false })), components),
    };
  });
  return filter.search ? rows.filter((o) => matchesRepairSearch(o, filter.search ?? '')) : rows;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRepairOrderRow(id: string): Promise<RepairOrder | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.from('repair_orders').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  return data ? normalizeOrder(data as Record<string, unknown>) : null;
}

/** One repair order with its items, timeline (oldest first), media and messages. Null when not found. */
export async function getRepairOrder(id: string): Promise<RepairOrderDetail | null> {
  if (!UUID.test(id)) return null;
  const [order, items, events, media, messages] = await Promise.all([
    getRepairOrderRow(id),
    supabase.from('repair_order_items').select('*').eq('repair_order_id', id),
    supabase.from('repair_order_events').select('*').eq('repair_order_id', id).order('created_at'),
    supabase.from('repair_order_media').select('*').eq('repair_order_id', id).order('created_at'),
    supabase.from('repair_order_messages').select('*').eq('repair_order_id', id).order('created_at'),
  ]);
  if (!order) return null;
  for (const r of [items, events, media, messages]) if (r.error) fail(r.error);
  return {
    order,
    items: ((items.data ?? []) as Record<string, unknown>[]).map(normalizeItem).sort(byOrder),
    events: ((events.data ?? []) as RepairEvent[]).sort(byTime),
    media: ((media.data ?? []) as RepairMedia[]).sort(byTime),
    messages: ((messages.data ?? []) as RepairMessage[]).sort(byTime),
  };
}

export async function listRepairItems(orderId: string): Promise<RepairItem[]> {
  const { data, error } = await supabase.from('repair_order_items').select('*').eq('repair_order_id', orderId);
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeItem).sort(byOrder);
}

export async function listRepairEvents(orderId: string): Promise<RepairEvent[]> {
  const { data, error } = await supabase.from('repair_order_events').select('*').eq('repair_order_id', orderId).order('created_at');
  if (error) fail(error);
  return (data ?? []) as RepairEvent[];
}

export async function listRepairMessages(orderId: string): Promise<RepairMessage[]> {
  const { data, error } = await supabase.from('repair_order_messages').select('*').eq('repair_order_id', orderId).order('created_at');
  if (error) fail(error);
  return (data ?? []) as RepairMessage[];
}

/**
 * Live changes for one repair order (the order, its items, timeline and messages). Calls onChange with the
 * table that changed. Returns the unsubscribe function.
 */
export function subscribeRepairOrder(orderId: string, onChange: (table: 'repair_orders' | 'repair_order_items' | 'repair_order_events' | 'repair_order_messages') => void): () => void {
  const channel = supabase.channel(`repair-order:${orderId}:${Math.random().toString(36).slice(2)}`);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'repair_orders', filter: `id=eq.${orderId}` }, () => onChange('repair_orders'));
  for (const table of ['repair_order_items', 'repair_order_events', 'repair_order_messages'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `repair_order_id=eq.${orderId}` }, () => onChange(table));
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Live changes to any repair order of the workshop (for the list). Returns the unsubscribe function. */
export function subscribeRepairOrders(workshopId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`repair-orders:${workshopId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_orders', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_order_items', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// Updating the order ------------------------------------------------------------------------------------

/** Changes the status, only if nobody changed it in the meantime. The database writes the timeline entry. */
export async function updateRepairStatus(order: RepairOrder, to: RepairStatus): Promise<RepairOrder> {
  if (order.status === to) return order;
  const { data, error } = await supabase
    .from('repair_orders')
    .update({ status: to })
    .eq('id', order.id)
    .eq('status', order.status)
    .select('*')
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error(CHANGED_ELSEWHERE);
  return normalizeOrder(data as Record<string, unknown>);
}

export interface RepairOrderPatch {
  technician_id?: string | null;
  promised_at?: string | null;
  staff_notes?: string | null;
}

export async function updateRepairOrder(id: string, patch: RepairOrderPatch): Promise<RepairOrder> {
  const clean: RepairOrderPatch = { ...patch };
  if (clean.staff_notes !== undefined) {
    const notes = (clean.staff_notes ?? '').trim();
    if (notes.length > 4000) throw new Error(`Staff notes can be at most 4000 characters (now ${notes.length}).`);
    clean.staff_notes = notes || null;
  }
  if (clean.technician_id !== undefined) clean.technician_id = clean.technician_id || null;
  const { data, error } = await supabase.from('repair_orders').update(clean).eq('id', id).select('*').maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error('The repair order was not found, or you do not have permission to change it.');
  return normalizeOrder(data as Record<string, unknown>);
}

// Line items ---------------------------------------------------------------------------------------------

export interface ItemInput {
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  service_id?: string | null;
  part_id?: string | null;
}

/** Checks a line item; returns the first problem, or null. */
export function itemProblem(input: Pick<ItemInput, 'description' | 'quantity' | 'unit_price'>): string | null {
  const d = input.description.trim();
  if (d.length < 1) return 'Enter a description.';
  if (d.length > 300) return `The description can be at most 300 characters (now ${d.length}).`;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return 'The quantity must be more than 0.';
  if (input.quantity > 99_999_999) return 'The quantity is too large.';
  if (!Number.isFinite(input.unit_price) || input.unit_price < 0) return 'The price cannot be negative.';
  if (input.unit_price > 99_999_999) return 'The price is too large.';
  return null;
}

export async function addRepairItem(order: Pick<RepairOrder, 'id' | 'workshop_id'>, existing: RepairItem[], input: ItemInput): Promise<RepairItem> {
  const problem = itemProblem(input);
  if (problem) throw new Error(problem);
  const sort = existing.reduce((m, i) => Math.max(m, i.sort_order), 0) + 10;
  const { data, error } = await supabase
    .from('repair_order_items')
    .insert({
      repair_order_id: order.id,
      workshop_id: order.workshop_id,
      kind: input.kind,
      description: input.description.trim(),
      quantity: cents(input.quantity),
      unit_price: cents(input.unit_price),
      service_id: input.service_id ?? null,
      part_id: input.part_id ?? null,
      approval: 'approved',
      sort_order: sort,
    })
    .select('*')
    .single();
  if (error) fail(error);
  return normalizeItem(data as Record<string, unknown>);
}

export interface ItemPatch {
  description?: string;
  quantity?: number;
  unit_price?: number;
  /** Only back to pending: approved and declined are recorded with recordPhoneApproval or by the customer online. */
  approval?: 'pending';
  /** False for an exempt line (migration 029). */
  taxable?: boolean;
}

export async function updateRepairItem(item: RepairItem, patch: ItemPatch): Promise<RepairItem> {
  const next = { ...item, ...patch };
  const problem = itemProblem(next);
  if (problem) throw new Error(problem);
  const clean: ItemPatch = { ...patch };
  if (clean.description !== undefined) clean.description = clean.description.trim();
  if (clean.quantity !== undefined) clean.quantity = cents(clean.quantity);
  if (clean.unit_price !== undefined) clean.unit_price = cents(clean.unit_price);
  const { data, error } = await supabase.from('repair_order_items').update(clean).eq('id', item.id).select('*').maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error('That line item was removed, or you do not have permission to change it.');
  return normalizeItem(data as Record<string, unknown>);
}

export async function deleteRepairItem(id: string): Promise<void> {
  const { error } = await supabase.from('repair_order_items').delete().eq('id', id);
  if (error) fail(error);
}

/** Saves a new order of the items (ids in the order wanted). */
export async function reorderRepairItems(ids: string[]): Promise<void> {
  const results = await Promise.all(ids.map((id, i) => supabase.from('repair_order_items').update({ sort_order: (i + 1) * 10 }).eq('id', id)));
  const bad = results.find((r) => r.error);
  if (bad?.error) fail(bad.error);
}

/** Moves one item up or down; returns the reordered list (already saved). */
export async function moveRepairItem(items: RepairItem[], id: string, direction: -1 | 1): Promise<RepairItem[]> {
  const i = items.findIndex((x) => x.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  await reorderRepairItems(next.map((x) => x.id));
  return next.map((x, k) => ({ ...x, sort_order: (k + 1) * 10 }));
}

/**
 * Asks the customer to approve items: they become pending (shown on the tracking page with approve and
 * decline buttons) and the repair order moves to awaiting approval.
 */
export async function requestApproval(order: RepairOrder, itemIds: string[]): Promise<RepairOrder> {
  if (itemIds.length === 0) throw new Error('Choose at least one item for the customer to approve.');
  const { error } = await supabase.from('repair_order_items').update({ approval: 'pending' }).in('id', itemIds).eq('repair_order_id', order.id);
  if (error) fail(error);
  if (order.status === 'awaiting_approval') return order;
  if (!canCancel(order.status)) throw new Error('A completed or cancelled repair order cannot be sent for approval.');
  return updateRepairStatus(order, 'awaiting_approval');
}

// Approval records (migration 018) ---------------------------------------------------------------------

export const PHONE_NOTE_MIN = 3;
export const PHONE_NOTE_MAX = 500;

/**
 * Every recorded decision for a repair order, oldest first. The staff member behind a phone approval is
 * shown by name when their profile can be read (your own, or everyone with Users & Roles access), else "staff".
 */
export async function listApprovals(repairOrderId: string): Promise<RepairApproval[]> {
  if (!UUID.test(repairOrderId)) return [];
  const { data, error } = await supabase
    .from('repair_item_approvals')
    .select('*')
    .eq('repair_order_id', repairOrderId)
    .order('decided_at', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/i.test(error.message)) {
      throw new Error('The database is not set up for approval records yet. Apply migration 018 (npm run db:migrate).');
    }
    fail(error);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const staffIds = [...new Set(rows.map((r) => r.recorded_by).filter((x): x is string => typeof x === 'string'))];
  const names = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: people } = await supabase.from('profiles').select('id, full_name, email').in('id', staffIds);
    for (const p of (people ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      const name = p.full_name?.trim() || p.email?.split('@')[0] || '';
      if (name) names.set(p.id, name);
    }
  }
  return rows.map((r) => {
    const by = (r.recorded_by as string | null) ?? null;
    return {
      id: String(r.id),
      repair_order_id: String(r.repair_order_id),
      item_id: (r.item_id as string | null) ?? null,
      item_description: String(r.item_description ?? ''),
      amount: num(r.amount),
      amount_with_tax: num(r.amount_with_tax),
      decision: r.decision === 'declined' ? 'declined' : 'approved',
      method: r.method === 'phone' ? 'phone' : 'online',
      customer_email: (r.customer_email as string | null) ?? null,
      signed_in: Boolean(r.signed_in),
      ip_address: (r.ip_address as string | null) ?? null,
      user_agent: (r.user_agent as string | null) ?? null,
      recorded_by: by,
      recorded_by_name: by ? (names.get(by) ?? 'staff') : r.method === 'phone' ? 'staff' : null,
      note: (r.note as string | null) ?? null,
      decided_at: String(r.decided_at),
    };
  });
}

/** The latest record for each item id (items whose record was for a deleted item are not included). */
export function latestApprovalByItem(records: RepairApproval[]): Map<string, RepairApproval> {
  const out = new Map<string, RepairApproval>();
  for (const r of records) {
    if (!r.item_id) continue;
    const prev = out.get(r.item_id);
    if (!prev || prev.decided_at <= r.decided_at) out.set(r.item_id, r);
  }
  return out;
}

/** Checks the phone note; returns the problem, or null. */
export function phoneNoteProblem(note: string): string | null {
  const n = note.trim();
  if (n.length < PHONE_NOTE_MIN) return 'Add a short note, for example who you spoke to and when.';
  if (n.length > PHONE_NOTE_MAX) return `The note can be at most ${PHONE_NOTE_MAX} characters (now ${n.length}).`;
  return null;
}

/**
 * Records a decision the customer gave by phone for pending items (needs full Repair Orders access). The
 * database records each decision with who recorded it, applies it, and moves an order that was awaiting
 * approval to in progress when nothing is pending any more.
 */
export async function recordPhoneApproval(repairOrderId: string, itemIds: string[], decision: 'approved' | 'declined', note: string): Promise<void> {
  if (itemIds.length === 0) throw new Error('Tick at least one item.');
  const problem = phoneNoteProblem(note);
  if (problem) throw new Error(problem);
  const { error } = await supabase.rpc('record_phone_approval', {
    p_repair_order: repairOrderId,
    p_item_ids: itemIds,
    p_decision: decision,
    p_note: note.trim(),
  });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
      throw new Error('The database is not set up for phone approvals yet. Apply migration 018 (npm run db:migrate).');
    }
    fail(error);
  }
}

// Timeline, media and messages ------------------------------------------------------------------------------

export async function addRepairNote(order: Pick<RepairOrder, 'id' | 'workshop_id'>, body: string, visibleToCustomer: boolean): Promise<RepairEvent> {
  const text = body.trim();
  if (!text) throw new Error('Write the note first.');
  if (text.length > 2000) throw new Error(`A note can be at most 2000 characters (now ${text.length}).`);
  const { data, error } = await supabase
    .from('repair_order_events')
    .insert({
      repair_order_id: order.id,
      workshop_id: order.workshop_id,
      kind: 'note',
      title: visibleToCustomer ? 'Update from the workshop' : 'Staff note',
      body: text,
      visible_to_customer: visibleToCustomer,
    })
    .select('*')
    .single();
  if (error) fail(error);
  return data as RepairEvent;
}

/** A problem with a file before uploading, or null. */
export function checkMedia(file: File): string | null {
  const type = file.type || '';
  if (!MEDIA_TYPES.includes(type)) return `${file.name}: only JPEG, PNG, WebP or HEIC photos and MP4, MOV or WebM videos can be added.`;
  if (file.size > MAX_MEDIA_BYTES) return `${file.name} is larger than 50 MB.`;
  return null;
}

function mediaPath(order: Pick<RepairOrder, 'id' | 'workshop_id'>, file: File): string {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type.startsWith('video/') ? 'mp4' : 'jpg');
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${order.workshop_id}/${order.id}/${id}.${ext}`;
}

/** Uploads one photo or video and records it (visible to the customer by default). */
export async function uploadRepairMedia(order: Pick<RepairOrder, 'id' | 'workshop_id'>, file: File): Promise<RepairMedia> {
  const problem = checkMedia(file);
  if (problem) throw new Error(problem);
  const path = mediaPath(order, file);
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const up = await bucket.upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message)) throw new Error('The repair-media storage bucket is missing. Apply migration 013 (npm run db:migrate).');
    if (/row-level security|unauthorized|403/i.test(up.error.message)) throw new Error('You do not have permission to add photos or videos.');
    throw new Error(`${file.name} could not be uploaded. ${up.error.message}`);
  }
  const { data, error } = await supabase
    .from('repair_order_media')
    .insert({
      repair_order_id: order.id,
      workshop_id: order.workshop_id,
      path,
      kind: file.type.startsWith('video/') ? 'video' : 'photo',
      visible_to_customer: true,
    })
    .select('*')
    .single();
  if (error) {
    await bucket.remove([path]);
    fail(error);
  }
  return data as RepairMedia;
}

export async function updateRepairMedia(id: string, patch: { caption?: string | null; visible_to_customer?: boolean }): Promise<RepairMedia> {
  const clean = { ...patch };
  if (clean.caption !== undefined) {
    const c = (clean.caption ?? '').trim();
    if (c.length > 200) throw new Error(`A caption can be at most 200 characters (now ${c.length}).`);
    clean.caption = c || null;
  }
  const { data, error } = await supabase.from('repair_order_media').update(clean).eq('id', id).select('*').maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error('That photo or video was removed, or you do not have permission to change it.');
  return data as RepairMedia;
}

/** Deletes the record and its file. */
export async function deleteRepairMedia(media: Pick<RepairMedia, 'id' | 'path'>): Promise<void> {
  const { error } = await supabase.from('repair_order_media').delete().eq('id', media.id);
  if (error) fail(error);
  const removed = await supabase.storage.from(MEDIA_BUCKET).remove([media.path]);
  if (removed.error) console.warn('The file could not be removed from storage:', removed.error.message);
}

export async function sendRepairMessage(order: Pick<RepairOrder, 'id' | 'workshop_id'>, body: string): Promise<RepairMessage> {
  const text = body.trim();
  if (!text) throw new Error('Write a message first.');
  if (text.length > 2000) throw new Error(`A message can be at most 2000 characters (now ${text.length}).`);
  const { data, error } = await supabase
    .from('repair_order_messages')
    .insert({ repair_order_id: order.id, workshop_id: order.workshop_id, sender: 'staff', body: text })
    .select('*')
    .single();
  if (error) fail(error);
  return data as RepairMessage;
}
