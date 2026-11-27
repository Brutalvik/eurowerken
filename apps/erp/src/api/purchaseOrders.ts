/**
 * Purchase orders (supabase/migrations/031): ordering parts from suppliers and receiving them into inventory.
 *
 *   draft -> sent -> partial -> received, or cancelled
 *
 * Drafts are edited directly (lines, supplier, notes, expected date); every status change goes through a database
 * function that checks access and locks the order: mark_po_sent, attach_po_pdf_and_send (Email to supplier),
 * receive_po_lines (adds stock to linked parts and records their latest cost), cancel_po, and create_po_from_repair.
 * Parts Inventory view reads, full changes; Repair Orders full may start a draft from a repair order.
 *
 * The PO PDF is made in the browser with pdf-lib (pages/purchasing/poPdf.ts, loaded only when needed), stored in the
 * private "documents" bucket at <workshop_id>/po/<po_id>.pdf, then attach_po_pdf_and_send queues the supplier email,
 * which the customer-mailer Edge Function sends with the PDF attached.
 */
import type { Tone } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { setupError } from './suppliers';
import type { Supplier } from './suppliers';

export { PURCHASING_SETUP_MESSAGE } from './suppliers';

// Types ------------------------------------------------------------------------------------------------------

export const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Draft',
  sent: 'Ordered',
  partial: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const PO_STATUS_TONE: Record<PoStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  partial: 'warn',
  received: 'ok',
  cancelled: 'bad',
};

/** Orders still waiting for parts. */
export const OPEN_STATUSES: PoStatus[] = ['sent', 'partial'];

export interface PurchaseOrder {
  id: string;
  workshop_id: string;
  number: string;
  supplier_id: string;
  status: PoStatus;
  repair_order_id: string | null;
  notes: string | null;
  /** A date (yyyy-mm-dd), no time. */
  expected_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  pdf_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoLine {
  id: string;
  po_id: string;
  workshop_id: string;
  part_id: string | null;
  description: string;
  part_number: string | null;
  quantity: number;
  unit_cost: number;
  received_qty: number;
  repair_order_item_id: string | null;
  sort_order: number;
  created_at: string;
}

/** A row of the list: the order, its supplier and repair, and its totals. */
export interface PoSummary extends PurchaseOrder {
  supplier_name: string;
  repair_number: string | null;
  line_count: number;
  total: number;
  /** Units still to come. */
  outstanding: number;
  /** Value of what is still to come. */
  outstanding_value: number;
  /** Inventory parts on the order. */
  part_ids: string[];
  /** Repair order lines on the order. */
  item_ids: string[];
}

export interface PoReceipt {
  id: string;
  line_id: string;
  quantity: number;
  unit_cost: number;
  received_by: string | null;
  received_at: string;
}

export type OutboxState = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface PoEmail {
  id: string;
  to_address: string;
  state: OutboxState;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export const EMAIL_STATE_LABEL: Record<OutboxState, string> = {
  pending: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Not sent',
};

export const EMAIL_STATE_TONE: Record<OutboxState, Tone> = {
  pending: 'warn',
  sending: 'info',
  sent: 'ok',
  failed: 'bad',
  skipped: 'neutral',
};

export interface PoDetail {
  order: PurchaseOrder;
  lines: PoLine[];
  supplier: Supplier | null;
  repair: { id: string; number: string } | null;
}

// Shaping ------------------------------------------------------------------------------------------------------

type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOrder(row: Row): PurchaseOrder {
  return {
    id: String(row.id),
    workshop_id: String(row.workshop_id),
    number: String(row.number),
    supplier_id: String(row.supplier_id),
    status: row.status as PoStatus,
    repair_order_id: (row.repair_order_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    expected_at: (row.expected_at as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    received_at: (row.received_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    pdf_path: (row.pdf_path as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeLine(row: Row): PoLine {
  return {
    id: String(row.id),
    po_id: String(row.po_id),
    workshop_id: String(row.workshop_id),
    part_id: (row.part_id as string | null) ?? null,
    description: String(row.description ?? ''),
    part_number: (row.part_number as string | null) ?? null,
    quantity: num(row.quantity),
    unit_cost: num(row.unit_cost),
    received_qty: num(row.received_qty),
    repair_order_item_id: (row.repair_order_item_id as string | null) ?? null,
    sort_order: num(row.sort_order),
    created_at: String(row.created_at),
  };
}

function one<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return (v as T) ?? null;
}

function summarize(row: Row): PoSummary {
  const lines = (Array.isArray(row.lines) ? row.lines : []) as Row[];
  const supplier = one<{ name?: string }>(row.supplier);
  const repair = one<{ number?: string }>(row.repair);
  return {
    ...normalizeOrder(row),
    supplier_name: supplier?.name ?? 'Supplier',
    repair_number: repair?.number ?? null,
    line_count: lines.length,
    total: poTotal(lines.map((l) => ({ quantity: num(l.quantity), unit_cost: num(l.unit_cost) }))),
    outstanding: lines.reduce((a, l) => a + Math.max(0, num(l.quantity) - num(l.received_qty)), 0),
    outstanding_value:
      Math.round(lines.reduce((a, l) => a + Math.max(0, num(l.quantity) - num(l.received_qty)) * num(l.unit_cost), 0) * 100) / 100,
    part_ids: lines.map((l) => l.part_id).filter((x): x is string => typeof x === 'string'),
    item_ids: lines.map((l) => l.repair_order_item_id).filter((x): x is string => typeof x === 'string'),
  };
}

// Sums and checks ----------------------------------------------------------------------------------------------

export function lineTotal(l: Pick<PoLine, 'quantity' | 'unit_cost'>): number {
  return Math.round(l.quantity * l.unit_cost * 100) / 100;
}

export function poTotal(lines: Pick<PoLine, 'quantity' | 'unit_cost'>[]): number {
  return Math.round(lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0) * 100) / 100;
}

export function remaining(l: Pick<PoLine, 'quantity' | 'received_qty'>): number {
  return Math.max(0, Math.round((l.quantity - l.received_qty) * 100) / 100);
}

/** "2", "1.5" */
export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** True when n has at most two decimals (allowing for floating point). */
export function twoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export interface LineInput {
  part_id: string | null;
  description: string;
  part_number: string | null;
  quantity: number;
  unit_cost: number;
}

/** The database rules for a line, checked before anything is sent. Returns a sentence, or null when fine. */
export function lineProblem(l: Pick<LineInput, 'part_id' | 'description' | 'part_number' | 'quantity' | 'unit_cost'>): string | null {
  const d = l.description.trim();
  if (d.length < 1) return 'Describe the part (or pick one from inventory).';
  if (d.length > 300) return 'The description can be at most 300 characters.';
  if ((l.part_number ?? '').trim().length > 60) return 'The part number can be at most 60 characters.';
  if (!Number.isFinite(l.quantity) || l.quantity <= 0) return 'The quantity must be more than 0.';
  if (l.quantity > 100000) return 'The quantity is too large.';
  if (!twoDecimals(l.quantity)) return 'Use at most two decimals for the quantity.';
  if (l.part_id && !Number.isInteger(l.quantity)) return 'Stock is counted in whole units: order a whole number of this part.';
  if (!Number.isFinite(l.unit_cost) || l.unit_cost < 0) return 'The unit cost must be 0 or more.';
  if (l.unit_cost > 10_000_000) return 'The unit cost is too large.';
  if (!twoDecimals(l.unit_cost)) return 'Use at most two decimals for the unit cost.';
  return null;
}

/** True while lines, supplier and the order can still be edited. */
export function isDraft(po: Pick<PurchaseOrder, 'status'>): boolean {
  return po.status === 'draft';
}

export function canReceive(po: Pick<PurchaseOrder, 'status'>): boolean {
  return po.status === 'draft' || po.status === 'sent' || po.status === 'partial';
}

export function canCancel(po: Pick<PurchaseOrder, 'status'>): boolean {
  return po.status === 'draft' || po.status === 'sent' || po.status === 'partial';
}

export function canEmail(po: Pick<PurchaseOrder, 'status'>): boolean {
  return po.status === 'draft' || po.status === 'sent' || po.status === 'partial';
}

// Reading ------------------------------------------------------------------------------------------------------

const SUMMARY_SELECT = '*, supplier:suppliers(name), repair:repair_orders(number), lines:purchase_order_lines(part_id, repair_order_item_id, quantity, unit_cost, received_qty)';

export async function listPurchaseOrders(workshopId: string): Promise<PoSummary[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(SUMMARY_SELECT)
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw setupError(error);
  return ((data ?? []) as Row[]).map(summarize);
}

/** The purchase orders started from one repair order (any status), newest first. */
export async function listRepairPurchaseOrders(repairOrderId: string): Promise<PoSummary[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(SUMMARY_SELECT)
    .eq('repair_order_id', repairOrderId)
    .order('created_at', { ascending: false });
  if (error) throw setupError(error);
  return ((data ?? []) as Row[]).map(summarize);
}

export async function getPurchaseOrder(id: string): Promise<PoDetail | null> {
  const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw setupError(error);
  if (!data) return null;
  const order = normalizeOrder(data as Row);
  const [lines, supplier, repair] = await Promise.all([
    listPoLines(order.id),
    supabase.from('suppliers').select('*').eq('id', order.supplier_id).maybeSingle(),
    order.repair_order_id
      ? supabase.from('repair_orders').select('id, number').eq('id', order.repair_order_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (supplier.error) throw setupError(supplier.error);
  return {
    order,
    lines,
    supplier: (supplier.data as Supplier | null) ?? null,
    // Null when the user cannot see repair orders; the link is then left out.
    repair: (repair.data as { id: string; number: string } | null) ?? null,
  };
}

export async function getPurchaseOrderRow(id: string): Promise<PurchaseOrder | null> {
  const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw setupError(error);
  return data ? normalizeOrder(data as Row) : null;
}

export async function listPoLines(poId: string): Promise<PoLine[]> {
  const { data, error } = await supabase.from('purchase_order_lines').select('*').eq('po_id', poId).order('sort_order').order('created_at');
  if (error) throw setupError(error);
  return ((data ?? []) as Row[]).map(normalizeLine);
}

export async function listPoReceipts(poId: string): Promise<PoReceipt[]> {
  const { data, error } = await supabase
    .from('purchase_order_receipts')
    .select('id, line_id, quantity, unit_cost, received_by, received_at')
    .eq('po_id', poId)
    .order('received_at', { ascending: false });
  if (error) throw setupError(error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    line_id: String(r.line_id),
    quantity: num(r.quantity),
    unit_cost: num(r.unit_cost),
    received_by: (r.received_by as string | null) ?? null,
    received_at: String(r.received_at),
  }));
}

export async function listPoEmails(poId: string): Promise<PoEmail[]> {
  const { data, error } = await supabase
    .from('supplier_outbox')
    .select('id, to_address, state, attempts, last_error, created_at, sent_at')
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: false });
  if (error) throw setupError(error);
  return (data ?? []) as PoEmail[];
}

export interface OnOrder {
  on_order: number;
  open_orders: number;
}

/** Per part id: units ordered and not yet received on sent and partly received orders. */
export async function getOnOrder(): Promise<Map<string, OnOrder>> {
  const { data, error } = await supabase.rpc('part_on_order');
  if (error) throw setupError(error);
  return new Map(((data ?? []) as Row[]).map((r) => [String(r.part_id), { on_order: num(r.on_order), open_orders: num(r.open_orders) }]));
}

// Live changes -------------------------------------------------------------------------------------------------

export function subscribePurchaseOrder(poId: string, onChange: (table: 'purchase_orders' | 'purchase_order_lines' | 'supplier_outbox') => void): () => void {
  const channel = supabase
    .channel(`purchase-order:${poId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders', filter: `id=eq.${poId}` }, () => onChange('purchase_orders'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_lines', filter: `po_id=eq.${poId}` }, () => onChange('purchase_order_lines'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_outbox', filter: `purchase_order_id=eq.${poId}` }, () => onChange('supplier_outbox'))
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribePurchaseOrders(workshopId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`purchase-orders:${workshopId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_lines', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// Drafts -------------------------------------------------------------------------------------------------------

/** A new empty draft; the database gives it the next number (PO-0001...). */
export async function createPurchaseOrder(workshopId: string, supplierId: string): Promise<PurchaseOrder> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({ workshop_id: workshopId, supplier_id: supplierId })
    .select('*')
    .single();
  if (error) throw setupError(error);
  return normalizeOrder(data as Row);
}

export interface PoPatch {
  supplier_id?: string;
  notes?: string | null;
  expected_at?: string | null;
}

export async function updatePurchaseOrder(id: string, patch: PoPatch): Promise<PurchaseOrder> {
  const clean: PoPatch = { ...patch };
  if ('notes' in clean) clean.notes = clean.notes?.trim() ? clean.notes.trim() : null;
  if ('expected_at' in clean) clean.expected_at = clean.expected_at || null;
  const { data, error } = await supabase.from('purchase_orders').update(clean).eq('id', id).select('*').single();
  if (error) throw setupError(error);
  return normalizeOrder(data as Row);
}

/** Deletes a draft (anything else is cancelled instead). */
export async function deleteDraft(id: string): Promise<void> {
  const { data, error } = await supabase.from('purchase_orders').delete().eq('id', id).eq('status', 'draft').select('id');
  if (error) throw setupError(error);
  if (!data || data.length === 0) throw new Error('Only a draft can be deleted. It may have been sent meanwhile: reload the page.');
}

export async function addPoLine(po: Pick<PurchaseOrder, 'id' | 'workshop_id'>, existing: PoLine[], input: LineInput): Promise<PoLine> {
  const problem = lineProblem(input);
  if (problem) throw new Error(problem);
  const sort = existing.reduce((m, l) => Math.max(m, l.sort_order), 0) + 10;
  const { data, error } = await supabase
    .from('purchase_order_lines')
    .insert({
      po_id: po.id,
      workshop_id: po.workshop_id,
      part_id: input.part_id,
      description: input.description.trim(),
      part_number: input.part_number?.trim() || null,
      quantity: input.quantity,
      unit_cost: input.unit_cost,
      sort_order: sort,
    })
    .select('*')
    .single();
  if (error) throw setupError(error);
  return normalizeLine(data as Row);
}

export async function updatePoLine(line: PoLine, patch: Partial<LineInput>): Promise<PoLine> {
  const next = { ...line, ...patch };
  const problem = lineProblem(next);
  if (problem) throw new Error(problem);
  const body: Partial<LineInput> = { ...patch };
  if (body.description !== undefined) body.description = body.description.trim();
  if (body.part_number !== undefined) body.part_number = body.part_number?.trim() || null;
  const { data, error } = await supabase.from('purchase_order_lines').update(body).eq('id', line.id).select('*').single();
  if (error) throw setupError(error);
  return normalizeLine(data as Row);
}

export async function deletePoLine(id: string): Promise<void> {
  const { data, error } = await supabase.from('purchase_order_lines').delete().eq('id', id).select('id');
  if (error) throw setupError(error);
  if (!data || data.length === 0) throw new Error('The line was not deleted. The order may have been sent meanwhile: reload the page.');
}

// Status changes -------------------------------------------------------------------------------------------------

async function rpcOrder(fn: string, args: Record<string, unknown>): Promise<PurchaseOrder> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw setupError(error);
  const row = one<Row>(data);
  if (!row) throw new Error('The purchase order was not returned. Reload the page.');
  return normalizeOrder(row);
}

/** Draft from a repair order's part lines; returns the new order. */
export function createPoFromRepair(repairOrderId: string, supplierId: string, itemIds: string[]): Promise<PurchaseOrder> {
  if (itemIds.length === 0) return Promise.reject(new Error('Choose at least one part line.'));
  return rpcOrder('create_po_from_repair', { p_repair_order: repairOrderId, p_supplier: supplierId, p_item_ids: itemIds });
}

/** Ordered by phone, online or at the counter. */
export function markPoSent(poId: string): Promise<PurchaseOrder> {
  return rpcOrder('mark_po_sent', { p_po: poId });
}

export function cancelPo(poId: string): Promise<PurchaseOrder> {
  return rpcOrder('cancel_po', { p_po: poId });
}

export interface ReceiveLine {
  line_id: string;
  qty: number;
  /** Leave out to keep the line's cost. */
  unit_cost?: number;
}

/** All or nothing: a bad line refuses the whole receipt and nothing changes. */
export function receivePoLines(poId: string, lines: ReceiveLine[]): Promise<PurchaseOrder> {
  const list = lines.filter((l) => l.qty > 0);
  if (list.length === 0) return Promise.reject(new Error('Enter a quantity to receive for at least one line.'));
  return rpcOrder('receive_po_lines', { p_po: poId, p_lines: list });
}

// PDF and email ------------------------------------------------------------------------------------------------

export const DOCUMENTS_BUCKET = 'documents';

/** Where a purchase order's PDF is stored; attach_po_pdf_and_send accepts only this path. */
export function poPdfPath(po: Pick<PurchaseOrder, 'id' | 'workshop_id'>): string {
  return `${po.workshop_id}/po/${po.id}.pdf`;
}

function loadPdfModule() {
  return import('@/pages/purchasing/poPdf');
}

/** Builds the PO PDF fresh from the database. */
export async function buildPoPdf(poId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
  const m = await loadPdfModule();
  const doc = await m.loadPoDocument(supabase, poId);
  return { bytes: await m.renderPoPdf(doc), fileName: m.poPdfName(doc) };
}

export async function downloadPoPdf(poId: string): Promise<void> {
  const { bytes, fileName } = await buildPoPdf(poId);
  const m = await loadPdfModule();
  await m.savePdf(bytes, fileName);
}

/** Makes the PDF, stores it (replacing any earlier copy) and queues the email to the supplier. */
export async function emailPoToSupplier(po: Pick<PurchaseOrder, 'id' | 'workshop_id'>): Promise<PurchaseOrder> {
  const { bytes } = await buildPoPdf(po.id);
  const path = poPdfPath(po);
  const body = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, body, { upsert: true, contentType: 'application/pdf' });
  if (error) throw setupError(error);
  return rpcOrder('attach_po_pdf_and_send', { p_po: po.id, p_path: path });
}
