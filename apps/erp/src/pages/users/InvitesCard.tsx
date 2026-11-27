import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Link2, Send } from 'lucide-react';
import { ROLES } from '@/auth/rbac';
import type { Role } from '@/auth/rbac';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { inviteUrl } from '@/lib/invites';
import { ROLE_TONE } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { InviteRow } from '@/lib/supabase';

const dateFormat = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });

/**
 * Invite one person by email with a preset role. The link works once, for
 * that email, for 7 days. Supabase does not send it; the manager shares it.
 */
export function InvitesCard({ isManager, onChanged }: { isManager: boolean; onChanged?: () => void }) {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Service Advisor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<InviteRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('workshop_invites')
      .select('id, email, role, token, created_at, expires_at, accepted_at')
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setInvites((data ?? []) as InviteRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    const { data, error: err } = await supabase.rpc('create_invite', { p_email: email.trim(), p_role: role });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setCreated(data as InviteRow);
    setEmail('');
    await load();
    onChanged?.();
  }

  async function onRevoke(id: string) {
    const { error: err } = await supabase.from('workshop_invites').delete().eq('id', id);
    if (err) setError(err.message);
    if (created?.id === id) setCreated(null);
    await load();
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  }

  const now = Date.now();

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Invite someone"
        subtitle="They join with the role you pick, no approval needed. The link works once, for that email, for 7 days."
      />
      <form onSubmit={onCreate} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          placeholder="name@example.com"
          aria-label="Email to invite"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl glass-field px-3 py-2 text-xs text-fg outline-none placeholder:text-fg3 focus:border-accent coarse:min-h-11"
        />
        <select
          aria-label="Role for the invite"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-xl glass-field px-2 py-2 text-xs text-fg outline-none focus:border-accent coarse:min-h-11"
        >
          {ROLES.filter((r) => isManager || r !== 'Manager').map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Creating...' : 'Create invite link'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
          {error}
        </p>
      )}

      {created && (
        <div className="mt-3 rounded-lg border border-ok/30 bg-ok/10 p-3">
          <p className="text-xs text-ok">
            Invite created for {created.email}. Send them this link (it is not emailed automatically):
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl(created.token)}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl glass-field px-2 py-1.5 font-mono text-[11px] text-fg"
            />
            <Button size="sm" variant="ghost" onClick={() => void copy(created.token)}>
              {copied === created.token ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === created.token ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {invites.map((inv) => {
            const expired = new Date(inv.expires_at).getTime() < now;
            return (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2.5 text-xs">
                <Link2 className="h-3.5 w-3.5 text-fg3" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{inv.email}</span>
                <Badge tone={ROLE_TONE[inv.role]}>{inv.role}</Badge>
                <span className={expired ? 'text-bad' : 'text-fg3'}>
                  {expired ? 'Expired' : `Expires ${dateFormat.format(new Date(inv.expires_at))}`}
                </span>
                {!expired && (
                  <Button size="sm" variant="ghost" onClick={() => void copy(inv.token)}>
                    {copied === inv.token ? 'Copied' : 'Copy link'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void onRevoke(inv.id)}>
                  {expired ? 'Remove' : 'Revoke'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
