import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/auth/AuthContext';
import { lineTotal } from '@/api/repairOrders';
import { lastSixMonths, loadWorkOrders, monthKey } from '@/api/workStats';
import type { DashOrder, Load } from '@/api/workStats';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { formatCompactCurrency, formatCurrencyWhole } from '@/lib/format';
import { chartPalette } from '@/theme/chartPalette';
import { useTheme } from '@/theme/ThemeProvider';

/** Reports from real repair orders: completed work per month, parts used, and work per technician. */

interface TechRow {
  name: string;
  orders: number;
  avgHours: number | null;
  value: number;
}

const technicianColumns: Column<TechRow>[] = [
  { header: 'Technician', cell: (t) => t.name, className: 'font-medium text-fg' },
  { header: 'Orders completed', cell: (t) => t.orders },
  { header: 'Avg. time in workshop', cell: (t) => (t.avgHours === null ? '—' : t.avgHours < 48 ? `${t.avgHours.toFixed(1)} h` : `${(t.avgHours / 24).toFixed(1)} days`) },
  { header: 'Completed work', cell: (t) => formatCurrencyWhole(t.value), className: 'font-semibold text-fg', mobile: 'corner' },
];

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-full items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-xs text-fg3">{children}</p>;
}

export function ReportsPage() {
  const { effective: mode, highContrast } = useTheme();
  const { user } = useAuth();
  const palette = chartPalette(mode, highContrast);
  const workshopId = user?.workshop?.id ?? null;
  const [state, setState] = useState<Load<DashOrder[]>>({ status: 'loading' });

  useEffect(() => {
    if (!workshopId) return;
    loadWorkOrders(workshopId).then(
      (data) => setState({ status: 'ready', data }),
      (e: Error) => setState({ status: 'error', message: e.message }),
    );
  }, [workshopId]);

  const report = useMemo(() => {
    const list = state.status === 'ready' ? state.data : [];
    const done = list.filter((o) => o.status === 'completed' && o.completed_at);
    const months = lastSixMonths();
    const byMonth = new Map(months.map((m) => [monthKey(m), 0]));
    for (const o of done) {
      const k = monthKey(new Date(o.completed_at as string));
      if (byMonth.has(k)) byMonth.set(k, (byMonth.get(k) ?? 0) + o.approved);
    }
    const series = months.map((m) => ({ month: m.toLocaleString(undefined, { month: 'short' }), value: Math.round(byMonth.get(monthKey(m)) ?? 0) }));

    // Parts fitted this month: approved part lines of orders completed this month.
    const thisMonth = monthKey(new Date());
    const parts = new Map<string, number>();
    for (const o of done) {
      if (monthKey(new Date(o.completed_at as string)) !== thisMonth) continue;
      for (const i of o.items) {
        if (i.kind === 'part' && i.approval === 'approved') parts.set(i.description, (parts.get(i.description) ?? 0) + i.quantity);
      }
    }
    const topParts = [...parts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, used]) => ({ name, used }));

    const techs = new Map<string, { name: string; orders: number; hours: number; value: number }>();
    for (const o of done) {
      const key = o.technician_id ?? 'none';
      const t = techs.get(key) ?? { name: o.technician_name ?? 'Not assigned', orders: 0, hours: 0, value: 0 };
      t.orders += 1;
      t.hours += (new Date(o.completed_at as string).getTime() - new Date(o.created_at).getTime()) / 3_600_000;
      t.value += o.items.filter((i) => i.approval === 'approved').reduce((s, i) => s + lineTotal(i), 0);
      techs.set(key, t);
    }
    const technicians: TechRow[] = [...techs.values()]
      .map((t) => ({ name: t.name, orders: t.orders, avgHours: t.orders ? t.hours / t.orders : null, value: t.value }))
      .sort((a, b) => b.value - a.value);

    return { series, hasSeries: series.some((s) => s.value > 0), topParts, technicians };
  }, [state]);

  const tooltipStyle = {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: palette.tooltipText,
  };
  const waiting = state.status === 'loading' ? 'Loading…' : null;

  return (
    <div className="space-y-4">
      {state.status === 'error' && <p role="alert" className="text-sm text-bad">Could not load repair orders: {state.message}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <CardHeader title="Completed work by month" subtitle="Last 6 months · approved items, before tax" />
          <div className="h-56" role="img" aria-label="Bar chart of completed work per month for the last six months">
            {report.hasSeries ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.series} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                  <Tooltip cursor={{ fill: palette.grid, opacity: 0.4 }} contentStyle={tooltipStyle} formatter={(v) => formatCurrencyWhole(Number(v))} />
                  <Bar dataKey="value" name="Completed work" fill={palette.accent} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty>{waiting ?? 'No completed repair orders in the last 6 months yet.'}</Empty>
            )}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader title="Top parts fitted" subtitle="Units on repair orders completed this month" />
          <div className="h-56" role="img" aria-label="Horizontal bar chart of the most used parts this month">
            {report.topParts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.topParts} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: palette.grid, opacity: 0.4 }} contentStyle={tooltipStyle} />
                  <Bar dataKey="used" name="Units" fill={palette.ok} radius={[0, 4, 4, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty>{waiting ?? 'No parts fitted on completed repair orders this month yet.'}</Empty>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 pb-3 sm:p-5 sm:pb-3">
          <CardHeader title="Technician performance" subtitle="All completed repair orders" />
        </div>
        {report.technicians.length > 0 ? (
          <DataTable columns={technicianColumns} rows={report.technicians} getKey={(t) => t.name} />
        ) : (
          <div className="h-28 px-4 pb-5 sm:px-5">
            <Empty>{waiting ?? 'Shows once repair orders are completed.'}</Empty>
          </div>
        )}
      </Card>
    </div>
  );
}
