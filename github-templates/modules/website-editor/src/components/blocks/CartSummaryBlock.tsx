"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { useCart } from "../ecommerceBridge";
import { formatPrice } from "../useProducts";

export default function CartSummaryBlock({ block, editorMode }: BlockRenderProps) {
  const showThumbnails = block.props.showThumbnails !== false;
  const showQty = block.props.showQuantitySelector !== false;

  // CartContext is global — same hook the storefront's mini-cart uses.
  // We wrap it in a try/catch via a lightweight bridge: useCart throws if
  // there's no provider, which would break editor preview rendering.
  // The provider IS mounted in /admin layout via root layout, so this is
  // safe in both contexts.
  const cart = useCart();
  const items = cart.items;
  const subtotal = cart.subtotal;

  const style: React.CSSProperties = {
    width: "100%",
    padding: 24,
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    ...blockStylesToCss(block.styles),
  };

  // Editor preview: show a fake line item if cart is empty so the block
  // is visible on a fresh canvas.
  const previewItems = (editorMode && items.length === 0)
    ? [{ id: "demo", name: "Sample item", price: 25, quantity: 1, variant: "" }]
    : items;

  return (
    <section data-block-type="cart-summary" style={style}>
      <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Cart</h2>
      {previewItems.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6, padding: "16px 0" }}>Your cart is empty.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {previewItems.map(item => (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: showThumbnails ? "64px 1fr auto" : "1fr auto", gap: 12, alignItems: "center", padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
              {showThumbnails && <div style={{ width: 64, height: 64, borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />}
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>{item.name}</p>
                {item.variant && <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 4px" }}>{item.variant}</p>}
                {showQty && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,0.3)", fontSize: 11 }}>
                    <button
                      onClick={() => !editorMode && cart.updateQty(item.id, Math.max(1, item.quantity - 1))}
                      style={{ all: "unset", cursor: "pointer", padding: "2px 6px" }}
                      disabled={editorMode}
                    >−</button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => !editorMode && cart.updateQty(item.id, item.quantity + 1)}
                      style={{ all: "unset", cursor: "pointer", padding: "2px 6px" }}
                      disabled={editorMode}
                    >+</button>
                    <button
                      onClick={() => !editorMode && cart.removeItem(item.id)}
                      style={{ all: "unset", cursor: "pointer", padding: "2px 6px", marginLeft: 4, opacity: 0.6 }}
                      disabled={editorMode}
                      aria-label="Remove"
                    >×</button>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{formatPrice(item.price * item.quantity)}</p>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Subtotal</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{formatPrice(editorMode && previewItems[0]?.id === "demo" ? 25 : subtotal)}</span>
      </div>
      {!editorMode && previewItems.length > 0 && (
        <a href="/checkout" style={{ marginTop: 16, display: "block", textAlign: "center", padding: "12px 20px", borderRadius: 12, background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          Checkout →
        </a>
      )}
    </section>
  );
}
