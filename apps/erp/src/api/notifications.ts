import { supabase } from '@/lib/supabase';

/** A staff notification (public.notifications, migration 010) with this user's read state. */
export interface StaffNotification {
  id: string;
  kind: 'booking_created' | 'booking_cancelled';
  appointment_id: string | null;
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
    .select('id, kind, appointment_id, title, body, created_at')
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
