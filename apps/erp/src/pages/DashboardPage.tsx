import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardList, DollarSign, Hourglass } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PartRow } from '@eurowerken/shared';
import { useAuth } from '@/auth/AuthContext';
import { listParts } from '@/api/catalogue';
import { vehicleLabel } from '@/api/appointments';
import { ITEM_KIND_LABEL, REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, lineTotal } from '@/api/repairOrders';
import type { ItemKind } from '@/api/repairOrders';
import { loadWorkOrders, monthKey } from '@/api/workStats';
import type { DashOrder, Load } from '@/api/workStats';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCompactCurrency, formatCurrency, formatCurrencyWhole } from '@/lib/format';
import { chartPalette } from '@/theme/chartPalette';
import { useTheme } from '@/theme/ThemeProvider';
import { TodayAppointmentsCard } from './appointments/TodayAppointmentsCard';

/**
 * The dashboard, from the workshop's real data only:
 *   completed work   approved items (before tax) of repair orders completed in the period
 *   open orders      repair orders not completed or cancelled
 *   stock alerts     parts below their minimum stock
 *   awaiting         repair orders waiting for the customer's approval
 * Invoices and payments are not built yet, so nothing here claims to be paid revenue.
 */

const orderColumns: Column<DashOrder>[] = [
  { header: 'Order', cell: (o) => o.number, className: 'font-semibold text-accent' },
  { header: 'Customer', cell: (o) => o.contact_name, className: 'text-fg' },
  { header: 'Vehicle', cell: (o) => vehicleLabel(o.vehicle) || '—' },
  { header: 'Technician', cell: (o) => o.technician_name ?? '—' },
  { header: 'Status', cell: (o) => <Badge tone={REPAIR_STATUS_TONE[o.status]}>{REPAIR_STATUS_LABEL[o.status]}</Badge>, mobile: 'corner' },
  { header: 'Approved', cell: (o) => formatCurrency(o.approved), className: 'font-semibold text-fg', mobile: 'corner' },
];

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-fg3">{children}</p>;
}

export function DashboardPage() {
  const { effective: mode, highContrast } = useTheme();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const palette = chartPalette(mode, highContrast);
  const workshopId = user?.workshop?.id ?? null;
  const seeOrders = can('repair-orders', 'view');
  const seeParts = can('inventory', 'view');

  const [orders, setOrders] = useState<Load<DashOrder[]>>({ status: 'loading' });
  const [parts, setParts] = useState<Load<PartRow[]>>({ status: 'loading' });

  const load = useCallback(() => {
    if (!workshopId) return;
    if (seeOrders) {
      loadWorkOrders(workshopId).then(
        (data) => setOrders({ status: 'ready', data }),
        (e: Error) => setOrders({ status: 'error', message: e.message }),
      );
    }
    if (seeParts) {
      listParts(workshopId).then(
        (data) => setParts({ status: 'ready', data }),
        (e: Error) => setParts({ status: 'error', message: e.message }),
      );
    }
  }, [workshopId, seeOrders, seeParts]);

  useEffect(load, [load]);

  const list = orders.status === 'ready' ? orders.data : [];
  const stats = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    const byMonth = new Map(months.map((m) => [monthKey(m), 0]));
    const mix = new Map<ItemKind, number>();
    for (const o of list) {
      if (o.status !== 'completed' || !o.completed_at) continue;
      const k = monthKey(new Date(o.completed_at));
      if (byMonth.has(k)) {
        byMonth.set(k, (byMonth.get(k) ?? 0) + o.approved);
        for (const i of o.items) if (i.approval === 'approved') mix.set(i.kind, (mix.get(i.kind) ?? 0) + lineTotal(i));
      }
    }
    const series = months.map((m) => ({ month: m.toLocaleString(undefined, { month: 'short' }), value: Math.round(byMonth.get(monthKey(m)) ?? 0) }));
    const thisMonth = series[5].value;
    const lastMonth = series[4].value;
    const mixTotal = [...mix.values()].reduce((a, b) => a + b, 0);
    return {
      series,
      hasSeries: series.some((s) => s.value > 0),
      thisMonth,
      change: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : undefined,
      mix: [...mix.entries()].filter(([, v]) => v > 0).map(([kind, v]) => ({ name: ITEM_KIND_LABEL[kind], value: v, pct: mixTotal ? Math.round((v / mixTotal) * 100) : 0 })).sort((a, b) => b.value - a.value),
      open: list.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length,
      awaiting: list.filter((o) => o.status === 'awaiting_approval'),
    };
  }, [list]);

  const stockAlerts = parts.status === 'ready' ? parts.data.filter((p) => p.stock < p.min_stock) : [];
  const sliceColors = [palette.accent, palette.ok, palette.warn, palette.bad];
  const tooltipStyle = {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: palette.tooltipText,
  };
  const dash = (s: { status: string }) => (s.status === 'ready' ? undefined : s.status === 'loading' ? '…' : '—');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {seeOrders && (
          <KpiCard
            icon={DollarSign}
            label="Completed work (this month)"
            value={dash(orders) ?? formatCurrencyWhole(stats.thisMonth)}
            caption={stats.change !== undefined ? 'vs last month' : 'approved work, before tax'}
            change={stats.change}
          />
        )}
        {seeOrders && <KpiCard icon={ClipboardList} label="Open repair orders" value={dash(orders) ?? String(stats.open)} caption="not completed or cancelled" />}
        {seeParts && <KpiCard icon={AlertTriangle} label="Stock alerts" value={dash(parts) ?? String(stockAlerts.length)} caption="parts below minimum" />}
        {seeOrders && <KpiCard icon={Hourglass} label="Awaiting approval" value={dash(orders) ?? String(stats.awaiting.length)} caption="waiting for the customer" />}
      </div>

      {orders.status === 'error' && <p role="alert" className="text-sm text-bad">Could not load repair orders: {orders.message}</p>}

      {seeOrders && <TodayAppointmentsCard />}

      {seeOrders && (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <Card className="p-4 sm:p-5">
            <CardHeader
              title="Completed work"
              subtitle="Approved items of completed repair orders, before tax"
              action={<span className="text-xs font-medium text-fg2">6-month</span>}
            />
            {stats.hasSeries ? (
              <div className="h-52" role="img" aria-label="Bar chart of completed work per month for the last six months">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.series} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      {/* The current month: a cobalt glass bar. Earlier months: quiet translucent bars. */}
                      <linearGradient id="dash-bar-current" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette.barTop} stopOpacity={1} />
                        <stop offset="100%" stopColor={palette.barBottom} stopOpacity={highContrast ? 1 : 0.9} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: palette.grid }} formatter={(v) => formatCurrencyWhole(Number(v))} />
                    <Bar dataKey="value" name="Completed work" radius={[8, 8, 0, 0]} maxBarSize={52}>
                      {stats.series.map((_, i) => (
                        <Cell
                          key={i}
                          fill={i === stats.series.length - 1 ? 'url(#dash-bar-current)' : palette.barMuted}
                          fillOpacity={i === stats.series.length - 1 || highContrast ? 1 : 0.45}
                          stroke={highContrast ? palette.axis : 'rgba(255,255,255,0.18)'}
                          strokeWidth={highContrast ? 2 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-52"><Empty>{orders.status === 'loading' ? 'Loading…' : 'No completed repair orders in the last 6 months yet.'}</Empty></div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <CardHeader title="Work mix" subtitle="Completed work by item type" />
            {stats.mix.length > 0 ? (
              <>
                <div className="relative h-44" role="img" aria-label="Donut chart of completed work by item type">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.mix}
                        dataKey="value"
                        innerRadius={56}
                        outerRadius={78}
                        paddingAngle={stats.mix.length > 1 ? 3 : 0}
                        stroke={highContrast ? palette.axis : 'rgba(255,255,255,0.22)'}
                        strokeWidth={highContrast ? 2 : 1}
                        cornerRadius={stats.mix.length > 1 ? 6 : 0}
                      >
                        {stats.mix.map((slice, i) => (
                          <Cell key={slice.name} fill={sliceColors[i % sliceColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrencyWhole(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* The largest share, in the middle of the ring. */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
                    <span className="font-display text-2xl font-semibold tracking-tight text-fg">{stats.mix[0].pct}%</span>
                    <span className="text-xs text-fg2">{stats.mix[0].name}</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {stats.mix.map((slice, i) => (
                    <li key={slice.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-fg2">
                        <span className="h-2 w-2 rounded-sm" style={{ background: sliceColors[i % sliceColors.length] }} />
                        {slice.name}
                      </span>
                      <span className="font-semibold text-fg">{slice.pct}%</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="h-44"><Empty>Shows once repair orders are completed.</Empty></div>
            )}
          </Card>
        </div>
      )}

      <div className={`grid gap-4 ${seeOrders && seeParts ? 'xl:grid-cols-[1fr_300px]' : ''}`}>
        {seeOrders && (
          <Card className="overflow-hidden">
            <div className="p-4 pb-3 sm:p-5 sm:pb-3">
              <CardHeader
                title="Recent repair orders"
                action={
                  <Link to="/repair-orders" className="text-xs font-semibold text-accent hover:underline">
                    All repair orders →
                  </Link>
                }
              />
            </div>
            {list.length > 0 ? (
              <DataTable columns={orderColumns} rows={list.slice(0, 5)} getKey={(o) => o.id} onRowClick={(o) => navigate(`/repair-orders/${o.id}`)} />
            ) : (
              <div className="px-4 pb-5 sm:px-5">
                <Empty>{orders.status === 'loading' ? 'Loading…' : 'No repair orders yet. Checking in an appointment creates one.'}</Empty>
              </div>
            )}
          </Card>
        )}

        {seeParts && (
          <Card className="p-4 sm:p-5">
            <CardHeader title="Stock alerts" action={stockAlerts.length > 0 ? <Badge tone="bad">{stockAlerts.length} to reorder</Badge> : undefined} />
            {parts.status === 'error' && <p role="alert" className="text-xs text-bad">Could not load parts: {parts.message}</p>}
            {stockAlerts.length === 0 ? (
              <Empty>{parts.status === 'loading' ? 'Loading…' : 'All parts are at or above their minimum stock.'}</Empty>
            ) : (
              <ul className="space-y-2.5">
                {stockAlerts.slice(0, 6).map((part) => {
                  const out = part.stock <= 0;
                  const fill = part.min_stock > 0 ? Math.min(100, (Math.max(0, part.stock) / part.min_stock) * 100) : 0;
                  return (
                    <li key={part.id} className="rounded-lg border border-line/70 bg-surface2/50 p-3">
                      <div className="text-xs font-semibold leading-snug text-fg">{part.name}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-fg3">{part.sku ?? part.part_number ?? ''}</span>
                        <Badge tone={out ? 'bad' : 'warn'}>{out ? 'Out of stock' : 'Low stock'}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 rounded bg-line">
                          <div className={`h-full rounded ${out ? 'bg-bad' : 'bg-warn'}`} style={{ width: `${fill}%` }} />
                        </div>
                        <span className="text-[10px] text-fg2">
                          {part.stock}/{part.min_stock}
                        </span>
                      </div>
                    </li>
                  );
                })}
                {stockAlerts.length > 6 && (
                  <li>
                    <Link to="/inventory" className="text-xs font-semibold text-accent hover:underline">
                      {stockAlerts.length - 6} more in Inventory →
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
