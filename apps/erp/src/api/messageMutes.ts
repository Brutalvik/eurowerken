/**
 * Muting staff notifications for customer messages (migration 021). The shop can mute every customer
 * (Settings, full) or one customer by email (Repair Orders or Customers, full). Muting only stops the bell:
 * the messages still arrive in the repair order, and approvals and bookings always notify.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';

export interface MuteState {
  all: boolean;
  emails: Set<string>;
}

export function muteKey(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(e) ? e : null;
}

function setupError(message: string): Error {
  if (/workshop_notification_settings|muted_customers|set_customer_mute|set_customer_messages_muted|schema cache/i.test(message)) {
    return new Error('The database is not set up for muting yet. Apply migration 021 (npm run db:migrate).');
  }
  return new Error(message);
}

export async function loadMuteState(workshopId: string): Promise<MuteState> {
  const [settings, muted] = await Promise.all([
    supabase.from('workshop_notification_settings').select('mute_customer_messages').eq('workshop_id', workshopId).maybeSingle(),
    supabase.from('muted_customers').select('email').eq('workshop_id', workshopId),
  ]);
  if (settings.error) throw setupError(settings.error.message);
  if (muted.error) throw setupError(muted.error.message);
  return {
    all: Boolean((settings.data as { mute_customer_messages?: boolean } | null)?.mute_customer_messages),
    emails: new Set(((muted.data ?? []) as { email: string }[]).map((r) => r.email)),
  };
}

export async function setCustomerMuted(email: string, muted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_customer_muted', { p_email: email, p_muted: muted });
  if (error) throw setupError(error.message);
}

export async function setAllCustomerMessagesMuted(muted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_customer_messages_muted', { p_muted: muted });
  if (error) throw setupError(error.message);
}

export interface MuteHook {
  state: MuteState | null;
  error: string | null;
  isMuted: (email: string | null | undefined) => boolean;
  toggleCustomer: (email: string, muted: boolean) => Promise<string | null>;
  toggleAll: (muted: boolean) => Promise<string | null>;
}

/** The workshop's mute settings, kept current while the page is open. */
export function useMessageMutes(): MuteHook {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [state, setState] = useState<MuteState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    try {
      setState(await loadMuteState(workshopId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mute settings could not be loaded.');
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
    if (!workshopId) return;
    const channel = supabase
      .channel(`mutes-${workshopId}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'muted_customers', filter: `workshop_id=eq.${workshopId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_notification_settings', filter: `workshop_id=eq.${workshopId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workshopId, load]);

  const toggleCustomer = useCallback(async (email: string, muted: boolean) => {
    const key = muteKey(email);
    if (!key) return 'This customer has no email to mute by.';
    try {
      await setCustomerMuted(key, muted);
      setState((s) => {
        if (!s) return s;
        const emails = new Set(s.emails);
        if (muted) emails.add(key);
        else emails.delete(key);
        return { ...s, emails };
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'The change could not be saved.';
    }
  }, []);

  const toggleAll = useCallback(async (muted: boolean) => {
    try {
      await setAllCustomerMessagesMuted(muted);
      setState((s) => (s ? { ...s, all: muted } : s));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'The change could not be saved.';
    }
  }, []);

  const isMuted = useCallback(
    (email: string | null | undefined) => {
      const key = muteKey(email);
      return Boolean(state && key && state.emails.has(key));
    },
    [state],
  );

  return { state, error, isMuted, toggleCustomer, toggleAll };
}
