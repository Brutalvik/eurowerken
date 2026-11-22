import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { PillTabs } from '@/components/ui/PillTabs';
import { SearchInput } from '@/components/ui/SearchInput';
import { parts } from '@/data/mock';
import type { Part } from '@/data/types';
import { formatCurrency } from '@/lib/format';
import { STOCK_LABEL, STOCK_TONE, stockStatus } from '@/lib/status';

const CATEGORIES = ['All', ...Array.from(new Set(parts.map((p) => p.category)))] as const;

export function InventoryPage() {
  const { can } = useAuth();
  const canEdit = can('inventory', 'full');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter(
      (p) =>
        (category === 'All' || p.category === category) &&
        (q === '' || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [search, category]);

  const columns: Column<Part>[] = [
    { header: 'Part ID', cell: (p) => p.id, className: 'font-semibold text-accent' },
    {
      header: 'Name',
      mobile: 'title',
      cell: (p) => (
        <div>
          <div className="font-medium text-fg">{p.name}</div>
          <div className="mt-0.5 text-[10px] text-fg3">{p.sku}</div>
        </div>
      ),
    },
    { header: 'Category', cell: (p) => p.category },
    {
      header: 'Stock',
      cell: (p) => {
        const status = stockStatus(p);
        const color = status === 'out' ? 'text-bad' : status === 'low' ? 'text-warn' : 'text-fg';
        return <span className={`font-display text-base font-semibold ${color}`}>{p.stock}</span>;
      },
    },
    { header: 'Min', cell: (p) => p.minStock },
    { header: 'Unit cost', cell: (p) => formatCurrency(p.unitCost), className: 'font-medium text-fg' },
    {
      header: 'Status',
      mobile: 'corner',
      cell: (p) => {
        const status = stockStatus(p);
        return <Badge tone={STOCK_TONE[status]}>{STOCK_LABEL[status]}</Badge>;
      },
    },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: () =>
        canEdit ? (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm">
              Edit
            </Button>
            <Button variant="ghost" size="sm">
              Reorder
            </Button>
          </div>
        ) : (
          <span className="text-fg3">View only</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search parts, IDs, SKUs" />
          <PillTabs label="Part category" options={CATEGORIES} value={category} onChange={setCategory} />
        </div>
        {canEdit && (
          <Button>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add part
          </Button>
        )}
      </div>
      <Card className="overflow-hidden">
        <DataTable columns={columns} rows={filtered} getKey={(p) => p.id} emptyMessage="No parts match your search." />
      </Card>
    </div>
  );
}
