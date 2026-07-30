"use client";

import { Download, FileJson, FilePenLine, Printer, Save, X } from "lucide-react";
import { useState } from "react";

import { formatPrice } from "../../lib/admin/orders";
import type { OrderStatus, ServerOrder } from "../../server/orders";

export interface OrderDetailProps {
  order: ServerOrder;
  apiBase: string;
}

const STATUSES: OrderStatus[] = [
  "pending", "paid", "fulfilled", "shipped", "delivered", "refunded", "cancelled",
];
const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/35";

export function OrderDetail({ order, apiBase }: OrderDetailProps) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [customerName, setCustomerName] = useState(order.customerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail ?? "");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? "");
  const [line1, setLine1] = useState(order.shippingAddress?.line1 ?? "");
  const [line2, setLine2] = useState(order.shippingAddress?.line2 ?? "");
  const [city, setCity] = useState(order.shippingAddress?.city ?? "");
  const [state, setState] = useState(order.shippingAddress?.state ?? "");
  const [postalCode, setPostalCode] = useState(order.shippingAddress?.postalCode ?? "");
  const [country, setCountry] = useState(order.shippingAddress?.country ?? "");
  const [internalNotes, setInternalNotes] = useState(order.internalNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadUrl = `${apiBase}/orders/download?id=${encodeURIComponent(order.id)}`;

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/orders`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          patch: {
            status,
            customerName,
            customerEmail,
            trackingNumber: tracking,
            trackingCarrier: carrier,
            internalNotes,
            shippingAddress: { line1, line2, city, state, postalCode, country },
          },
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update order.");
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Order</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-black/90">{order.id}</h1>
            <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/60">{order.status}</span>
          </div>
          <p className="mt-1 text-sm text-black/50">{formatPrice(order.amountTotal, order.currency)} · {new Date(order.createdAt).toLocaleString("en-GB")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={downloadUrl} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]"><Download size={16} /> Download</a>
          <a href={`${downloadUrl}&format=json`} className="inline-flex size-10 items-center justify-center rounded-md border border-black/15 bg-white text-black/60 hover:bg-black/[0.03]" aria-label="Download order data" title="Download order data"><FileJson size={17} /></a>
          <a href={`${downloadUrl}&print=1`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]"><Printer size={16} /> Print / save PDF</a>
          <button type="button" onClick={() => setEditing(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">{editing ? <X size={16} /> : <FilePenLine size={16} />} {editing ? "Cancel" : "Edit order"}</button>
        </div>
      </header>

      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {editing ? (
        <div className="border-y border-black/10 bg-black/[0.015] p-5 sm:p-6">
          <div>
            <h2 className="font-semibold text-black/85">Edit order</h2>
            <p className="mt-1 text-sm text-black/45">Update customer, delivery and fulfilment details. Transaction items and totals stay tied to the original payment.</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-black/55">Customer name<input className={control} value={customerName} onChange={event => setCustomerName(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Customer email<input className={control} type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Status<select className={control} value={status} onChange={event => setStatus(event.target.value as OrderStatus)}>{STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-medium text-black/55 sm:col-span-2">Address<input className={control} value={line1} onChange={event => setLine1(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Address line 2<input className={control} value={line2} onChange={event => setLine2(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">City<input className={control} value={city} onChange={event => setCity(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">County / state<input className={control} value={state} onChange={event => setState(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Postcode<input className={control} value={postalCode} onChange={event => setPostalCode(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Country<input className={control} value={country} onChange={event => setCountry(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Carrier<input className={control} value={carrier} onChange={event => setCarrier(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55">Tracking number<input className={control} value={tracking} onChange={event => setTracking(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/55 sm:col-span-2 lg:col-span-3">Internal notes<textarea rows={3} className={`${control} py-2`} value={internalNotes} onChange={event => setInternalNotes(event.target.value)} /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} /> {busy ? "Saving..." : "Save changes"}</button></div>
        </div>
      ) : null}

      <div className="grid gap-8 border-y border-black/10 py-6 md:grid-cols-2">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Customer</h2>
          <p className="mt-3 font-semibold text-black/85">{order.customerName ?? "Customer name not supplied"}</p>
          <p className="mt-1 text-sm text-black/55">{order.customerEmail ?? "Email not supplied"}</p>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Delivery</h2>
          {order.shippingAddress ? <address className="mt-3 not-italic text-sm leading-6 text-black/60">{[order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode, order.shippingAddress.country].filter(Boolean).map((part, index) => <span key={`${part}-${index}`} className="block">{part}</span>)}</address> : <p className="mt-3 text-sm text-black/45">No delivery address.</p>}
          {(order.trackingCarrier || order.trackingNumber) ? <p className="mt-3 text-sm text-black/60">{order.trackingCarrier} {order.trackingNumber}</p> : null}
        </section>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Items</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="py-2 text-right">Total</th></tr></thead>
            <tbody>{order.items.map((item, index) => <tr key={`${item.name}-${index}`} className="border-b border-black/[0.07]"><td className="py-4 pr-3 font-medium text-black/80">{item.name}{item.sku ? <span className="ml-2 text-xs font-normal text-black/35">{item.sku}</span> : null}</td><td className="py-4 text-right text-black/55">{item.quantity}</td><td className="py-4 text-right font-mono text-black/55">{formatPrice(item.unitAmount, item.currency)}</td><td className="py-4 text-right font-mono font-semibold">{formatPrice(item.unitAmount * item.quantity, item.currency)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="ml-auto mt-5 flex max-w-xs justify-between border-b-2 border-black py-3 text-base font-semibold"><span>Total</span><span>{formatPrice(order.amountTotal, order.currency)}</span></p>
      </section>

      {order.internalNotes ? <section className="border-t border-black/10 pt-5"><h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Internal notes</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{order.internalNotes}</p></section> : null}
    </section>
  );
}

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
