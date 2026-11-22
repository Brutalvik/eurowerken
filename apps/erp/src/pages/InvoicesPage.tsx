import { Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { invoices } from '@/data/mock';
import type { Invoice, InvoiceStatus } from '@/data/types';
import { formatCurrency } from '@/lib/format';
import { INVOICE_TONE } from '@/lib/status';

function sumByStatus(statuses: InvoiceStatus[]): number {
  return invoices.filter((i) => statuses.includes(i.status)).reduce((sum, i) => sum + i.amount, 0);
}

export function InvoicesPage() {
  const { can } = useAuth();

  const summary = [
    { label: 'Outstanding', value: sumByStatus(['Pending', 'Overdue']), color: 'text-accent' },
    { label: 'Paid', value: sumByStatus(['Paid']), color: 'text-ok' },
    { label: 'Overdue', value: sumByStatus(['Overdue']), color: 'text-bad' },
  ];

  const columns: Column<Invoice>[] = [
    { header: 'Invoice', cell: (i) => i.id, className: 'font-semibold text-accent' },
    { header: 'Customer', cell: (i) => i.customer, className: 'font-medium text-fg' },
    { header: 'Vehicle', cell: (i) => i.vehicle },
    { header: 'Issued', cell: (i) => i.issued },
    {
      header: 'Due',
      cell: (i) => i.due,
      className: 'text-fg2',
    },
    { header: 'Amount', cell: (i) => formatCurrency(i.amount), className: 'font-semibold text-fg', mobile: 'corner' },
    { header: 'Status', cell: (i) => <Badge tone={INVOICE_TONE[i.status]}>{i.status}</Badge>, mobile: 'corner' },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: () => (
        <Button variant="ghost" size="sm">
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {summary.map((card) => (
          <div key={card.label} className="glass rounded-xl p-4 sm:p-5">
            <div className="text-xs text-fg2">{card.label}</div>
            <div className={`mt-2 font-display text-xl font-semibold ${card.color}`}>{formatCurrency(card.value)}</div>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 pb-3 sm:p-4 sm:p-5 sm:pb-3">
          <CardHeader
            title="All invoices"
            action={
              can('invoices', 'full') ? (
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  New invoice
                </Button>
              ) : undefined
            }
          />
        </div>
        <DataTable columns={columns} rows={invoices} getKey={(i) => i.id} />
      </Card>
    </div>
  );
}
