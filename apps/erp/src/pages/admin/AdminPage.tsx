import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { PillTabs } from '@/components/ui/PillTabs';
import { SearchInput } from '@/components/ui/SearchInput';
import { Dialog, ErrorNote, Labeled, inputClass } from '@/pages/inventory/PartForm';
import { NotFoundPage } from '@/pages/NotFoundPage';

const CUSTOMER_SITE_URL = (
  (import.meta.env.VITE_CUSTOMER_SITE_URL as string | undefined) ?? 'http://localhost:5175'
).replace(/\/+$/, '');

const TABS = ['Workshops', 'Platform settings', 'Audit log'] as const;
type Tab = (typeof TABS)[number];

/** One row of public.admin_list_workshops(). */
interface AdminWorkshop {
  id: string;
  name: string;
  number: string;
  status: string;
  created_at: string;
  suspended_reason: string | null;
  owner_email: string | null;
  staff_count: number;
  customer_count: number;
  appointment_count: number;
  open_repairs: number;
  site_slug: string | null;
  site_published: boolean | null;
}

interface AuditRow {
  id: string;
  action: string;
  workshop_id: string | null;
  admin_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

/** Platform super admin console: every workshop, platform settings and the audit log. */
export function AdminPage() {
  const { isPlatformAdmin } = useAuth();
  if (!isPlatformAdmin) return <NotFoundPage />;
  return <AdminConsole />;
}

function AdminConsole() {
  const [tab, setTab] = useState<Tab>('Workshops');
  const [workshops, setWorkshops] = useState<AdminWorkshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('admin_list_workshops');
    if (err) setError(err.message);
    else {
      setError(null);
      setWorkshops(
        ((data ?? []) as AdminWorkshop[]).map((w) => ({
          ...w,
          staff_count: Number(w.staff_count),
          customer_count: Number(w.customer_count),
          appointment_count: Number(w.appointment_count),
          open_repairs: Number(w.open_repairs),
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-fg">Platform admin</h2>
          <p className="text-xs text-fg2">Every workshop on EuroWerken. Everything you do here is recorded.</p>
        </div>
        <PillTabs label="Platform admin sections" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'Workshops' && <WorkshopsTab workshops={workshops} loading={loading} error={error} reload={load} />}
      {tab === 'Platform settings' && <SettingsTab />}
      {tab === 'Audit log' && <AuditTab workshops={workshops} />}
    </div>
  );
}

// Workshops -----------------------------------------------------------------------------------------

type StatusFilter = 'all' | 'active' | 'suspended';

function WorkshopsTab({
  workshops,
  loading,
  error,
  reload,
}: {
  workshops: AdminWorkshop[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const { startActing } = useAuth();
  const navigate = useNavigate();
  const filterId = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<AdminWorkshop | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workshops.filter((w) => {
      if (status !== 'all' && w.status !== status) return false;
      if (!q) return true;
      return [w.name, w.number, w.owner_email ?? '', w.site_slug ?? ''].some((v) => v.toLowerCase().includes(q));
    });
  }, [workshops, query, status]);

  async function openAsManager(w: AdminWorkshop) {
    setActionError(null);
    setBusyId(w.id);
    const err = await startActing(w.id);
    setBusyId(null);
    if (err) setActionError(err);
    else navigate('/dashboard');
  }

  async function reactivate(w: AdminWorkshop) {
    setActionError(null);
    setBusyId(w.id);
    const { error: err } = await supabase.rpc('admin_set_workshop_status', {
      p_workshop: w.id,
      p_status: 'active',
      p_reason: null,
    });
    setBusyId(null);
    if (err) setActionError(err.message);
    else await reload();
  }

  const columns: Column<AdminWorkshop>[] = [
    {
      header: 'Workshop',
      mobile: 'title',
      className: 'text-fg',
      cell: (w) => (
        <div className="min-w-0">
          <div className="break-words font-semibold text-fg">{w.name}</div>
          <div className="font-mono text-[11px] text-fg3">No. {w.number}</div>
          <div className="text-[11px] text-fg3">Created {dateFormat.format(new Date(w.created_at))}</div>
        </div>
      ),
    },
    {
      header: 'Owner',
      cell: (w) =>
        w.owner_email ? (
          <span className="block max-w-[11rem] break-all">{w.owner_email}</span>
        ) : (
          <span className="text-fg3">No manager</span>
        ),
    },
    {
      header: 'Status',
      mobile: 'corner',
      cell: (w) => (
        <div className="max-w-[10rem]">
          <Badge tone={w.status === 'suspended' ? 'bad' : 'ok'}>{w.status === 'suspended' ? 'Suspended' : 'Active'}</Badge>
          {w.status === 'suspended' && w.suspended_reason && (
            <p className="mt-1 break-words text-[11px] text-fg3">{w.suspended_reason}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Activity',
      cell: (w) => (
        <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 whitespace-nowrap text-[11px]">
          <dt className="text-fg3">Staff</dt>
          <dd className="text-right font-medium text-fg">{w.staff_count}</dd>
          <dt className="text-fg3">Customers</dt>
          <dd className="text-right font-medium text-fg">{w.customer_count}</dd>
          <dt className="text-fg3">Appointments</dt>
          <dd className="text-right font-medium text-fg">{w.appointment_count}</dd>
          <dt className="text-fg3">Open repairs</dt>
          <dd className="text-right font-medium text-fg">{w.open_repairs}</dd>
        </dl>
      ),
    },
    {
      header: 'Site',
      cell: (w) =>
        w.site_slug ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${w.site_published ? 'bg-ok' : 'bg-fg3'}`}
              title={w.site_published ? 'Published' : 'Not published'}
              aria-hidden
            />
            <span className="sr-only">{w.site_published ? 'Published:' : 'Not published:'}</span>
            <a
              href={`${CUSTOMER_SITE_URL}/${w.site_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 min-w-0 items-center gap-1 break-all text-accent hover:underline md:min-h-0"
            >
              {w.site_slug}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </span>
        ) : (
          <span className="text-fg3">No site</span>
        ),
    },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: (w) => (
        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
          <Button
            onClick={() => void openAsManager(w)}
            disabled={busyId !== null}
            className="min-h-11 lg:min-h-0"
            aria-label={`Open ${w.name} as Manager`}
          >
            {busyId === w.id ? 'Opening...' : 'Open as Manager'}
          </Button>
          {w.status === 'suspended' ? (
            <Button
              variant="ghost"
              onClick={() => void reactivate(w)}
              disabled={busyId !== null}
              className="min-h-11 lg:min-h-0"
              aria-label={`Reactivate ${w.name}`}
            >
              Reactivate
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setSuspending(w)}
              disabled={busyId !== null}
              className="min-h-11 !text-bad lg:min-h-0"
              aria-label={`Suspend ${w.name}`}
            >
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search workshops" className="w-full sm:w-64" />
        <div className="flex items-center gap-2">
          <label htmlFor={filterId} className="text-xs text-fg2">
            Status
          </label>
          <select
            id={filterId}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-lg border border-line bg-surface2 px-2.5 py-2 text-xs text-fg outline-none focus:border-accent coarse:min-h-11"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <Button variant="ghost" onClick={() => void reload()} disabled={loading} className="min-h-11 sm:ml-auto md:min-h-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </Button>
      </div>
      {(error || actionError) && (
        <div className="px-4 pt-4">
          <ErrorNote errors={[error, actionError].filter((e): e is string => Boolean(e))} />
        </div>
      )}
      {loading && workshops.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-fg2">Loading workshops...</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(w) => w.id}
          cardsBelow="lg"
          emptyMessage={workshops.length === 0 ? 'No workshops yet.' : 'No workshops match.'}
        />
      )}
      <SuspendDialog
        workshop={suspending}
        onClose={() => setSuspending(null)}
        onDone={async () => {
          setSuspending(null);
          await reload();
        }}
      />
    </Card>
  );
}

function SuspendDialog({
  workshop,
  onClose,
  onDone,
}: {
  workshop: AdminWorkshop | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const reasonId = useId();
  const formId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
    setBusy(false);
  }, [workshop?.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workshop) return;
    if (reason.trim().length < 3) {
      setError('Enter the reason for suspending this workshop.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_set_workshop_status', {
      p_workshop: workshop.id,
      p_status: 'suspended',
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (err) setError(err.message);
    else await onDone();
  }

  return (
    <Dialog
      open={workshop !== null}
      title={`Suspend ${workshop?.name ?? 'workshop'}`}
      onClose={onClose}
      role="alertdialog"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="min-h-11 md:min-h-0">
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={busy} className="min-h-11 !bg-bad md:min-h-0">
            {busy ? 'Suspending...' : 'Suspend workshop'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void onSubmit(e)} className="space-y-3 text-xs text-fg2">
        <p>
          Its customer site goes offline and its staff are locked out until you reactivate it. Reactivating puts the
          site back as it was.
        </p>
        <Labeled id={reasonId} label="Reason (required)" hint="Recorded in the audit log and shown in this console.">
          <textarea
            id={reasonId}
            data-autofocus
            required
            maxLength={300}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </Labeled>
        <ErrorNote errors={error} />
      </form>
    </Dialog>
  );
}

// Platform settings ---------------------------------------------------------------------------------

function SettingsTab() {
  const feeId = useId();
  const emailId = useId();
  const [fee, setFee] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('platform_settings')
      .select('platform_fee_percent, support_email')
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else if (data) {
          const row = data as { platform_fee_percent: number | string; support_email: string | null };
          setFee(Number(row.platform_fee_percent).toFixed(2));
          setEmail(row.support_email ?? '');
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const value = fee.trim();
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(value) || Number(value) > 30) {
      setError('The platform fee must be a number from 0 to 30, with at most two decimals.');
      return;
    }
    const mail = email.trim();
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      setError('Enter a valid support email, or leave it empty.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_update_platform_settings', {
      p_fee: Number(value),
      p_support_email: mail,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setFee(Number(value).toFixed(2));
      setSaved(true);
    }
  }

  return (
    <Card className="max-w-xl p-4 sm:p-5">
      <h3 className="font-display text-sm font-semibold text-fg">Platform settings</h3>
      <p className="mt-0.5 text-xs text-fg2">Apply to every workshop on EuroWerken.</p>
      {loading ? (
        <p className="py-6 text-xs text-fg2">Loading settings...</p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          <Labeled
            id={feeId}
            label="Platform fee (%)"
            hint="Taken from each online card payment through Stripe once online payments arrive (Phase 5). From 0 to 30, two decimals at most."
          >
            <input
              id={feeId}
              type="number"
              inputMode="decimal"
              min={0}
              max={30}
              step={0.01}
              required
              value={fee}
              onChange={(e) => {
                setFee(e.target.value);
                setSaved(false);
              }}
              className={`${inputClass} sm:max-w-[10rem]`}
            />
          </Labeled>
          <Labeled id={emailId} label="Support email" hint="Shown to workshops that need help, for example a suspended one.">
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              placeholder="support@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSaved(false);
              }}
              className={inputClass}
            />
          </Labeled>
          <ErrorNote errors={error} />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
            {saved && (
              <span role="status" className="text-xs text-ok">
                Saved.
              </span>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

// Audit log -----------------------------------------------------------------------------------------

function describeAction(row: AuditRow): string {
  const detail = row.detail ?? {};
  switch (row.action) {
    case 'session_start':
      return 'Opened the workshop as Manager';
    case 'session_end':
      return 'Ended the support session';
    case 'workshop_suspended': {
      const reason = typeof detail.reason === 'string' && detail.reason.trim() ? detail.reason.trim() : null;
      return reason ? `Suspended the workshop: ${reason}` : 'Suspended the workshop';
    }
    case 'workshop_active':
      return 'Reactivated the workshop';
    case 'platform_settings': {
      const parts: string[] = [];
      if (detail.platform_fee_percent !== undefined && detail.platform_fee_percent !== null) {
        parts.push(`fee ${Number(detail.platform_fee_percent).toFixed(2)}%`);
      }
      if (typeof detail.support_email === 'string') {
        parts.push(detail.support_email.trim() ? `support email ${detail.support_email.trim()}` : 'no support email');
      }
      return parts.length > 0 ? `Changed platform settings: ${parts.join(', ')}` : 'Changed platform settings';
    }
    default:
      return row.action.replace(/_/g, ' ');
  }
}

function AuditTab({ workshops }: { workshops: AdminWorkshop[] }) {
  const user = useCurrentUser();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [admins, setAdmins] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('admin_audit')
      .select('id, action, workshop_id, admin_id, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as AuditRow[];
    setRows(list);
    setError(null);
    // Names of the admins, where their profiles are readable; otherwise the log shows a short id.
    const ids = [...new Set(list.map((r) => r.admin_id).filter((id): id is string => Boolean(id)))];
    if (ids.length > 0) {
      const { data: people } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
      const names: Record<string, string> = {};
      for (const p of (people ?? []) as { id: string; full_name: string | null; email: string }[]) {
        names[p.id] = p.full_name?.trim() || p.email;
      }
      setAdmins(names);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workshopName = useMemo(() => new Map(workshops.map((w) => [w.id, w.name])), [workshops]);

  function adminLabel(id: string | null): string {
    if (!id) return 'Deleted account';
    if (id === user.id) return `${user.name} (you)`;
    return admins[id] ?? `Admin ${id.slice(0, 8)}`;
  }

  const columns: Column<AuditRow>[] = [
    {
      header: 'Action',
      mobile: 'title',
      className: 'text-fg',
      cell: (r) => <span className="break-words font-medium">{describeAction(r)}</span>,
    },
    {
      header: 'Time',
      mobile: 'corner',
      className: 'whitespace-nowrap text-fg3',
      cell: (r) => <time dateTime={r.created_at}>{dateTimeFormat.format(new Date(r.created_at))}</time>,
    },
    {
      header: 'Workshop',
      cell: (r) =>
        r.workshop_id ? (
          (workshopName.get(r.workshop_id) ?? 'Deleted workshop')
        ) : (
          <span className="text-fg3">Platform</span>
        ),
    },
    { header: 'Admin', cell: (r) => <span className="break-words">{adminLabel(r.admin_id)}</span> },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-fg">Audit log</h3>
          <p className="text-xs text-fg2">The latest 100 admin actions.</p>
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={loading} className="min-h-11 md:min-h-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </Button>
      </div>
      {error && (
        <div className="px-4 pt-4">
          <ErrorNote errors={error} />
        </div>
      )}
      {loading && rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-fg2">Loading the audit log...</p>
      ) : (
        <DataTable columns={columns} rows={rows} getKey={(r) => r.id} emptyMessage="No admin actions yet." />
      )}
    </Card>
  );
}
