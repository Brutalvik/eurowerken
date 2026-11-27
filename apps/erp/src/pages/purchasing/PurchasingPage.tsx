import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDateTime, getTimeZone } from '@/api/appointments';
import { OPEN_STATUSES, PO_STATUS_LABEL, createPurchaseOrder, listPurchaseOrders, subscribePurchaseOrders } from '@/api/purchaseOrders';
import type { PoStatus, PoSummary } from '@/api/purchaseOrders';
import { listSuppliers, setSupplierActive } from '@/api/suppliers';
import type { Supplier } from '@/api/suppliers';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { PillTabs } from '@/components/ui/PillTabs';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote, Labeled } from '../inventory/PartForm';
import { PartsTechCard, PoStatusBadge, SupplierForm, formatDay, selectClass } from './common';

const VIEWS = ['Purchase orders', 'Suppliers'] as const;
type View = (typeof VIEWS)[number];

type Filter = 'all' | 'open' | PoStatus;
const FILTERS: Filter[] = ['all', 'open', 'draft', 'sent', 'partial', 'received', 'cancelled'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', open: 'Open', ...PO_STATUS_LABEL };

/** Purchasing: purchase orders to suppliers (list, filters, totals) and the supplier list. */
export function PurchasingPage() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('inventory', 'full');
  const [params, setParams] = useSearchParams();
  const view: View = params.get('tab') === 'suppliers' ? 'Suppliers' : 'Purchase orders';

  function setView(v: View) {
    const next = new URLSearchParams(params);
    if (v === 'Suppliers') next.set('tab', 'suppliers');
    else next.delete('tab');
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-4">
      <PillTabs label="Purchasing" options={VIEWS} value={view} onChange={setView} />
      {workshopId && view === 'Purchase orders' && <OrdersView workshopId={workshopId} canEdit={canEdit} />}
      {workshopId && view === 'Suppliers' && <SuppliersView workshopId={workshopId} canEdit={canEdit} />}
      <PartsTechCard />
    </div>
  );
}

// Purchase orders --------------------------------------------------------------------------------------------------

function OrdersView({ workshopId, canEdit }: { workshopId: string; canEdit: boolean }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status') as Filter | null;
  const filter: Filter = statusParam && FILTERS.includes(statusParam) ? statusParam : 'all';
  const partFilter = params.get('part');
  const [orders, setOrders] = useState<PoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tz, setTz] = useState('America/Edmonton');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listPurchaseOrders(workshopId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase orders could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
    void getTimeZone(workshopId).then(setTz).catch(() => undefined);
    return subscribePurchaseOrders(workshopId, () => void load());
  }, [workshopId, load]);

  function setFilter(f: Filter) {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('status');
    else next.set('status', f);
    setParams(next, { replace: true });
  }

  function clearPart() {
    const next = new URLSearchParams(params);
    next.delete('part');
    setParams(next, { replace: true });
  }

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map((f) => [f, 0])) as Record<Filter, number>;
    for (const o of orders) {
      c.all += 1;
      c[o.status] += 1;
      if (OPEN_STATUSES.includes(o.status)) c.open += 1;
    }
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (filter === 'all' || (filter === 'open' ? OPEN_STATUSES.includes(o.status) : o.status === filter)) &&
        (!partFilter || o.part_ids.includes(partFilter)) &&
        (q === '' || [o.number, o.supplier_name, o.repair_number, o.notes].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [orders, filter, partFilter, search]);

  const totals = useMemo(
    () => ({
      value: shown.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.total, 0),
      onOrder: shown.filter((o) => OPEN_STATUSES.includes(o.status)).reduce((a, o) => a + o.outstanding_value, 0),
    }),
    [shown],
  );

  const columns: Column<PoSummary>[] = [
    {
      header: 'Order',
      mobile: 'title',
      cell: (o) => (
        <div className="min-w-0">
          <Link to={`/purchasing/${o.id}`} className="font-semibold text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
            {o.number}
          </Link>
          <div className="mt-0.5 text-[10px] text-fg3">{formatDateTime(o.created_at, tz)}</div>
        </div>
      ),
    },
    { header: 'Supplier', cell: (o) => <span className="text-fg">{o.supplier_name}</span> },
    { header: 'Repair', cell: (o) => o.repair_number ?? <span className="text-fg3">Stock</span> },
    { header: 'Lines', cell: (o) => String(o.line_count) },
    { header: 'Needed by', cell: (o) => (o.expected_at ? formatDay(o.expected_at, tz) : <span className="text-fg3">-</span>) },
    { header: 'Total', cell: (o) => formatCurrency(o.total), className: 'font-medium text-fg' },
    { header: 'Status', mobile: 'corner', cell: (o) => <PoStatusBadge status={o.status} /> },
  ];

  let body;
  if (loading) {
    body = (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading purchase orders...
      </p>
    );
  } else if (error) {
    body = (
      <div className="space-y-3 p-4">
        <ErrorNote errors={error} />
        <Button variant="ghost" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  } else if (orders.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="text-xs text-fg2">No purchase orders yet. Order parts from a supplier, or from a repair order with Order parts.</p>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New purchase order
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        rows={shown}
        getKey={(o) => o.id}
        emptyMessage="No purchase orders match."
        onRowClick={(o) => navigate(`/purchasing/${o.id}`)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search orders, suppliers, repairs" />
          <PillTabs
            label="Order status"
            options={FILTERS.map((f) => `${FILTER_LABEL[f]} (${counts[f]})`)}
            value={`${FILTER_LABEL[filter]} (${counts[filter]})`}
            onChange={(v) => setFilter(FILTERS.find((f) => v.startsWith(`${FILTER_LABEL[f]} (`)) ?? 'all')}
          />
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New purchase order
          </Button>
        )}
      </div>

      {partFilter && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg2">
          <Badge tone="info">One part</Badge>
          Showing orders that include the part you opened from Inventory.
          <button type="button" className="text-accent hover:underline" onClick={clearPart}>
            Show all
          </button>
        </p>
      )}

      {!loading && !error && orders.length > 0 && (
        <p className="text-xs text-fg2" aria-live="polite">
          {shown.length} {shown.length === 1 ? 'order' : 'orders'} · total {formatCurrency(totals.value)}
          {totals.onOrder > 0 && <> · still to arrive {formatCurrency(totals.onOrder)}</>}
          <span className="text-fg3"> (before tax; cancelled orders not counted)</span>
        </p>
      )}

      <Card className="overflow-hidden">{body}</Card>

      <NewOrderDialog
        open={creating}
        workshopId={workshopId}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/purchasing/${id}`)}
      />
    </div>
  );
}

function NewOrderDialog({ open, workshopId, onClose, onCreated }: { open: boolean; workshopId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const id = useId();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuppliers(null);
    listSuppliers(workshopId)
      .then((list) => {
        const active = list.filter((s) => s.active);
        setSuppliers(active);
        setSupplierId((cur) => (active.some((s) => s.id === cur) ? cur : (active[0]?.id ?? '')));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Suppliers could not be loaded.'));
  }, [open, workshopId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError('Choose a supplier, or add one first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const po = await createPurchaseOrder(workshopId, supplierId);
      onClose();
      onCreated(po.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The purchase order could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={open && !adding}
        title="New purchase order"
        onClose={onClose}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={`${id}-form`} disabled={busy || !suppliers || suppliers.length === 0}>
              {busy ? 'Creating...' : 'Create draft'}
            </Button>
          </>
        }
      >
        <form id={`${id}-form`} onSubmit={(e) => void submit(e)} className="space-y-3">
          {suppliers === null && !error && <p className="text-xs text-fg2">Loading suppliers...</p>}
          {suppliers && suppliers.length === 0 && <p className="text-xs text-fg2">You have no active suppliers yet. Add one to start an order.</p>}
          {suppliers && suppliers.length > 0 && (
            <Labeled id={`${id}-supplier`} label="Supplier" hint="You add the parts on the next page. Nothing is sent until you choose to.">
              <select id={`${id}-supplier`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.email ? '' : ' (no email)'}
                  </option>
                ))}
              </select>
            </Labeled>
          )}
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add supplier
          </Button>
          <ErrorNote errors={error} />
        </form>
      </Dialog>
      <SupplierForm
        open={open && adding}
        workshopId={workshopId}
        supplier={null}
        simple
        onClose={() => setAdding(false)}
        onSaved={(s) => {
          setSuppliers((list) => [...(list ?? []), s].sort((a, b) => a.name.localeCompare(b.name)));
          setSupplierId(s.id);
        }}
      />
    </>
  );
}

// Suppliers ----------------------------------------------------------------------------------------------------------

function SuppliersView({ workshopId, canEdit }: { workshopId: string; canEdit: boolean }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ supplier: Supplier | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSuppliers(await listSuppliers(workshopId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppliers could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => q === '' || [s.name, s.contact_name, s.email, s.phone, s.account_number].some((v) => v?.toLowerCase().includes(q)));
  }, [suppliers, search]);

  function onSaved(s: Supplier) {
    setSuppliers((list) => {
      const next = list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
      return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
  }

  async function toggle(s: Supplier) {
    setBusy(s.id);
    setActionError(null);
    try {
      onSaved(await setSupplierActive(s.id, !s.active));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The supplier could not be changed.');
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<Supplier>[] = [
    {
      header: 'Supplier',
      mobile: 'title',
      cell: (s) => (
        <div className="min-w-0">
          <div className="break-words font-medium text-fg">{s.name}</div>
          {s.contact_name && <div className="mt-0.5 text-[10px] text-fg3">{s.contact_name}</div>}
        </div>
      ),
    },
    {
      header: 'Email',
      cell: (s) =>
        s.email ? (
          <a href={`mailto:${s.email}`} className="break-all text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
            {s.email}
          </a>
        ) : (
          <span className="text-fg3">None: orders by phone</span>
        ),
    },
    { header: 'Phone', cell: (s) => s.phone ?? <span className="text-fg3">-</span> },
    { header: 'Account', cell: (s) => s.account_number ?? <span className="text-fg3">-</span> },
    { header: 'Status', mobile: 'corner', cell: (s) => (s.active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>) },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: (s) =>
        canEdit ? (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing({ supplier: s })} aria-label={`Edit ${s.name}`}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" disabled={busy === s.id} onClick={() => void toggle(s)}>
              {s.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        ) : (
          <span className="text-fg3">View only</span>
        ),
    },
  ];

  let body;
  if (loading) {
    body = (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading suppliers...
      </p>
    );
  } else if (error) {
    body = (
      <div className="space-y-3 p-4">
        <ErrorNote errors={error} />
        <Button variant="ghost" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  } else if (suppliers.length === 0) {
    body = <p className="px-4 py-12 text-center text-xs text-fg2">No suppliers yet. Add the parts suppliers you order from.</p>;
  } else {
    body = <DataTable columns={columns} rows={shown} getKey={(s) => s.id} emptyMessage="No suppliers match your search." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers" />
        {canEdit && (
          <Button onClick={() => setEditing({ supplier: null })}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add supplier
          </Button>
        )}
      </div>
      <ErrorNote errors={actionError} />
      <Card className="overflow-hidden">{body}</Card>
      <SupplierForm
        open={editing !== null}
        workshopId={workshopId}
        supplier={editing?.supplier ?? null}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />
    </div>
  );
}
