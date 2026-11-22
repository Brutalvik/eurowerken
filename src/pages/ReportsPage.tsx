import { Star } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { revenueSeries, technicianStats, topParts } from '@/data/mock';
import type { TechnicianStat } from '@/data/types';
import { formatCompactCurrency, formatCurrencyWhole } from '@/lib/format';
import { chartPalette } from '@/theme/chartPalette';
import { useTheme } from '@/theme/ThemeProvider';

const technicianColumns: Column<TechnicianStat>[] = [
  { header: 'Technician', cell: (t) => t.name, className: 'font-medium text-fg' },
  { header: 'Orders completed', cell: (t) => t.orders },
  { header: 'Avg. repair time', cell: (t) => t.avgRepairTime },
  { header: 'Revenue generated', cell: (t) => formatCurrencyWhole(t.revenue), className: 'font-semibold text-fg' },
  {
    header: 'Rating',
    cell: (t) => (
      <span className="inline-flex items-center gap-1 font-semibold text-fg">
        <Star className="h-3.5 w-3.5 fill-warn text-warn" aria-hidden />
        {t.rating.toFixed(1)}
      </span>
    ),
  },
];

export function ReportsPage() {
  const { mode } = useTheme();
  const palette = chartPalette(mode);

  const tooltipStyle = {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: palette.tooltipText,
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Monthly revenue" subtitle="Last 6 months" />
          <div className="h-56" role="img" aria-label="Bar chart of monthly revenue for the last six months">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueSeries} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatCompactCurrency(v)}
                />
                <Tooltip
                  cursor={{ fill: palette.grid, opacity: 0.4 }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => formatCurrencyWhole(Number(v))}
                />
                <Bar dataKey="revenue" fill={palette.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title="Top parts by volume" subtitle="Units sold this month" />
          <div className="h-56" role="img" aria-label="Horizontal bar chart of units sold for the top five parts">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topParts} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: palette.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={84}
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: palette.grid, opacity: 0.4 }} contentStyle={tooltipStyle} />
                <Bar dataKey="sold" fill={palette.ok} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-5 pb-3">
          <CardHeader title="Technician performance" />
        </div>
        <DataTable columns={technicianColumns} rows={technicianStats} getKey={(t) => t.name} />
      </Card>
    </div>
  );
}
