import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ClipboardList } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, formatDateTime, getTimeZone, vehicleLabel } from '@/api/appointments';
import {
  REPAIR_STATUSES,
  REPAIR_STATUS_LABEL,
  REPAIR_STATUS_TONE,
  countRepairStatuses,
  listRepairOrders,
  matchesRepairSearch,
  plateOf,
  subscribeRepairOrders,
} from '@/api/repairOrders';
import type { RepairOrderSummary, RepairStatus } from '@/api/repairOrders';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatCurrency } from '@/lib/format';
import { ErrorNote } from './inventory/PartForm';

type Tab = 'all' | RepairStatus;
const TABS: Tab[] = ['all', ...REPAIR_STATUSES];

/** Repair orders from check-in to pickup: status tabs with counts, search, and a link to each order's page. */
export function RepairOrdersPage() {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openParam = params.get('open');

  const [orders, setOrders] = useState<RepairOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState('America/Edmonton');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const request = useRef(0);
  const load = useCallback(async () => {
    if (!workshopId) return;
    const mine = ++request.current;
    setError(null);
    try {
      const list = await listRepairOrders(workshopId);
      if (mine === request.current) setOrders(list);
    } catch (err) {
      if (mine === request.current) setError(errorMessage(err, 'Repair orders could not be loaded.'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    if (openParam) return;
    void load();
  }, [load, openParam]);

  useEffect(() => {
    if (!workshopId) return;
    void getTimeZone(workshopId).then(setTz).catch(() => undefined);
  }, [workshopId]);

  // Live: any change to an order or its items reloads the list (a short pause groups bursts).
  useEffect(() => {
    if (!workshopId || openParam) return;
    let timer = 0;
    const unsubscribe = subscribeRepairOrders(workshopId, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 400);
    });
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [workshopId, openParam, load]);

  // /repair-orders?open=<id> (older links and notifications) goes to the order's own page.
  if (openParam) return <Navigate to={`/repair-orders/${encodeURIComponent(openParam)}`} replace />;

  const searched = orders.filter((o) => matchesRepairSearch(o, search));
  const counts = countRepairStatuses(searched);
  const rows = tab === 'all' ? searched : searched.filter((o) => o.status === tab);

  const columns: Column<RepairOrderSummary>[] = [
    {
      header: 'Repair order',
      mobile: 'title',
      className: 'min-w-0',
      cell: (o) => (
        <Link
          to={`/repair-orders/${o.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11"
        >
          <span className="block font-semibold text-accent">{o.number}</span>
          <span className="block break-words font-medium text-fg">{o.contact_name}</span>
        </Link>
      ),
    },
    { header: 'Status', mobile: 'corner', cell: (o) => <Badge tone={REPAIR_STATUS_TONE[o.status]}>{REPAIR_STATUS_LABEL[o.status]}</Badge> },
    {
      header: 'Car',
      cell: (o) => {
        const plate = plateOf(o.vehicle);
        return (
          <span className="block min-w-0">
            <span className="block text-fg">{vehicleLabel(o.vehicle) || 'Not given'}</span>
            {plate && <span className="block font-mono text-[11px] uppercase text-fg3">{plate}</span>}
          </span>
        );
      },
    },
    { header: 'Technician', cell: (o) => o.technician_name ?? <span className="text-fg3">Not assigned</span> },
    {
      header: 'Items total',
      className: 'tabular-nums font-semibold text-fg',
      cell: (o) => (
        <span>
          {formatCurrency(o.totals.total)}
          {o.totals.pending > 0 && <span className="block text-[11px] font-normal text-warn">{formatCurrency(o.totals.pending)} waiting</span>}
        </span>
      ),
    },
    { header: 'Created', className: 'text-fg3', cell: (o) => formatDateTime(o.created_at, tz) },
  ];

  if (loading && orders.length === 0 && !error) {
    return (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading repair orders...
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div
          role="group"
          aria-label="Filter by status"
          className="no-scrollbar -mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {TABS.map((t) => {
            const active = t === tab;
            const count = t === 'all' ? searched.length : counts[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(t)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition coarse:min-h-11 coarse:px-3.5 ${
                  active ? 'bg-accent font-semibold text-white' : 'border border-line bg-surface/70 text-fg2 hover:text-fg'
                }`}
              >
                {t === 'all' ? 'All' : REPAIR_STATUS_LABEL[t]}
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? 'bg-white/20' : 'bg-fg3/15'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search number, name, plate or code" className="w-full lg:w-72 lg:shrink-0" />
      </div>

      <p aria-live="polite" className="sr-only">
        {loading ? '' : `${rows.length} repair order${rows.length === 1 ? '' : 's'} shown.`}
      </p>

      {error && (
        <Card className="space-y-3 p-4">
          <ErrorNote errors={`Repair orders could not be loaded. ${error}`} />
          <Button variant="ghost" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      {!error && orders.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <ClipboardList className="h-8 w-8 text-fg3" aria-hidden />
          <p className="max-w-sm text-sm text-fg2">No repair orders yet. Check in a booking from Appointments to create one.</p>
          <p className="max-w-sm text-[11px] text-fg3">For a walk-in, add an appointment first and check it in.</p>
          <Link
            to="/appointments"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent coarse:min-h-11"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Go to Appointments
          </Link>
        </Card>
      ) : (
        !error && (
          <Card className="overflow-hidden">
            <DataTable
              columns={columns}
              rows={rows}
              getKey={(o) => o.id}
              cardsBelow="lg"
              onRowClick={(o) => navigate(`/repair-orders/${o.id}`)}
              emptyMessage={search.trim() ? 'No repair orders match the search.' : 'No repair orders in this status.'}
            />
          </Card>
        )
      )}
    </div>
  );
}
