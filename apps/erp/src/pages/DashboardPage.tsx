import { AlertTriangle, ClipboardList, DollarSign, FileText } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { invoices, parts, repairOrders, revenueSeries, serviceMix } from '@/data/mock';
import type { RepairOrder } from '@/data/types';
import { formatCompactCurrency, formatCurrency, formatCurrencyWhole } from '@/lib/format';
import { REPAIR_TONE, STOCK_LABEL, STOCK_TONE, stockStatus } from '@/lib/status';
import { chartPalette } from '@/theme/chartPalette';
import { useTheme } from '@/theme/ThemeProvider';

const orderColumns: Column<RepairOrder>[] = [
  { header: 'Order', cell: (o) => o.id, className: 'font-semibold text-accent' },
  { header: 'Customer', cell: (o) => o.customer, className: 'text-fg' },
  { header: 'Vehicle', cell: (o) => o.vehicle },
  { header: 'Technician', cell: (o) => o.technician },
  { header: 'Status', cell: (o) => <Badge tone={REPAIR_TONE[o.status]}>{o.status}</Badge>, mobile: 'corner' },
  { header: 'Total', cell: (o) => formatCurrency(o.total), className: 'font-semibold text-fg', mobile: 'corner' },
];

export function DashboardPage() {
  const { mode } = useTheme();
  const palette = chartPalette(mode);

  const latest = revenueSeries[revenueSeries.length - 1];
  const previous = revenueSeries[revenueSeries.length - 2];
  const revenueChange = ((latest.revenue - previous.revenue) / previous.revenue) * 100;

  const openOrders = repairOrders.filter((o) => o.status !== 'Completed').length;
  const stockAlerts = parts.filter((p) => stockStatus(p) !== 'ok');
  const unpaid = invoices.filter((i) => i.status !== 'Paid');
  const unpaidTotal = unpaid.reduce((sum, i) => sum + i.amount, 0);

  const sliceColors = [palette.accent, palette.ok, palette.warn, palette.bad];

  const tooltipStyle = {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: palette.tooltipText,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Revenue (this month)"
          value={formatCurrencyWhole(latest.revenue)}
          caption="vs last month"
          change={revenueChange}
        />
        <KpiCard icon={ClipboardList} label="Open repair orders" value={String(openOrders)} caption="not yet completed" />
        <KpiCard
          icon={AlertTriangle}
          label="Stock alerts"
          value={String(stockAlerts.length)}
          caption="parts below minimum"
        />
        <KpiCard
          icon={FileText}
          label="Unpaid invoices"
          value={formatCurrencyWhole(unpaidTotal)}
          caption={`${unpaid.length} invoices outstanding`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Revenue trend"
            subtitle="Last 6 months against target"
            action={
              <div className="flex items-center gap-4 text-[11px] text-fg2">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-accent" />
                  Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 border-t-2 border-dashed border-fg3" />
                  Target
                </span>
              </div>
            }
          />
          <div className="h-52" role="img" aria-label="Area chart of monthly revenue against target for the last six months">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={palette.accent} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={palette.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatCompactCurrency(v)}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrencyWhole(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="target"
                  stroke={palette.target}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  fill="none"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={palette.accent}
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                  dot={{ r: 3, fill: palette.accent }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader title="Revenue mix" subtitle="By service category" />
          <div className="h-32" role="img" aria-label="Donut chart of revenue share by service category">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={serviceMix} dataKey="value" innerRadius={36} outerRadius={58} paddingAngle={3} stroke="none">
                  {serviceMix.map((slice, i) => (
                    <Cell key={slice.name} fill={sliceColors[i % sliceColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2">
            {serviceMix.map((slice, i) => (
              <li key={slice.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-fg2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: sliceColors[i % sliceColors.length] }} />
                  {slice.name}
                </span>
                <span className="font-semibold text-fg">{slice.value}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <div className="p-4 pb-3 sm:p-4 sm:p-5 sm:pb-3">
            <CardHeader title="Recent repair orders" />
          </div>
          <DataTable columns={orderColumns} rows={repairOrders.slice(0, 4)} getKey={(o) => o.id} />
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Stock alerts"
            action={stockAlerts.length > 0 ? <Badge tone="bad">{stockAlerts.length} to reorder</Badge> : undefined}
          />
          <ul className="space-y-2.5">
            {stockAlerts.map((part) => {
              const status = stockStatus(part);
              const fill = Math.min(100, (part.stock / part.minStock) * 100);
              return (
                <li key={part.id} className="rounded-lg border border-line bg-surface2 p-3">
                  <div className="text-xs font-semibold leading-snug text-fg">{part.name}</div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-fg3">{part.id}</span>
                    <Badge tone={STOCK_TONE[status]}>{STOCK_LABEL[status]}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 rounded bg-line">
                      <div
                        className={`h-full rounded ${status === 'out' ? 'bg-bad' : 'bg-warn'}`}
                        style={{ width: `${fill}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-fg2">
                      {part.stock}/{part.minStock}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
