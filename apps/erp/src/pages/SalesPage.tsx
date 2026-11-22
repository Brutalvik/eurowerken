import { Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { sales } from '@/data/mock';
import type { Sale } from '@/data/types';
import { formatCurrency } from '@/lib/format';

const columns: Column<Sale>[] = [
  { header: 'Sale', cell: (s) => s.id, className: 'font-semibold text-accent' },
  { header: 'Type', cell: (s) => <Badge tone={s.kind === 'Parts' ? 'warn' : 'info'}>{s.kind}</Badge>, mobile: 'corner' },
  { header: 'Customer', cell: (s) => s.customer, className: 'text-fg' },
  { header: 'Items', cell: (s) => s.items },
  { header: 'Total', cell: (s) => formatCurrency(s.total), className: 'font-semibold text-fg', mobile: 'corner' },
  { header: 'When', cell: (s) => s.when, className: 'text-fg3' },
  { header: 'Payment', cell: (s) => s.payment },
];

export function SalesPage() {
  const { can } = useAuth();

  const total = sales.reduce((sum, s) => sum + s.total, 0);
  const partsTotal = sales.filter((s) => s.kind === 'Parts').reduce((sum, s) => sum + s.total, 0);
  const serviceTotal = total - partsTotal;

  const summary = [
    { label: 'Total sales', value: formatCurrency(total), caption: `${sales.length} transactions` },
    { label: 'Parts revenue', value: formatCurrency(partsTotal), caption: 'counter and online' },
    { label: 'Service revenue', value: formatCurrency(serviceTotal), caption: 'labour and fluids' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {summary.map((card) => (
          <div key={card.label} className="glass rounded-xl p-4 sm:p-5">
            <div className="text-xs text-fg2">{card.label}</div>
            <div className="mt-2 font-display text-xl font-semibold text-fg">{card.value}</div>
            <div className="mt-1 text-[11px] text-fg3">{card.caption}</div>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 pb-3 sm:p-4 sm:p-5 sm:pb-3">
          <CardHeader
            title="Recent transactions"
            action={
              can('sales', 'full') ? (
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Quick sale
                </Button>
              ) : undefined
            }
          />
        </div>
        <DataTable columns={columns} rows={sales} getKey={(s) => s.id} />
      </Card>
    </div>
  );
}
