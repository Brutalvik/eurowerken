import { appUrl } from '@/lib/appUrl';
import { supabase } from './supabase';
import type { Role } from '@/auth/rbac';

export interface InvitePreview {
  workshopName: string;
  email: string;
  role: Role;
  status: 'valid' | 'used' | 'expired';
}

/** Public lookup of an invite by its token (works signed out). Null when the token matches nothing. */
export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('invite_preview', { p_token: token });
  const row = (data as { workshop_name: string; email: string; role: Role; status: InvitePreview['status'] }[] | null)?.[0];
  if (error || !row) return null;
  return { workshopName: row.workshop_name, email: row.email, role: row.role, status: row.status };
}

export function inviteUrl(token: string): string {
  return appUrl(`/invite/${token}`);
}
