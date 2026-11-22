import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { NotificationIcon } from './NotificationIcon';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  countUnopenedAppointments,
  listNotifications,
  markAppointmentOpened,
  markNotificationsRead,
  notificationAction,
  notificationPath,
} from '@/api/notifications';
import type { StaffNotification } from '@/api/notifications';
import { supabase } from '@/lib/supabase';

interface NotificationsValue {
  notifications: StaffNotification[];
  unread: number;
  /** Bookings nobody has opened yet (badge next to Appointments). */
  unopened: number;
  /** Increments whenever any booking in the workshop changes, so pages can reload. */
  appointmentsVersion: number;
  loading: boolean;
  markRead: (ids?: string[]) => Promise<void>;
  /** Marks the notification read and goes to its booking. */
  openNotification: (n: StaffNotification) => void;
  /** Call when a staff member opens a booking. */
  appointmentOpened: (id: string) => void;
}

const Ctx = createContext<NotificationsValue | null>(null);

interface Toast {
  id: string;
  notification: StaffNotification;
}

/**
 * Staff notifications for bookings, in real time: Supabase Realtime pushes new notifications and booking
 * changes for this workshop (RLS decides who hears what). Shows a short pop-up for each new one.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const workshopId = user?.workshop?.id ?? null;
  const userId = user?.id ?? null;
  const enabled = Boolean(workshopId && userId && can('repair-orders', 'view'));

  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [unopened, setUnopened] = useState(0);
  const [appointmentsVersion, setAppointmentsVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!enabled || !workshopId || !userId) return;
    try {
      const [list, count] = await Promise.all([listNotifications(userId), countUnopenedAppointments(workshopId)]);
      list.forEach((n) => seen.current.add(n.id));
      setNotifications(list);
      setUnopened(count);
    } catch (err) {
      console.warn('Notifications could not be loaded:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled, workshopId, userId]);

  useEffect(() => {
    if (!enabled) {
      setNotifications([]);
      setUnopened(0);
      return;
    }
    setLoading(true);
    void refresh();
  }, [enabled, refresh]);

  // Live updates for this workshop.
  useEffect(() => {
    if (!enabled || !workshopId) return;
    const channel = supabase
      .channel(`staff-notifications:${workshopId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `workshop_id=eq.${workshopId}` },
        (payload) => {
          const row = payload.new as Omit<StaffNotification, 'read'>;
          const n = { ...row, repair_order_id: row.repair_order_id ?? null, read: false };
          if (seen.current.has(n.id)) return;
          seen.current.add(n.id);
          setNotifications((list) => [n, ...list].slice(0, 30));
          setToasts((t) => [...t, { id: n.id, notification: n }].slice(-3));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `workshop_id=eq.${workshopId}` },
        () => {
          setAppointmentsVersion((v) => v + 1);
          void countUnopenedAppointments(workshopId).then(setUnopened).catch(() => undefined);
        },
      )
      .subscribe();
    // Catch up after a dropped connection or a sleeping laptop.
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, workshopId, refresh]);

  const markRead = useCallback(async (ids?: string[]) => {
    setNotifications((list) => list.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await markNotificationsRead(ids);
    } catch (err) {
      console.warn('Could not mark notifications read:', err);
    }
  }, []);

  const openNotification = useCallback(
    (n: StaffNotification) => {
      void markRead([n.id]);
      setToasts((t) => t.filter((x) => x.id !== n.id));
      navigate(notificationPath(n));
    },
    [markRead, navigate],
  );

  const appointmentOpened = useCallback(
    (id: string) => {
      void markAppointmentOpened(id)
        .then(async () => {
          if (workshopId) setUnopened(await countUnopenedAppointments(workshopId));
        })
        .catch(() => undefined);
    },
    [workshopId],
  );

  const unread = notifications.filter((n) => !n.read).length;
  const value = useMemo<NotificationsValue>(
    () => ({ notifications, unread, unopened, appointmentsVersion, loading, markRead, openNotification, appointmentOpened }),
    [notifications, unread, unopened, appointmentsVersion, loading, markRead, openNotification, appointmentOpened],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toasts toasts={toasts} onOpen={openNotification} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </Ctx.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

/** Small glass pop-ups in the bottom-right corner; each closes itself after 8 seconds. */
function Toasts({
  toasts,
  onOpen,
  onDismiss,
}: {
  toasts: Toast[];
  onOpen: (n: StaffNotification) => void;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => window.setTimeout(() => onDismiss(t.id), 8000));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [toasts, onDismiss]);

  return (
    <div className="pb-safe pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map(({ id, notification: n }) => {
        return (
          <div key={id} className="glass-strong pointer-events-auto flex items-start gap-3 rounded-xl p-3 shadow-lg" role="status">
            <NotificationIcon n={n} />
            <button type="button" onClick={() => onOpen(n)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-semibold text-fg">{n.title}</span>
              {n.body && <span className="mt-0.5 block truncate text-[11px] text-fg2">{n.body}</span>}
              <span className="mt-1 block text-[11px] font-medium text-accent">{notificationAction(n)}</span>
            </button>
            <button type="button" onClick={() => onDismiss(id)} aria-label="Dismiss" className="rounded-md p-1 text-fg3 hover:text-fg coarse:p-2">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
