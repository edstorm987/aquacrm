"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { useCart } from "../ecommerceBridge";
import { formatPrice } from "../useProducts";

const SHIPPING_FLAT = 350; // pence
const TAX_RATE = 0.20;

export default function CheckoutSummaryBlock({ block, editorMode }: BlockRenderProps) {
  const showLineItems = block.props.showLineItems !== false;
  const showShipping = block.props.showShipping !== false;
  const showTax = block.props.showTax !== false;

  const cart = useCart();
  const items = cart.items;
  const subtotal = cart.subtotal;

  const previewItems = (editorMode && items.length === 0)
    ? [{ id: "demo1", name: "Sample item 1", price: 12.5, quantity: 1, variant: "" }, { id: "demo2", name: "Sample item 2", price: 25, quantity: 1, variant: "" }]
    : items;

  const previewSubtotal = editorMode && items.length === 0 ? 37.5 : subtotal;
  const shippingCost = showShipping ? SHIPPING_FLAT / 100 : 0;
  const taxCost = showTax ? previewSubtotal * TAX_RATE : 0;
  const total = previewSubtotal + shippingCost + taxCost;

  const style: React.CSSProperties = {
    width: "100%",
    padding: 24,
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="checkout-summary" style={style}>
      <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Order summary</h2>
      {showLineItems && previewItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {previewItems.map(item => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ opacity: 0.85 }}>{item.name}{item.quantity > 1 && ` × ${item.quantity}`}</span>
              <span>{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Subtotal</span>
          <span>{formatPrice(previewSubtotal)}</span>
        </div>
        {showShipping && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ opacity: 0.7 }}>Shipping</span>
            <span>{formatPrice(shippingCost)}</span>
          </div>
        )}
        {showTax && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ opacity: 0.7 }}>Tax (20%)</span>
            <span>{formatPrice(taxCost)}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
    </section>
  );
}
