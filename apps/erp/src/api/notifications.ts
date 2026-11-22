import { supabase } from '@/lib/supabase';

/** A staff notification (public.notifications, migration 010) with this user's read state. */
export interface StaffNotification {
  id: string;
  kind: 'booking_created' | 'booking_cancelled' | 'repair_message' | 'repair_approval';
  appointment_id: string | null;
  /** Set for repair_message and repair_approval (migration 013). */
  repair_order_id: string | null;
  title: string;
  body: string | null;
  created_at: string;
  read: boolean;
}

type Row = Omit<StaffNotification, 'read'>;

/** The latest notifications for the signed-in user's workshop (RLS scopes them), newest first. */
export async function listNotifications(userId: string, limit = 30): Promise<StaffNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, appointment_id, repair_order_id, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];
  const { data: reads, error: readsError } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_id', userId)
    .in('notification_id', rows.map((r) => r.id));
  if (readsError) throw new Error(readsError.message);
  const read = new Set((reads ?? []).map((r) => (r as { notification_id: string }).notification_id));
  return rows.map((r) => ({ ...r, read: read.has(r.id) }));
}

/** Where a notification leads: its repair order page, or its booking. */
export function notificationPath(n: Pick<StaffNotification, 'kind' | 'appointment_id' | 'repair_order_id'>): string {
  if ((n.kind === 'repair_message' || n.kind === 'repair_approval') && n.repair_order_id) return `/repair-orders/${n.repair_order_id}`;
  if (n.kind === 'repair_message' || n.kind === 'repair_approval') return '/repair-orders';
  return n.appointment_id ? `/appointments?open=${n.appointment_id}` : '/appointments';
}

/** The call to action for a notification's pop-up. */
export function notificationAction(n: Pick<StaffNotification, 'kind'>): string {
  if (n.kind === 'repair_message') return 'Open messages';
  if (n.kind === 'repair_approval') return 'Open repair order';
  return 'Open booking';
}

/** A customer's decline (the database words the title "<name> declined <n> items"). */
export function isDecline(n: Pick<StaffNotification, 'kind' | 'title'>): boolean {
  return n.kind === 'repair_approval' && /\bdeclined\b/i.test(n.title);
}

/** Marks some (or, with no ids, all) of the workshop's notifications read for the signed-in user. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids && ids.length ? ids : null });
  if (error) throw new Error(error.message);
}

/** Bookings no one on the team has opened yet (not cancelled). */
export async function countUnopenedAppointments(workshopId: string): Promise<number> {
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('workshop_id', workshopId)
    .is('staff_opened_at', null)
    .neq('status', 'cancelled');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Records that a staff member opened a booking (the first opener wins). */
export async function markAppointmentOpened(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_appointment_opened', { p_id: id });
  if (error) throw new Error(error.message);
}
