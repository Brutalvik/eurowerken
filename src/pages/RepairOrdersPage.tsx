import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { PillTabs } from '@/components/ui/PillTabs';
import { repairOrders } from '@/data/mock';
import type { RepairOrder } from '@/data/types';
import { formatCurrency } from '@/lib/format';
import { REPAIR_TONE } from '@/lib/status';

const TABS = ['All', 'Pending', 'In Progress', 'Quality Check', 'Completed'] as const;
type Tab = (typeof TABS)[number];

const columns: Column<RepairOrder>[] = [
  { header: 'Order', cell: (o) => o.id, className: 'font-semibold text-accent' },
  { header: 'Customer', cell: (o) => o.customer, className: 'font-medium text-fg' },
  { header: 'Vehicle', cell: (o) => o.vehicle },
  { header: 'Service', cell: (o) => o.service },
  { header: 'Technician', cell: (o) => o.technician },
  { header: 'Date', cell: (o) => o.date, className: 'text-fg3' },
  { header: 'Status', cell: (o) => <Badge tone={REPAIR_TONE[o.status]}>{o.status}</Badge> },
  { header: 'Total', cell: (o) => formatCurrency(o.total), className: 'font-semibold text-fg' },
];

export function RepairOrdersPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('All');
  const rows = tab === 'All' ? repairOrders : repairOrders.filter((o) => o.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs label="Repair order status" options={TABS} value={tab} onChange={setTab} />
        {can('repair-orders', 'full') && (
          <Button>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New repair order
          </Button>
        )}
      </div>
      <Card className="overflow-hidden">
        <DataTable columns={columns} rows={rows} getKey={(o) => o.id} emptyMessage="No repair orders in this status." />
      </Card>
    </div>
  );
}
