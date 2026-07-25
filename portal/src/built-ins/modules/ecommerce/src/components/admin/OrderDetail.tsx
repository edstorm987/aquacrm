"use client";

import { useState } from "react";

import type { OrderStatus, ServerOrder } from "../../server/orders";
import { formatPrice } from "../../lib/admin/orders";

export interface OrderDetailProps {
  order: ServerOrder;
  apiBase: string;
}

const STATUSES: OrderStatus[] = [
  "pending", "paid", "fulfilled", "shipped", "delivered", "refunded", "cancelled",
];

export function OrderDetail({ order, apiBase }: OrderDetailProps) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/orders/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          status,
          trackingNumber: tracking || undefined,
          trackingCarrier: carrier || undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not update order.");
        return;
      }
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ecom-order-detail">
      <header className="ecom-list-header">
        <div>
          <h1>{order.id}</h1>
          <p>
            <span className={`ecom-status ecom-status-${order.status}`}>{order.status}</span>
            {" · "}
            {formatPrice(order.amountTotal, order.currency)}
            {" · "}
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <a className="ecom-button" href={`./${order.id}/receipt`}>View receipt</a>
      </header>

      <section className="ecom-card">
        <h2>Customer</h2>
        <p>{order.customerName ?? order.customerEmail ?? "—"}</p>
        {order.customerEmail && <p>{order.customerEmail}</p>}
        {order.shippingAddress && (
          <address>
            {order.shippingAddress.line1}<br />
            {order.shippingAddress.line2 && <>{order.shippingAddress.line2}<br /></>}
            {order.shippingAddress.city} {order.shippingAddress.postalCode}<br />
            {order.shippingAddress.country}
          </address>
        )}
      </section>

      <section className="ecom-card">
        <h2>Items</h2>
        <ul>
          {order.items.map((it, i) => (
            <li key={i}>
              {it.quantity} × {it.name} — {formatPrice(it.unitAmount * it.quantity, it.currency)}
            </li>
          ))}
        </ul>
      </section>

      <section className="ecom-card">
        <h2>Status</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} disabled={busy}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="ecom-field">
          <span>Tracking number</span>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} disabled={busy} />
        </label>
        <label className="ecom-field">
          <span>Carrier</span>
          <input value={carrier} onChange={(e) => setCarrier(e.target.value)} disabled={busy} />
        </label>
        {error && <p className="ecom-error" role="alert">{error}</p>}
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </section>
    </section>
  );
}
