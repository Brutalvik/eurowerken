import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useSite } from '@/site/SiteContext';
import { useCustomerAuth } from './CustomerAuthContext';

/**
 * Unread alerts for the signed-in customer at this workshop (customer_notifications, 019): the workshop is waiting
 * for their approval, or sent a message. Written by the database; read here, live (Realtime) with polling as backup.
 * Opening a repair marks its alerts read.
 */
export interface CustomerAlert {
  id: string;
  kind: 'approval' | 'message';
  title: string;
  body: string;
  created_at: string;
  repair_order_id: string;
  repair: { number: string; tracking_code: string } | null;
}

interface AlertsValue {
  alerts: CustomerAlert[];
  unread: number;
  /** Unread alerts of one repair. */
  forRepair: (repairOrderId: string) => CustomerAlert[];
  markRepairRead: (repairOrderId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY: AlertsValue = {
  alerts: [],
  unread: 0,
  forRepair: () => [],
  markRepairRead: async () => {},
  refresh: async () => {},
};

const AlertsContext = createContext<AlertsValue>(EMPTY);
const POLL_MS = 60_000;

export function CustomerAlertsProvider({ children }: { children: ReactNode }) {
  const site = useSite();
  const { status, account } = useCustomerAuth();
  const customerId = status === 'signed-in' || status === 'recovery' ? (account?.id ?? null) : null;
  const [alerts, setAlerts] = useState<CustomerAlert[]>([]);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!customerId) return;
    const mine = ++seq.current;
    const { data, error } = await supabase
      .from('customer_notifications')
      .select('id, kind, title, body, created_at, repair_order_id, repair:repair_orders(number, tracking_code)')
      .eq('customer_id', customerId)
      .eq('workshop_id', site.workshop_id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (mine !== seq.current || error) return;
    setAlerts(
      ((data ?? []) as unknown as (Omit<CustomerAlert, 'repair'> & { repair: CustomerAlert['repair'] | CustomerAlert['repair'][] })[]).map((a) => ({
        ...a,
        repair: Array.isArray(a.repair) ? (a.repair[0] ?? null) : a.repair,
      })),
    );
  }, [customerId, site.workshop_id]);

  useEffect(() => {
    setAlerts([]);
    if (!customerId) return;
    void refresh();
    let debounce: number | undefined;
    const onChange = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refresh(), 300);
    };
    const channel = supabase
      .channel(`customer-alerts-${customerId}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_notifications', filter: `customer_id=eq.${customerId}` }, onChange)
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [customerId, refresh]);

  const markRepairRead = useCallback(
    async (repairOrderId: string) => {
      if (!customerId) return;
      setAlerts((list) => (list.some((a) => a.repair_order_id === repairOrderId) ? list.filter((a) => a.repair_order_id !== repairOrderId) : list));
      const { error } = await supabase.rpc('mark_customer_notifications_read', { p_repair_order: repairOrderId, p_workshop: null });
      if (error) void refresh();
    },
    [customerId, refresh],
  );

  const value = useMemo<AlertsValue>(
    () => ({
      alerts,
      unread: alerts.length,
      forRepair: (id) => alerts.filter((a) => a.repair_order_id === id),
      markRepairRead,
      refresh,
    }),
    [alerts, markRepairRead, refresh],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useCustomerAlerts(): AlertsValue {
  return useContext(AlertsContext);
}

/** "3 hours ago" style, short. */
export function alertAge(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
