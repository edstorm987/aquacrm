"use client";

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { quoteCheckout, useCart, type CheckoutQuoteRecord } from "../ecommerceBridge";
import { formatPrice } from "../useProducts";

export default function CheckoutSummaryBlock({ block, editorMode }: BlockRenderProps) {
  const showLineItems = block.props.showLineItems !== false;
  const showShipping = block.props.showShipping !== false;
  const showTax = block.props.showTax !== false;

  const cart = useCart();
  const items = cart.items;
  const subtotal = cart.subtotal;
  const [quote, setQuote] = useState<CheckoutQuoteRecord | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    if (editorMode || items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    void quoteCheckout(items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
    }))).then(result => {
      if (cancelled) return;
      setQuote(result.quote ?? null);
      setQuoteError(result.error ?? null);
    });
    return () => { cancelled = true; };
  }, [editorMode, items]);

  const previewItems = (editorMode && items.length === 0)
    ? [{ id: "demo1", name: "Sample item 1", price: 1250, quantity: 1, variant: "" }, { id: "demo2", name: "Sample item 2", price: 2500, quantity: 1, variant: "" }]
    : items;

  const previewSubtotal = editorMode && items.length === 0 ? 3750 : subtotal;
  const currency = quote?.currency ?? "gbp";

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
          <span>{formatPrice(quote?.subtotal ?? previewSubtotal, currency)}</span>
        </div>
        {showShipping && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ opacity: 0.7 }}>Shipping</span>
            <span>{quote ? formatPrice(quote.shipping.amount, currency) : "Calculated at secure checkout"}</span>
          </div>
        )}
        {showTax && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ opacity: 0.7 }}>Tax</span>
            <span>{quote ? formatPrice(quote.taxAmount, currency) : "Calculated at secure checkout"}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16 }}>
        <span>Total</span>
        <span>{quote ? formatPrice(quote.amountTotal, currency) : `${formatPrice(previewSubtotal)} + delivery/tax`}</span>
      </div>
      {quoteError && <p role="status" style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>{quoteError} Final pricing will be checked before payment.</p>}
    </section>
  );
}
