import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPoFromRepair, formatQty, listRepairPurchaseOrders, subscribePurchaseOrders } from '@/api/purchaseOrders';
import type { PoSummary, PurchaseOrder } from '@/api/purchaseOrders';
import type { RepairItem, RepairOrder } from '@/api/repairOrders';
import { listSuppliers } from '@/api/suppliers';
import type { Supplier } from '@/api/suppliers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote, Labeled } from '../inventory/PartForm';
import { PoStatusBadge, SupplierForm, selectClass } from '../purchasing/common';
import { textLink } from './common';

interface OrderPartsButtonProps {
  repairOrderId: string;
  order: Pick<RepairOrder, 'id' | 'workshop_id' | 'number' | 'status'>;
  items: RepairItem[];
  /** Called with the new draft before the page moves to it. */
  onCreated?: (po: PurchaseOrder) => void;
}

/**
 * "Order parts" on a repair order: choose its part lines and a supplier (or add one), create a draft purchase order
 * and open it. Below the button, the purchase orders already started from this repair.
 */
export function OrderPartsButton({ repairOrderId, order, items, onCreated }: OrderPartsButtonProps) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const allowed = can('inventory', 'full') || can('repair-orders', 'full');
  const canSee = can('inventory', 'view') || can('repair-orders', 'view');
  const [orders, setOrders] = useState<PoSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!canSee) return;
    try {
      setOrders(await listRepairPurchaseOrders(repairOrderId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Purchase orders could not be loaded.');
    }
  }, [repairOrderId, canSee]);

  useEffect(() => {
    void load();
    if (!canSee) return;
    return subscribePurchaseOrders(order.workshop_id, () => void load());
  }, [load, canSee, order.workshop_id]);

  // Lines already on an order that is not cancelled cannot be ordered again (the database refuses too).
  const ordered = useMemo(() => {
    const m = new Map<string, string>();
    for (const po of orders) if (po.status !== 'cancelled') for (const i of po.item_ids) m.set(i, po.number);
    return m;
  }, [orders]);
  const partLines = items.filter((i) => i.kind === 'part');
  const orderable = partLines.filter((i) => i.approval !== 'declined' && !ordered.has(i.id));
  const closed = order.status === 'completed' || order.status === 'cancelled';

  const reason = !allowed
    ? 'You need full access to Parts Inventory or Repair Orders to order parts.'
    : closed
      ? 'This repair order is closed.'
      : partLines.length === 0
        ? 'Add a part line to the repair order first.'
        : orderable.length === 0
          ? 'Every part line is already on a purchase order (or was declined).'
          : null;

  return (
    <div className="space-y-2">
      <Button variant="ghost" disabled={reason !== null} title={reason ?? undefined} onClick={() => setOpen(true)}>
        <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
        Order parts
      </Button>
      {reason && allowed && <p className="text-[11px] text-fg3">{reason}</p>}
      {loadError && <ErrorNote errors={loadError} />}
      {orders.length > 0 && (
        <ul className="space-y-1 text-xs" aria-label="Purchase orders for this repair">
          {orders.map((po) => (
            <li key={po.id} className="flex flex-wrap items-center gap-2">
              <Link to={`/purchasing/${po.id}`} className={textLink}>
                {po.number}
              </Link>
              <PoStatusBadge status={po.status} />
              <span className="text-fg2">
                {po.supplier_name} · {formatCurrency(po.total)}
                {po.outstanding > 0 && po.status !== 'cancelled' && po.status !== 'draft' && <> · {formatQty(po.outstanding)} to come</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <OrderPartsDialog
          order={order}
          lines={orderable}
          onClose={() => setOpen(false)}
          onCreated={(po) => {
            setOpen(false);
            onCreated?.(po);
            navigate(`/purchasing/${po.id}`);
          }}
        />
      )}
    </div>
  );
}

function OrderPartsDialog({
  order,
  lines,
  onClose,
  onCreated,
}: {
  order: OrderPartsButtonProps['order'];
  lines: RepairItem[];
  onClose: () => void;
  onCreated: (po: PurchaseOrder) => void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(lines.map((l) => l.id)));
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSuppliers(order.workshop_id)
      .then((list) => {
        const active = list.filter((s) => s.active);
        setSuppliers(active);
        setSupplierId(active[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Suppliers could not be loaded.'));
  }, [order.workshop_id]);

  function toggle(itemId: string) {
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (chosen.size === 0) {
      setError('Choose at least one part line.');
      return;
    }
    if (!supplierId) {
      setError('Choose a supplier, or add one.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await createPoFromRepair(order.id, supplierId, [...chosen]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The purchase order could not be created.');
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={!adding}
        title={`Order parts for ${order.number}`}
        onClose={onClose}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={`${id}-form`} disabled={busy || chosen.size === 0 || !supplierId}>
              {busy ? 'Creating...' : 'Create draft order'}
            </Button>
          </>
        }
      >
        <form id={`${id}-form`} onSubmit={(e) => void submit(e)} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-fg2">Part lines to order</legend>
            {lines.map((l) => (
              <label key={l.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface2 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={chosen.has(l.id)}
                  onChange={() => toggle(l.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
                />
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-fg">{l.description}</span>
                  <span className="block text-[11px] text-fg2">
                    Qty {formatQty(l.quantity)}
                    {l.approval === 'pending' && ' · waiting for the customer to approve'}
                    {l.part_id ? ' · inventory part' : ''}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {suppliers === null && !error && <p className="text-xs text-fg2">Loading suppliers...</p>}
          {suppliers && suppliers.length === 0 && <p className="text-xs text-fg2">No active suppliers yet. Add the one you order from.</p>}
          {suppliers && suppliers.length > 0 && (
            <Labeled id={`${id}-sup`} label="Supplier">
              <select id={`${id}-sup`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
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
          <p className="text-[11px] text-fg3">
            This creates a draft. Nothing is sent to the supplier until someone with Parts Inventory access emails it or marks it as sent.
          </p>
          <ErrorNote errors={error} />
        </form>
      </Dialog>
      <SupplierForm
        open={adding}
        workshopId={order.workshop_id}
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
