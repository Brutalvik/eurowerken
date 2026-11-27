import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatQty, getOnOrder, subscribePurchaseOrders } from '@/api/purchaseOrders';
import type { OnOrder } from '@/api/purchaseOrders';

/**
 * Units on order per part (sent and partly received purchase orders, migration 031). Empty when purchasing is not
 * set up yet or the role cannot see it, so Inventory keeps working either way. Follows purchase order changes live.
 */
export function useOnOrder(workshopId: string | null, enabled: boolean): Map<string, OnOrder> {
  const [map, setMap] = useState<Map<string, OnOrder>>(new Map());
  useEffect(() => {
    if (!workshopId || !enabled) return;
    let active = true;
    const load = () =>
      getOnOrder()
        .then((m) => active && setMap(m))
        .catch(() => undefined);
    void load();
    const off = subscribePurchaseOrders(workshopId, () => void load());
    return () => {
      active = false;
      off();
    };
  }, [workshopId, enabled]);
  return map;
}

/** "+3 on order" under the stock figure, linking to the open orders for that part. */
export function OnOrderLink({ partId, onOrder }: { partId: string; onOrder: OnOrder | undefined }) {
  if (!onOrder || onOrder.on_order <= 0) return null;
  return (
    <Link
      to={`/purchasing?status=open&part=${encodeURIComponent(partId)}`}
      className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
      title={`${onOrder.open_orders} open purchase ${onOrder.open_orders === 1 ? 'order' : 'orders'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Truck className="h-3 w-3" aria-hidden />+{formatQty(onOrder.on_order)} on order
    </Link>
  );
}

/** The page-level link to receiving: open purchase orders. */
export function OpenOrdersLink({ count }: { count: number }) {
  return (
    <Link to="/purchasing?status=open" className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
      <Truck className="h-3.5 w-3.5" aria-hidden />
      {count > 0 ? `Receive parts on order (${count} ${count === 1 ? 'part' : 'parts'})` : 'Purchase orders'}
    </Link>
  );
}
