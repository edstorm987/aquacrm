"use client";

// PaymentButton — POSTs the current cart to the ecommerce plugin's
// Stripe Checkout endpoint and follows the redirect URL. Editor mode
// is no-op; live mode invokes the bridge's `goToStripeCheckout` and
// surfaces the error if Stripe isn't configured.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { goToStripeCheckout, useCart } from "../ecommerceBridge";

export default function PaymentButtonBlock({ block, editorMode }: BlockRenderProps) {
  const label = (block.props.label as string | undefined) ?? "Pay now";
  const provider = (block.props.provider as string | undefined) ?? "stripe";
  const successUrl = (block.props.successUrl as string | undefined);
  const cancelUrl = (block.props.cancelUrl as string | undefined);

  const cart = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (editorMode) return;
    if (cart.count === 0) {
      setError("Your cart is empty.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await goToStripeCheckout({
        successUrl,
        cancelUrl,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't start checkout. Please try again.");
      }
      // On success the bridge has already navigated.
    } finally {
      setSubmitting(false);
    }
  }

  const colors: Record<string, string> = {
    stripe:   "#635bff",
    paypal:   "#003087",
    applepay: "#000",
  };
  const bg = colors[provider] ?? "var(--brand-accent, #ff6b35)";

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "14px 24px",
    borderRadius: 12,
    border: "none",
    background: bg,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: editorMode || submitting ? "default" : "pointer",
    minWidth: 240,
    opacity: submitting ? 0.6 : 1,
    ...blockStylesToCss(block.styles),
  };

  return (
    <div data-block-type="payment-button" data-provider={provider}>
      <button type="button" onClick={handleClick} disabled={editorMode || submitting} style={style}>
        {provider === "applepay" ? <span aria-hidden="true"></span> : null}
        <span>{submitting ? "Loading…" : label}</span>
      </button>
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>
          {error}
        </p>
      )}
    </div>
  );
}
