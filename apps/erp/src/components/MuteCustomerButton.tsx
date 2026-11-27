import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { muteKey } from '@/api/messageMutes';
import type { MuteHook } from '@/api/messageMutes';
import { useAuth } from '@/auth/AuthContext';

/**
 * Bell / muted-bell button for one customer's message notifications. Shows the shop-wide mute instead when that
 * is on. Read-only for staff who may not change it.
 */
export function MuteCustomerButton({ email, name, mutes }: { email: string | null | undefined; name: string; mutes: MuteHook }) {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = muteKey(email);
  const canChange = can('repair-orders', 'full') || can('customers', 'full');

  if (!key || !mutes.state) return null;

  if (mutes.state.all) {
    return (
      <Link
        to="/settings?tab=notifications"
        className="inline-flex items-center gap-1.5 rounded-xl glass-field px-2.5 py-1.5 text-[11px] font-medium text-fg2 hover:text-fg coarse:min-h-11"
        title="Customer message notifications are muted for every customer in Settings"
      >
        <BellOff className="h-3.5 w-3.5" aria-hidden />
        All customers muted
      </Link>
    );
  }

  const muted = mutes.isMuted(key);
  const label = muted ? `Notifications from ${name} are muted. Turn them back on` : `Mute message notifications from ${name}`;

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={!canChange || busy}
        aria-pressed={muted}
        aria-label={label}
        title={canChange ? label : 'Only staff with full access to Repair Orders or Customers can change this'}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setError(await mutes.toggleCustomer(key, !muted));
          setBusy(false);
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-default disabled:opacity-70 coarse:min-h-11 ${
          muted ? 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/20' : 'border-line bg-surface2 text-fg2 hover:text-fg'
        }`}
      >
        {muted ? <BellOff className="h-3.5 w-3.5" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}
        {busy ? 'Saving...' : muted ? 'Muted' : 'Notify me'}
      </button>
      {error && (
        <span role="alert" className="mt-1 max-w-[16rem] text-right text-[11px] text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
