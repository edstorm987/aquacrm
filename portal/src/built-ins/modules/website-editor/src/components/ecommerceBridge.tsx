"use client";

// Ecommerce bridge — client-side cart + variant resolver + Stripe
// checkout adapter. Round 5 makes this real:
//
//   - `useCart()`  — localStorage-backed cart per (clientId, browser)
//                    with broadcast across blocks via storage events.
//                    Fully replaces the R2 empty-cart stub.
//   - `ProductVariantPicker` — renders a real per-option picker against
//                    a `Product`'s variants, emits a `ResolvedVariant`
//                    on every change.
//   - `goToStripeCheckout()` — POSTs to `/api/portal/ecommerce/stripe/checkout`
//                    and follows the redirect URL. Used by PaymentButton +
//                    DonationButton blocks.
//
// **Q-ASSUMED** (R5): T2's @aqua/plugin-ecommerce server doesn't ship a
// `GET /cart` endpoint — cart state is client-side per 02's pattern.
// Server-side cart persistence (per-end-customer, per-client) is a
// future round; the localStorage shim works for unauthenticated
// guests + authenticated end-customers alike.
//
// **`setCartProvider`** escape hatch is preserved for SSR / a future
// host app that wants to inject a server-rendered cart snapshot.

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CartItem {
  id: string;
  name: string;
  price: number;             // unit price in pence/cents
  quantity: number;
  variant?: string;
  variantId?: string;
  image?: string;
  productHandle?: string;
  productId?: string;
}

export interface CartSnapshot {
  items: CartItem[];
  subtotal: number;
  count: number;
  updateQty(itemId: string, qty: number): void;
  removeItem(itemId: string): void;
  addItem(item: Omit<CartItem, "quantity"> & { quantity?: number }): void;
  clear(): void;
}

export interface ProductVariant {
  id: string;
  optionValues: Record<string, string>;
  price: number;
  salePrice?: number;
  image?: string;
  sku?: string;
  available?: number;
}

export interface Product {
  id: string;
  handle?: string;
  slug?: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number;
  image?: string;
  onSale?: boolean;
  currency?: string;
  stockSku?: string;
  options?: Array<{
    id: string;
    name: string;
    displayType: "swatch" | "color-wheel" | "size" | "text" | "image";
    values: Array<{ id: string; label: string; hexColor?: string; image?: string; available?: boolean }>;
  }>;
  variants?: ProductVariant[];
}

export interface ResolvedVariant {
  product?: Product;
  variant: ProductVariant | null;
  price: number;
  salePrice?: number;
  available?: boolean;
  isCustom?: boolean;
  customHex?: string;
}

export interface VariantPickerState {
  selectedVariantId: string | null;
  options: Record<string, string>;
  customHex?: string;
}

export interface ProductVariantPickerProps {
  product: Product;
  onChange?: (state: VariantPickerState, resolved: ResolvedVariant | null) => void;
  initialVariantId?: string;
}

// ─── Cart store (localStorage-backed) ──────────────────────────────────────

const CART_KEY = "lk_cart_v1";
const CART_EVENT = "lk-cart-change";

let cartProvider: (() => CartSnapshot) | null = null;
export function setCartProvider(fn: () => CartSnapshot): void { cartProvider = fn; }

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_EVENT));
  } catch { /* sealed-off browser */ }
}

function snapshotFrom(items: CartItem[]): CartSnapshot {
  const subtotal = items.reduce((acc, it) => acc + it.price * it.quantity, 0);
  const count = items.reduce((acc, it) => acc + it.quantity, 0);
  return {
    items,
    subtotal,
    count,
    updateQty(itemId, qty) {
      const next = readCart().map(it =>
        it.id === itemId ? { ...it, quantity: Math.max(1, Math.floor(qty)) } : it,
      );
      writeCart(next);
    },
    removeItem(itemId) {
      writeCart(readCart().filter(it => it.id !== itemId));
    },
    addItem(item) {
      const next = readCart();
      const existing = next.find(it =>
        it.productId
          ? it.productId === item.productId && it.variantId === item.variantId
          : it.id === item.id,
      );
      if (existing) {
        existing.quantity += item.quantity ?? 1;
      } else {
        next.push({ ...item, quantity: item.quantity ?? 1 });
      }
      writeCart(next);
    },
    clear() { writeCart([]); },
  };
}

export function useCart(): CartSnapshot {
  const [snapshot, setSnapshot] = useState<CartSnapshot>(() =>
    cartProvider?.() ?? snapshotFrom(readCart()),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cartProvider) {
      setSnapshot(cartProvider());
      return;
    }
    const refresh = () => setSnapshot(snapshotFrom(readCart()));
    refresh();
    window.addEventListener(CART_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CART_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return snapshot;
}

// ─── Real ProductVariantPicker ────────────────────────────────────────────

export default function ProductVariantPicker({
  product,
  onChange,
  initialVariantId,
}: ProductVariantPickerProps) {
  const variants = product.variants ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(
    initialVariantId ?? variants[0]?.id ?? null,
  );

  // Discover the option keys (e.g. "size", "color") from the union of
  // every variant's option map.
  const optionKeys = Array.from(
    variants.reduce<Set<string>>((acc, v) => {
      for (const k of Object.keys(v.optionValues)) acc.add(k);
      return acc;
    }, new Set<string>()),
  );

  const selected = variants.find(v => v.id === selectedId) ?? null;

  function pick(variantId: string) {
    setSelectedId(variantId);
    const v = variants.find(x => x.id === variantId) ?? null;
    onChange?.(
      {
        selectedVariantId: variantId,
        options: v?.optionValues ?? {},
      },
      v
        ? {
            product,
            variant: v,
            price: v.salePrice ?? v.price,
            salePrice: v.salePrice,
            available: v.available === undefined || v.available > 0,
          }
        : null,
    );
  }

  if (variants.length === 0) {
    return (
      <div data-block-type="variant-picker" style={{ fontSize: 12, opacity: 0.7 }}>
        No variants — single SKU.
      </div>
    );
  }

  // Group variants by each option key for swatch-style pickers.
  return (
    <div data-block-type="variant-picker" style={{ display: "grid", gap: 12 }}>
      {optionKeys.length > 0 ? (
        optionKeys.map(optionKey => {
          const values = Array.from(
            variants.reduce<Set<string>>((acc, v) => {
              const value = v.optionValues[optionKey];
              if (value) acc.add(value);
              return acc;
            }, new Set<string>()),
          );
          return (
            <div key={optionKey}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.6, margin: "0 0 6px" }}>
                {optionKey}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {values.map(value => {
                  const target = variants.find(v => v.optionValues[optionKey] === value);
                  const isActive = selected?.optionValues[optionKey] === value;
                  const option = product.options?.find(row => row.id === optionKey);
                  const label = option?.values.find(row => row.id === value)?.label ?? value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => target && pick(target.id)}
                      disabled={!target}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: isActive ? "1px solid var(--brand-accent, #ff6b35)" : "1px solid rgba(255,255,255,0.12)",
                        background: isActive ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.04)",
                        color: "inherit",
                        fontSize: 13,
                        cursor: target ? "pointer" : "not-allowed",
                        opacity: target ? 1 : 0.4,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        // No structured options — fall back to a flat list of variant names.
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {variants.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => pick(v.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: v.id === selectedId ? "1px solid var(--brand-accent, #ff6b35)" : "1px solid rgba(255,255,255,0.12)",
                background: v.id === selectedId ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.04)",
                color: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {Object.entries(v.optionValues).map(([optionId, valueId]) => {
                const option = product.options?.find(row => row.id === optionId);
                return option?.values.find(row => row.id === valueId)?.label ?? valueId;
              }).join(" · ") || v.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stripe checkout adapter ───────────────────────────────────────────────

export interface StripeCheckoutInput {
  // Items the operator wants to charge for. When omitted, the bridge
  // submits the current cart contents (every `useCart()` item).
  lineItems?: Array<{ productId?: string; variantId?: string; quantity?: number }>;
  operationId?: string;
  successUrl?: string;
  cancelUrl?: string;
  // Optional discount/referral metadata (T2 R5 hooks).
  referralCodeId?: string;
  discountCode?: string;
}

export interface StripeCheckoutResult {
  ok: boolean;
  redirectUrl?: string;
  error?: string;
}

export interface CheckoutQuoteRecord {
  currency: string;
  subtotal: number;
  discountAmount: number;
  shipping: { amount: number; rateId?: string };
  taxAmount: number;
  taxAddedAmount: number;
  amountTotal: number;
}

export async function quoteCheckout(
  items: Array<{ productId?: string; variantId?: string; quantity: number }>,
): Promise<{ quote?: CheckoutQuoteRecord; error?: string }> {
  if (typeof window === "undefined") return { error: "SSR" };
  try {
    const response = await fetch("/api/portal/ecommerce/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        version: 1,
        operationId: globalThis.crypto?.randomUUID?.() ?? `quote-${Date.now()}`,
        items,
      }),
    });
    const data = await response.json() as { ok?: boolean; quote?: CheckoutQuoteRecord; error?: string };
    return response.ok && data.quote ? { quote: data.quote } : { error: data.error ?? "Quote unavailable." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function goToStripeCheckout(input: StripeCheckoutInput = {}): Promise<StripeCheckoutResult> {
  if (typeof window === "undefined") return { ok: false, error: "SSR" };
  const lineItems = input.lineItems ?? readCart().map(it => ({
    productId: it.productId,
    variantId: it.variantId,
    quantity: it.quantity,
  }));
  const cartFingerprint = JSON.stringify(lineItems);
  const operationId = input.operationId ?? checkoutOperationId(cartFingerprint);
  try {
    const res = await fetch("/api/portal/ecommerce/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        version: 1,
        operationId,
        items: lineItems,
        successPath: input.successUrl ?? "/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
        cancelPath: input.cancelUrl ?? `${window.location.pathname}${window.location.search}`,
        referralCodeId: input.referralCodeId,
        discountCode: input.discountCode,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? `status ${res.status}` };
    }
    const data = await res.json() as { url?: string; redirectUrl?: string };
    const url = data.url ?? data.redirectUrl;
    if (url) {
      window.location.href = url;
      return { ok: true, redirectUrl: url };
    }
    return { ok: false, error: "No redirect URL returned." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

let activeCheckout: { fingerprint: string; operationId: string } | null = null;

function checkoutOperationId(fingerprint: string): string {
  if (activeCheckout?.fingerprint === fingerprint) return activeCheckout.operationId;
  const operationId = globalThis.crypto?.randomUUID?.() ?? `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeCheckout = { fingerprint, operationId };
  return operationId;
}

// ─── Order lookup (used by OrderSuccessBlock) ─────────────────────────────

export interface OrderRecord {
  id: string;
  status: string;
  amountTotal: number;
  currency: string;
  customerEmail?: string;
  items: Array<{ name: string; quantity: number; unitAmount: number; currency: string }>;
  createdAt: number;
}

export async function fetchOrderBySessionId(sessionId: string, attempts = 8): Promise<OrderRecord | null> {
  if (typeof window === "undefined" || !sessionId) return null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`/api/portal/ecommerce/orders/by-session?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.ok && res.status !== 202) {
        const data = await res.json() as { order?: OrderRecord };
        return data.order ?? null;
      }
      if (res.status !== 202) return null;
    } catch {
      if (attempt === attempts - 1) return null;
    }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  return null;
}

// ─── Variant fetch (used by VariantPickerBlock fallback) ──────────────────

export async function fetchProductVariants(productId: string): Promise<ProductVariant[]> {
  if (typeof window === "undefined" || !productId) return [];
  try {
    const res = await fetch(`/api/portal/ecommerce/products/${encodeURIComponent(productId)}/variants`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json() as { variants?: ProductVariant[] };
    return data.variants ?? [];
  } catch { return []; }
}

// ─── Product search (used by ProductSearchBlock) ──────────────────────────

export async function searchProducts(query: string, limit = 12): Promise<Product[]> {
  if (typeof window === "undefined") return [];
  try {
    const url = new URL("/api/portal/ecommerce/products", window.location.origin);
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json() as { items?: Product[]; products?: Product[] };
    return data.items ?? data.products ?? [];
  } catch { return []; }
}
