import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { ACCESS, MODULE_LABELS, MODULE_ORDER, ROLES } from '@/auth/rbac';
import type { Access, Role } from '@/auth/rbac';
import { Badge } from '@/components/ui/Badge';
import type { Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { ROLE_TONE } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/supabase';

const ACCESS_TONE: Record<Access, Tone> = { none: 'neutral', view: 'info', full: 'ok' };
const ACCESS_LABEL: Record<Access, string> = { none: 'None', view: 'View', full: 'Full' };

const dateFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short' });

function initialsOf(p: ProfileRow): string {
  const source = p.full_name?.trim() || p.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]!.toUpperCase())
    .join('');
}

export function UsersPage() {
  const { can, user, reloadProfile } = useAuth();
  const canManage = can('users', 'full');
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('profiles').select('*').order('created_at');
    if (err) setError(err.message);
    else {
      setProfiles((data ?? []) as ProfileRow[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(id: string, patch: Partial<Pick<ProfileRow, 'role' | 'active'>>) {
    setSavingId(id);
    // Row level security only lets a manager change role or active; the database rejects anyone else.
    const { error: err } = await supabase.from('profiles').update(patch).eq('id', id);
    setSavingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
    if (id === user?.id) await reloadProfile();
  }

  const columns: Column<ProfileRow>[] = [
    {
      header: 'Member',
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
            {initialsOf(m)}
          </span>
          <span className="font-medium text-fg">{m.full_name || m.email.split('@')[0]}</span>
        </div>
      ),
    },
    { header: 'Email', cell: (m) => m.email },
    {
      header: 'Role',
      cell: (m) =>
        canManage && m.id !== user?.id ? (
          <select
            aria-label={`Role for ${m.email}`}
            value={m.role ?? ''}
            disabled={savingId === m.id}
            onChange={(e) => void update(m.id, { role: (e.target.value || null) as Role | null })}
            className="rounded-md border border-line bg-surface2 px-2 py-1 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="">No role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : m.role ? (
          <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
        ) : (
          <Badge>No role</Badge>
        ),
    },
    { header: 'Department', cell: (m) => m.department ?? '-' },
    { header: 'Since', cell: (m) => dateFormat.format(new Date(m.created_at)), className: 'text-fg3' },
    {
      header: 'Status',
      cell: (m) => (
        <div className="flex items-center gap-2">
          <Badge tone={m.active ? 'ok' : 'neutral'}>{m.active ? 'Active' : 'Deactivated'}</Badge>
          {canManage && m.id !== user?.id && (
            <Button
              variant="ghost"
              size="sm"
              disabled={savingId === m.id}
              onClick={() => void update(m.id, { active: !m.active })}
            >
              {m.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="p-5 pb-3">
          <CardHeader
            title="Team"
            subtitle={loading ? 'Loading...' : `${profiles.length} members, ${ROLES.length} roles`}
            action={
              canManage && (
                <Button size="sm" title="Invite new staff from the Supabase dashboard: Authentication, Users, Invite user">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Invite member
                </Button>
              )
            }
          />
          {error && (
            <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
              {error}
            </p>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={profiles}
          getKey={(m) => m.id}
          emptyMessage={loading ? 'Loading team...' : 'No team members yet.'}
        />
      </Card>

      <Card className="p-5">
        <CardHeader title="Role permissions" subtitle="Access level each role has per module" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-fg3">
                  Module
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-fg3"
                  >
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULE_ORDER.map((module) => (
                <tr key={module} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3 py-2.5 text-left font-medium text-fg">
                    {MODULE_LABELS[module]}
                  </th>
                  {ROLES.map((role) => {
                    const access = ACCESS[role][module];
                    return (
                      <td key={role} className="px-3 py-2.5">
                        <Badge tone={ACCESS_TONE[access]}>{ACCESS_LABEL[access]}</Badge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
