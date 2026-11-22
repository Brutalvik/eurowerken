import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { usePartsByIds } from '@/api/catalogue';
import type { Part } from '@/api/catalogue';

export interface CartLine {
  part: Part;
  qty: number;
}

interface CartValue {
  /** Part id (uuid) to quantity, as stored in this browser. */
  items: Record<string, number>;
  /** Sum of the stored quantities, before checking the parts still exist. */
  storedCount: number;
  add: (partId: string, qty?: number) => void;
  setQty: (partId: string, qty: number) => void;
  remove: (partId: string) => void;
  clear: () => void;
  /** Removes parts that are no longer available and remembers how many, so the cart can tell the customer. */
  drop: (partIds: string[]) => void;
  /** Items removed because they are no longer available (since the notice was last dismissed). */
  removedCount: number;
  dismissRemoved: () => void;
}

const CartContext = createContext<CartValue | null>(null);
const MAX_QTY = 20;

/**
 * Shopping cart for one workshop's site, kept in this browser (per site) until
 * checkout talks to the backend. Stores part ids and quantities only.
 */
export function CartProvider({ siteSlug, children }: { siteSlug: string; children: ReactNode }) {
  const key = `ew-cart:${siteSlug}`;
  const [items, setItems] = useState<Record<string, number>>(() => {
    try {
      return sanitize(JSON.parse(localStorage.getItem(key) ?? '{}'));
    } catch {
      return {};
    }
  });
  // Ids removed as no longer available; a set, so repeated checks do not count twice.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // Storage blocked: the cart still works for this visit.
    }
  }, [key, items]);

  // Another tab changed this site's cart: follow it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        setItems(e.newValue ? sanitize(JSON.parse(e.newValue)) : {});
      } catch {
        // ignore malformed values
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const add = useCallback((partId: string, qty = 1) => {
    setItems((cur) => ({ ...cur, [partId]: Math.min(MAX_QTY, (cur[partId] ?? 0) + qty) }));
  }, []);
  const setQty = useCallback((partId: string, qty: number) => {
    setItems((cur) => {
      const next = { ...cur };
      if (qty <= 0) delete next[partId];
      else next[partId] = Math.min(MAX_QTY, qty);
      return next;
    });
  }, []);
  const remove = useCallback((partId: string) => setQty(partId, 0), [setQty]);
  const clear = useCallback(() => {
    setItems({});
    setRemoved(new Set());
  }, []);
  const drop = useCallback((partIds: string[]) => {
    if (partIds.length === 0) return;
    setRemoved((cur) => (partIds.every((id) => cur.has(id)) ? cur : new Set([...cur, ...partIds])));
    setItems((cur) => {
      if (!partIds.some((id) => id in cur)) return cur;
      const next = { ...cur };
      for (const id of partIds) delete next[id];
      return next;
    });
  }, []);
  const dismissRemoved = useCallback(() => setRemoved(new Set()), []);
  const removedCount = removed.size;

  const value = useMemo<CartValue>(
    () => ({
      items,
      storedCount: Object.values(items).reduce((n, q) => n + q, 0),
      add,
      setQty,
      remove,
      clear,
      drop,
      removedCount,
      dismissRemoved,
    }),
    [items, add, setQty, remove, clear, drop, removedCount, dismissRemoved],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}

/** Keeps only positive whole quantities from a stored value. */
function sanitize(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [id, qty] of Object.entries(value as Record<string, unknown>)) {
    if (typeof qty === 'number' && Number.isFinite(qty) && qty > 0) out[id] = Math.min(MAX_QTY, Math.floor(qty));
  }
  return out;
}

export interface ResolvedCart {
  /** True while the parts in the cart are being looked up. */
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** Lines for parts that are still published, in the order they were added. */
  lines: CartLine[];
  /** Item count for the header: the stored count until the parts are checked. */
  count: number;
  subtotal: number;
}

/**
 * The cart's parts, looked up in the workshop's published catalogue. Parts
 * that no longer exist or are unpublished are dropped from the cart (and
 * counted in removedCount for the notice).
 */
export function useResolvedCart(): ResolvedCart {
  const { items, storedCount, drop } = useCart();
  const ids = useMemo(() => Object.keys(items), [items]);
  const parts = usePartsByIds(ids);

  useEffect(() => {
    if (!parts.data) return;
    const found = new Set(parts.data.map((p) => p.id));
    const gone = ids.filter((id) => !found.has(id));
    if (gone.length > 0) drop(gone);
  }, [parts.data, ids, drop]);

  return useMemo(() => {
    if (!parts.data) {
      return { loading: parts.loading, error: parts.error, retry: parts.retry, lines: [], count: storedCount, subtotal: 0 };
    }
    const byId = new Map(parts.data.map((p) => [p.id, p]));
    const lines = ids
      .map((id) => ({ part: byId.get(id), qty: items[id] ?? 0 }))
      .filter((l): l is CartLine => Boolean(l.part) && l.qty > 0);
    return {
      loading: false,
      error: null,
      retry: parts.retry,
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.part.price, 0),
    };
  }, [parts.data, parts.loading, parts.error, parts.retry, ids, items, storedCount]);
}
