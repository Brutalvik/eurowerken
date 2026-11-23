import { supabase } from '@/lib/supabase';
import type { AppointmentVehicle } from './appointments';
import { lineTotal } from './repairOrders';
import type { Approval, ItemKind, RepairStatus } from './repairOrders';

/** Repair orders with their items, for the Dashboard and Reports (real data only; no invoices yet). */

export type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** The last six calendar months, oldest first. */
export function lastSixMonths(now = new Date()): Date[] {
  return Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
}

export interface DashItem {
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  approval: Approval;
}

export interface DashOrder {
  id: string;
  number: string;
  status: RepairStatus;
  contact_name: string;
  vehicle: AppointmentVehicle;
  technician_id: string | null;
  technician_name: string | null;
  created_at: string;
  completed_at: string | null;
  items: DashItem[];
  approved: number;
}

export async function loadWorkOrders(workshopId: string): Promise<DashOrder[]> {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('id, number, status, contact_name, vehicle, created_at, completed_at, technician_id, technician:team_members(name), items:repair_order_items(kind, description, quantity, unit_price, approval)')
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const items = (Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : []).map((i) => ({
      kind: i.kind as ItemKind,
      description: String(i.description ?? ''),
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      approval: i.approval as Approval,
    }));
    const tech = r.technician as { name?: string } | null;
    return {
      id: String(r.id),
      number: String(r.number),
      status: r.status as RepairStatus,
      contact_name: String(r.contact_name ?? ''),
      vehicle: (r.vehicle ?? {}) as AppointmentVehicle,
      technician_id: (r.technician_id as string | null) ?? null,
      technician_name: tech?.name ?? null,
      created_at: String(r.created_at),
      completed_at: (r.completed_at as string | null) ?? null,
      items,
      approved: items.filter((i) => i.approval === 'approved').reduce((s, i) => s + lineTotal(i), 0),
    };
  });
}

