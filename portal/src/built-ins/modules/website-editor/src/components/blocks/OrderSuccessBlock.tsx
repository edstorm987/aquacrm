"use client";

// OrderSuccessBlock — thank-you page. R5 wires in a real fetch via
// `?session_id=` (Stripe's CHECKOUT_SESSION_ID redirect) → looks up
// the order via /api/portal/ecommerce/orders/by-session/:id and shows
// line items + total + customer email.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { fetchOrderBySessionId, type OrderRecord } from "../ecommerceBridge";

export default function OrderSuccessBlock({ block, editorMode }: BlockRenderProps) {
  const headline = (block.props.headline as string | undefined) ?? "Thanks for your order!";
  const subhead = (block.props.subhead as string | undefined) ?? "";
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "";
  const ctaHref = (block.props.ctaHref as string | undefined) ?? "/shop";

  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editorMode || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    void fetchOrderBySessionId(sessionId)
      .then(o => {
        if (cancelled) return;
        if (!o) setError("Order not found yet — webhooks may still be processing.");
        else setOrder(o);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode]);

  const style: React.CSSProperties = {
    width: "100%",
    padding: "64px 24px",
    textAlign: "center",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="order-success" style={style}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.15)",
          color: "#22c55e",
          fontSize: 32,
          marginBottom: 16,
        }}
        aria-hidden="true"
      >
        ✓
      </div>
      <h1
        style={{
          fontFamily: "var(--font-playfair, Georgia, serif)",
          fontSize: "clamp(2rem, 4vw, 3rem)",
          fontWeight: 700,
          lineHeight: 1.1,
          margin: "0 0 12px",
        }}
      >
        {headline}
      </h1>
      {subhead && <p style={{ maxWidth: 480, margin: "0 auto 16px", opacity: 0.8, lineHeight: 1.5 }}>{subhead}</p>}

      {loading && <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>Loading order…</p>}
      {error && <p style={{ fontSize: 13, color: "#fca5a5", marginBottom: 16 }}>{error}</p>}

      {order && (
        <div
          style={{
            display: "inline-block",
            margin: "0 auto 32px",
            textAlign: "left",
            padding: 24,
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            minWidth: 320,
            maxWidth: 480,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.18em" }}>
            Order #{order.id.slice(-8)}
          </p>
          {order.customerEmail && (
            <p style={{ margin: "0 0 12px", fontSize: 13 }}>
              Receipt sent to <strong>{order.customerEmail}</strong>
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", fontSize: 13 }}>
            {order.items.map((it, i) => (
              <li
                key={i}
                style={{
                  padding: "6px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>
                  {it.name} <span style={{ opacity: 0.5 }}>× {it.quantity}</span>
                </span>
                <span>
                  {new Intl.NumberFormat("en-GB", { style: "currency", currency: order.currency }).format(
                    (it.price * it.quantity) / 100,
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
            <span>Total</span>
            <span>
              {new Intl.NumberFormat("en-GB", { style: "currency", currency: order.currency }).format(
                order.amountTotal / 100,
              )}
            </span>
          </p>
        </div>
      )}

      {ctaLabel && (
        <div>
          <a
            href={ctaHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              borderRadius: 12,
              background: "var(--brand-accent, #ff6b35)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {ctaLabel}
            <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
    </section>
  );
}
