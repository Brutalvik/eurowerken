/**
 * Service history (supabase/migrations/022): every repair of one vehicle, found by VIN, plate, phone, name or
 * email. Repairs are grouped by a vehicle key the database works out (VIN, else plate, else the repair itself).
 * Both calls need repair-orders view; these functions only shape the data and turn errors into sentences.
 * Totals, labels and media links come from ./repairOrders and dates from ./appointments.
 */
import { supabase } from '@/lib/supabase';
import { vehicleLabel } from './appointments';
import type { AppointmentVehicle } from './appointments';
import { plateOf } from './repairOrders';
import type { Approval, ItemKind, RepairStatus } from './repairOrders';

// Types ------------------------------------------------------------------------------------------

/** One vehicle in the search results, with its latest owner contact. */
export interface HistoryVehicle {
  vehicle_key: string;
  vehicle: AppointmentVehicle;
  owner_name: string;
  owner_email: string | null;
  owner_phone: string | null;
  visits: number;
  first_visit: string;
  last_visit: string;
  open_repairs: number;
}

export interface HistoryWorkshop {
  name: string;
  number: string | number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface HistoryItem {
  id: string;
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  approval: Approval;
}

export interface HistoryEvent {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  visible_to_customer: boolean;
}

export interface HistoryMedia {
  id: string;
  kind: 'photo' | 'video';
  path: string;
  caption: string | null;
  created_at: string;
  visible_to_customer: boolean;
}

export interface HistoryMessage {
  id: string;
  sender: 'staff' | 'customer';
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface HistoryApproval {
  item_description: string;
  decision: 'approved' | 'declined';
  method: 'online' | 'phone';
  decided_at: string;
  customer_email: string | null;
  /** Staff note on a phone decision: team only, never in the PDF. */
  note: string | null;
}

export interface HistoryRepair {
  id: string;
  number: string;
  tracking_code: string;
  status: RepairStatus;
  vehicle: AppointmentVehicle;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  completed_at: string | null;
  labour_rate: number;
  customer_notes: string | null;
  /** Team only, never in the PDF. */
  staff_notes: string | null;
  technician: string | null;
  items: HistoryItem[];
  events: HistoryEvent[];
  media: HistoryMedia[];
  messages: HistoryMessage[];
  approvals: HistoryApproval[];
}

export interface ServiceHistory {
  vehicle_key: string;
  workshop: HistoryWorkshop;
  /** Newest first. */
  repairs: HistoryRepair[];
}

/** What a line item means in the history: approved work was done, declined was not. */
export const HISTORY_ITEM_LABEL: Record<Approval, string> = {
  approved: 'Done',
  declined: 'Not done',
  pending: 'Waiting',
};

/** Searches shorter than this return nothing (the database says the same). */
export const MIN_QUERY = 2;

// Errors and rows ---------------------------------------------------------------------------------

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

const SETUP = 'The database is not set up for service history yet. Apply migration 022 (npm run db:migrate).';

function setupError(err: DbError): Error {
  const text = `${err.message} ${err.details ?? ''}`;
  if (err.code === 'PGRST202' || /service_history|schema cache|could not find the function|function .*(does not exist|not found)/i.test(text)) {
    return new Error(SETUP);
  }
  return new Error(err.message || 'Service history could not be loaded.');
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const vehicleOf = (v: unknown): AppointmentVehicle => (v && typeof v === 'object' ? (v as AppointmentVehicle) : {});

function normalizeVehicle(row: Record<string, unknown>): HistoryVehicle {
  return {
    vehicle_key: str(row.vehicle_key),
    vehicle: vehicleOf(row.vehicle),
    owner_name: str(row.owner_name),
    owner_email: strOrNull(row.owner_email),
    owner_phone: strOrNull(row.owner_phone),
    visits: num(row.visits),
    first_visit: str(row.first_visit),
    last_visit: str(row.last_visit),
    open_repairs: num(row.open_repairs),
  };
}

function normalizeRepair(r: Record<string, unknown>): HistoryRepair {
  return {
    id: str(r.id),
    number: str(r.number),
    tracking_code: str(r.tracking_code),
    status: r.status as RepairStatus,
    vehicle: vehicleOf(r.vehicle),
    contact_name: str(r.contact_name),
    contact_email: strOrNull(r.contact_email),
    contact_phone: strOrNull(r.contact_phone),
    created_at: str(r.created_at),
    completed_at: strOrNull(r.completed_at),
    labour_rate: num(r.labour_rate),
    customer_notes: strOrNull(r.customer_notes),
    staff_notes: strOrNull(r.staff_notes),
    technician: strOrNull(r.technician),
    items: arr(r.items).map((i) => ({
      id: str(i.id),
      kind: i.kind as ItemKind,
      description: str(i.description),
      quantity: num(i.quantity),
      unit_price: num(i.unit_price),
      approval: (i.approval as Approval) ?? 'pending',
    })),
    events: arr(r.events).map((e) => ({
      id: str(e.id),
      kind: str(e.kind),
      title: str(e.title),
      body: strOrNull(e.body),
      created_at: str(e.created_at),
      visible_to_customer: Boolean(e.visible_to_customer),
    })),
    media: arr(r.media).map((m) => ({
      id: str(m.id),
      kind: m.kind === 'video' ? 'video' : 'photo',
      path: str(m.path),
      caption: strOrNull(m.caption),
      created_at: str(m.created_at),
      visible_to_customer: Boolean(m.visible_to_customer),
    })),
    messages: arr(r.messages).map((m) => ({
      id: str(m.id),
      sender: m.sender === 'staff' ? 'staff' : 'customer',
      author_name: strOrNull(m.author_name),
      body: str(m.body),
      created_at: str(m.created_at),
    })),
    approvals: arr(r.approvals).map((a) => ({
      item_description: str(a.item_description),
      decision: a.decision === 'declined' ? 'declined' : 'approved',
      method: a.method === 'phone' ? 'phone' : 'online',
      decided_at: str(a.decided_at),
      customer_email: strOrNull(a.customer_email),
      note: strOrNull(a.note),
    })),
  };
}

// Reading ---------------------------------------------------------------------------------------------

/** Vehicles whose repairs match a VIN, plate, phone, name or email; newest visit first, at most 50. */
export async function searchServiceHistory(query: string): Promise<HistoryVehicle[]> {
  if (query.trim().length < MIN_QUERY) return [];
  const { data, error } = await supabase.rpc('service_history_search', { p_query: query.trim() });
  if (error) throw setupError(error);
  return arr(data).map(normalizeVehicle);
}

/** Every repair of one vehicle, newest first, with everything the team can see (team-only parts marked). */
export async function getServiceHistory(key: string): Promise<ServiceHistory> {
  const { data, error } = await supabase.rpc('service_history', { p_key: key });
  if (error) throw setupError(error);
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const w = (row.workshop && typeof row.workshop === 'object' ? row.workshop : {}) as Record<string, unknown>;
  return {
    vehicle_key: str(row.vehicle_key) || key,
    workshop: {
      name: str(w.name),
      number: (w.number as string | number | null) ?? null,
      phone: strOrNull(w.phone),
      email: strOrNull(w.email),
      address: strOrNull(w.address),
    },
    repairs: arr(row.repairs).map(normalizeRepair),
  };
}

// Labels ----------------------------------------------------------------------------------------------

export function vinOf(v: AppointmentVehicle): string {
  return (v.vin ?? '').toString().trim().toUpperCase();
}

/** 2019 Volkswagen Golf, or "Vehicle" when nothing is known. */
export function historyVehicleLabel(v: AppointmentVehicle): string {
  return vehicleLabel(v) || 'Vehicle';
}

/** The vehicle and owner as the latest repair has them; VIN and plate from the newest repair that has one. */
export function historySummary(h: ServiceHistory) {
  const latest = h.repairs[0];
  const vin = h.repairs.map((r) => vinOf(r.vehicle)).find(Boolean) ?? '';
  const plate = h.repairs.map((r) => plateOf(r.vehicle).toUpperCase()).find(Boolean) ?? '';
  const withYear = h.repairs.find((r) => vehicleLabel(r.vehicle));
  return {
    label: withYear ? vehicleLabel(withYear.vehicle) : 'Vehicle',
    vin,
    plate,
    owner: latest?.contact_name ?? '',
    email: h.repairs.map((r) => r.contact_email).find(Boolean) ?? null,
    phone: h.repairs.map((r) => r.contact_phone).find(Boolean) ?? null,
    visits: h.repairs.length,
    latestNumber: latest?.number ?? '',
  };
}

export type HistorySummary = ReturnType<typeof historySummary>;
