import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PARTS } from '@/data/catalog';
import type { Part } from '@/data/catalog';

export interface CartLine {
  part: Part;
  qty: number;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (partId: string, qty?: number) => void;
  setQty: (partId: string, qty: number) => void;
  remove: (partId: string) => void;
  clear: () => void;
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
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
      return typeof saved === 'object' && saved ? saved : {};
    } catch {
      return {};
    }
  });

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
        setItems(e.newValue ? (JSON.parse(e.newValue) as Record<string, number>) : {});
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
  const clear = useCallback(() => setItems({}), []);

  const value = useMemo<CartValue>(() => {
    const lines = Object.entries(items)
      .map(([id, qty]) => ({ part: PARTS.find((p) => p.id === id), qty }))
      .filter((l): l is CartLine => Boolean(l.part) && l.qty > 0);
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.part.price, 0),
      add,
      setQty,
      remove,
      clear,
    };
  }, [items, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
