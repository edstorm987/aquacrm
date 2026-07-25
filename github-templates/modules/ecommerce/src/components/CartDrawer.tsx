"use client";

// Storefront cart drawer.
// Lifted from `02 felicias aqua portal work/src/components/CartDrawer.tsx`,
// stripped of brand-specific markup. Rendered via T3's editor block by id.

import { useState } from "react";

import { useCart } from "../context/CartContext";

export interface CartDrawerProps {
  // Stripe checkout uses this as the success/cancel URL fallback.
  apiBase: string;
}

export function CartDrawer({ apiBase }: CartDrawerProps) {
  const cart = useCart();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cart.isOpen) return null;

  async function applyCode(): Promise<void> {
    if (!code.trim()) return;
    setError(null);
    const result = await cart.applyDiscount(code);
    if (!result.ok) setError(result.reason);
    else setCode("");
  }

  async function checkout(): Promise<void> {
    if (cart.items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/stripe/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lineItems: cart.items.map(i => ({
            name: i.name,
            description: i.variant,
            amount: i.price,
            currency: "gbp",
            quantity: i.quantity,
          })),
          discountAmount: cart.subtotal - cart.total,
          metadata: {
            cartId: `cart_${Date.now()}`,
            discountCodes: cart.discounts.map(d => d.code).join(","),
          },
        }),
      });
      const data = await res.json() as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      if (typeof window !== "undefined") window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ecom-cart-drawer" role="dialog" aria-label="Cart">
      <header>
        <h2>Cart ({cart.count})</h2>
        <button type="button" onClick={cart.closeCart} aria-label="Close cart">×</button>
      </header>

      {cart.items.length === 0 ? (
        <p className="ecom-empty">Your cart is empty.</p>
      ) : (
        <ul className="ecom-cart-items">
          {cart.items.map(item => (
            <li key={item.id}>
              {item.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" />
              )}
              <div className="ecom-cart-item-meta">
                <p>{item.name}</p>
                {item.variant && <small>{item.variant}</small>}
                <p className="ecom-cart-item-price">£{((item.price * item.quantity) / 100).toFixed(2)}</p>
              </div>
              <div className="ecom-cart-item-qty">
                <button type="button" onClick={() => cart.updateQty(item.id, item.quantity - 1)}>−</button>
                <span>{item.quantity}</span>
                <button type="button" onClick={() => cart.updateQty(item.id, item.quantity + 1)}>+</button>
              </div>
              <button type="button" className="ecom-cart-item-remove" onClick={() => cart.removeItem(item.id)} aria-label="Remove">×</button>
            </li>
          ))}
        </ul>
      )}

      <section className="ecom-cart-discounts">
        <div className="ecom-cart-discount-input">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Discount or gift card code"
            disabled={busy}
          />
          <button type="button" onClick={applyCode} disabled={busy || !code.trim()}>Apply</button>
        </div>
        {cart.discounts.length > 0 && (
          <ul className="ecom-cart-applied">
            {cart.discounts.map(d => (
              <li key={d.code}>
                <span>{d.label}</span>
                <span>−£{(d.amountOff / 100).toFixed(2)}</span>
                <button type="button" onClick={() => cart.removeDiscount(d.code)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>
        <div className="ecom-cart-totals">
          <p><span>Subtotal</span><span>£{(cart.subtotal / 100).toFixed(2)}</span></p>
          {cart.subtotal !== cart.total && (
            <p><span>Discount</span><span>−£{((cart.subtotal - cart.total) / 100).toFixed(2)}</span></p>
          )}
          <p className="ecom-cart-total"><strong>Total</strong><strong>£{(cart.total / 100).toFixed(2)}</strong></p>
        </div>
        {error && <p className="ecom-error" role="alert">{error}</p>}
        <button
          type="button"
          className="ecom-checkout-btn"
          onClick={checkout}
          disabled={busy || cart.items.length === 0}
        >
          {busy ? "Starting…" : "Checkout"}
        </button>
      </footer>
    </aside>
  );
}
