"use client";

// Cart context — storefront-side, ported from
// `02 felicias aqua portal work/src/context/CartContext.tsx`. Same React
// shape; reservation sync now goes through this plugin's API rather than
// the legacy localStorage admin libs.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CartLineItem } from "../lib/cart";
import {
  addOrIncrementCartItem,
  cartTotals,
  removeCartItem,
  reservationMap,
  updateCartQty,
} from "../lib/cart";
import { syncReservations } from "../lib/admin/inventory";

export type { CartLineItem } from "../lib/cart";

export interface AppliedDiscount {
  code: string;
  type: "gift_card" | "referral" | "promo" | "staff" | "creator";
  label: string;
  amountOff: number;
}

interface CartContextValue {
  items: CartLineItem[];
  count: number;
  subtotal: number;
  total: number;
  discounts: AppliedDiscount[];
  applyDiscount: (code: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  removeDiscount: (code: string) => void;
  addItem: (item: Omit<CartLineItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  children: ReactNode;
  apiBase: string;                       // e.g. "/api/portal/ecommerce"
  storageKey?: string;                   // override per-store; default uses install id
  installId?: string;                    // appended into the storage key for tenant isolation
}

export function CartProvider(props: CartProviderProps) {
  const { children, apiBase, installId } = props;
  const cartKey = props.storageKey ?? `aqua_cart_${installId ?? "default"}_v1`;
  const discountKey = `${cartKey}_discounts`;

  const [items, setItems] = useState<CartLineItem[]>([]);
  const [discounts, setDiscounts] = useState<AppliedDiscount[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Hydrate from localStorage.
  useEffect(() => {
    try {
      const rawItems = localStorage.getItem(cartKey);
      if (rawItems) {
        const parsed = JSON.parse(rawItems) as CartLineItem[];
        if (Array.isArray(parsed)) setItems(parsed);
      }
      const rawDisc = localStorage.getItem(discountKey);
      if (rawDisc) {
        const parsed = JSON.parse(rawDisc) as AppliedDiscount[];
        if (Array.isArray(parsed)) setDiscounts(parsed);
      }
    } catch {
      /* corrupt entries — start with an empty cart */
    }
    setHydrated(true);
  }, [cartKey, discountKey]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(cartKey, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, hydrated, cartKey]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(discountKey, JSON.stringify(discounts)); } catch { /* ignore */ }
  }, [discounts, hydrated, discountKey]);

  // Mirror cart → inventory.reserved on the server.
  useEffect(() => {
    if (!hydrated) return;
    const map = reservationMap(items);
    syncReservations({ apiBase, reservations: map }).catch(() => { /* best-effort */ });
  }, [items, hydrated, apiBase]);

  const totals = useMemo(() => cartTotals(items, discounts), [items, discounts]);

  const addItem = useCallback((item: Omit<CartLineItem, "quantity">) => {
    setItems(prev => addOrIncrementCartItem(prev, item));
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => removeCartItem(prev, id));
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    setItems(prev => updateCartQty(prev, id, qty));
  }, []);

  const applyDiscount = useCallback(
    async (code: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const res = await fetch(`${apiBase}/discounts/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          subtotal: totals.subtotal,
          alreadyApplied: discounts.map(d => d.code),
        }),
      });
      const data = await res.json() as
        | { ok: true; discount: AppliedDiscount }
        | { ok: false; error?: string; reason?: string };
      if (!data.ok) return { ok: false, reason: data.reason ?? data.error ?? "Could not apply code." };
      setDiscounts(prev => [...prev, data.discount]);
      return { ok: true };
    },
    [apiBase, totals.subtotal, discounts],
  );

  const removeDiscount = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase();
    setDiscounts(prev => prev.filter(d => d.code !== normalized));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscounts([]);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(cartKey);
        localStorage.removeItem(discountKey);
      } catch { /* ignore */ }
    }
  }, [cartKey, discountKey]);

  return (
    <CartContext.Provider
      value={{
        items,
        count: totals.count,
        subtotal: totals.subtotal,
        total: totals.total,
        discounts,
        applyDiscount,
        removeDiscount,
        addItem,
        removeItem,
        updateQty,
        clearCart,
        isOpen,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
