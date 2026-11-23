import { ShoppingBag } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';

/**
 * Sales: counter and online parts sales and payments. Not built yet (payments are on hold), so the page
 * shows real zeros and says so, rather than sample numbers.
 */
export function SalesPage() {
  const summary = [
    { label: 'Total sales', caption: '0 transactions' },
    { label: 'Parts sales', caption: 'counter and online' },
    { label: 'Service sales', caption: 'paid repair orders' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {summary.map((card) => (
          <div key={card.label} className="glass rounded-xl p-4 sm:p-5">
            <div className="text-xs text-fg2">{card.label}</div>
            <div className="mt-2 font-display text-xl font-semibold text-fg">{formatCurrency(0)}</div>
            <div className="mt-1 text-[11px] text-fg3">{card.caption}</div>
          </div>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <CardHeader title="Transactions" />
        <EmptyNote icon={<ShoppingBag className="h-5 w-5" aria-hidden />} title="No sales yet">
          Payments at the workshop and online parts orders will appear here once payments are set up.
        </EmptyNote>
      </Card>
    </div>
  );
}

export function EmptyNote({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">{icon}</span>
      <p className="mt-3 font-semibold text-fg">{title}</p>
      <p className="mt-1 max-w-md text-sm text-fg2">{children}</p>
    </div>
  );
}
