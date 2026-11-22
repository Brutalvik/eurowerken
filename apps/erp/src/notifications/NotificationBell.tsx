import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { NotificationIcon } from './NotificationIcon';
import { useNotifications } from './NotificationsContext';

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Header bell: unread count, and a glass panel with the latest booking and repair notifications. */
export function NotificationBell() {
  const { notifications, unread, loading, markRead, openNotification } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-fg2 hover:bg-surface2 hover:text-fg coarse:p-2.5"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-bad px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="glass-strong absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl"
        >
          <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
            <p className="text-sm font-semibold text-fg">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => void markRead()} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {loading && notifications.length === 0 && <li className="px-4 py-6 text-center text-xs text-fg2">Loading...</li>}
            {!loading && notifications.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-fg2">No notifications yet. New bookings, customer messages and approvals appear here.</li>
            )}
            {notifications.map((n) => {
              return (
                <li key={n.id} className="border-b border-line/40 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openNotification(n);
                    }}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface2/60 ${n.read ? '' : 'bg-accent/[0.06]'}`}
                  >
                    <NotificationIcon n={n} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs ${n.read ? 'text-fg2' : 'font-semibold text-fg'}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block truncate text-[11px] text-fg2">{n.body}</span>}
                      <span className="mt-1 block text-[10px] text-fg3">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
