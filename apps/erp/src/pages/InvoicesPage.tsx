import { FileText } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { EmptyNote } from './SalesPage';

/** Invoices: not built yet, so real zeros and an explanation instead of sample invoices. */
export function InvoicesPage() {
  const summary = [
    { label: 'Outstanding', color: 'text-accent' },
    { label: 'Paid', color: 'text-ok' },
    { label: 'Overdue', color: 'text-bad' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {summary.map((card) => (
          <div key={card.label} className="glass rounded-xl p-4 sm:p-5">
            <div className="text-xs text-fg2">{card.label}</div>
            <div className={`mt-2 font-display text-xl font-semibold ${card.color}`}>{formatCurrency(0)}</div>
          </div>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <CardHeader title="All invoices" />
        <EmptyNote icon={<FileText className="h-5 w-5" aria-hidden />} title="No invoices yet">
          Invoices will be created from completed repair orders once invoicing is set up. Until then, the approved
          totals are on each repair order.
        </EmptyNote>
      </Card>
    </div>
  );
}
