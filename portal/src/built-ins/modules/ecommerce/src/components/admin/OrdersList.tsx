"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import type { ServerOrder } from "../../server/orders";
import {
  dashboardStats,
  filterOrders,
  formatCurrencyAmount,
  formatPrice,
} from "../../lib/admin/orders";
import { formatUkDate, isoDateTimeValue } from "../../lib/safeDate";

export interface OrdersListProps {
  orders: ServerOrder[];
  apiBase: string;
}

export function OrdersList({ orders }: OrdersListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const stats = useMemo(() => dashboardStats(orders), [orders]);
  const filtered = useMemo(() => {
    return filterOrders(orders, {
      search: query || undefined,
      status: (statusFilter || undefined) as ServerOrder["status"] | undefined,
    });
  }, [orders, query, statusFilter]);

  function downloadCsv() {
    const cells = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Order", "Customer", "Email", "Status", "Total", "Currency", "Created", "Tracking"],
      ...filtered.map(order => [
        order.id,
        order.customerName ?? "",
        order.customerEmail ?? "",
        order.status,
        (order.amountTotal / 100).toFixed(2),
        order.currency.toUpperCase(),
        isoDateTimeValue(order.createdAt) ?? "Date needs review",
        [order.trackingCarrier, order.trackingNumber].filter(Boolean).join(" "),
      ]),
    ];
    const blob = new Blob([rows.map(row => row.map(cells).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Commerce</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Orders</h1>
          <p className="mt-1 text-sm text-black/55">
            {stats.totalOrders} total · {stats.pendingOrders} pending · {stats.refundedOrders} refunded · {stats.cancelledOrders} cancelled
          </p>
        </div>
        <button type="button" onClick={downloadCsv} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]"><Download size={16} /> Download CSV</button>
      </header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Revenue by currency">
        {stats.byCurrency.map(row => (
          <article key={row.currency} className="rounded-lg border border-black/10 bg-white p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">{row.currency.toUpperCase()}</p>
            <p className="mt-2 font-semibold text-black/85">Net revenue {formatCurrencyAmount(row.netRevenue, row.currency)}</p>
            <p className="mt-1 text-black/55">
              Gross {formatCurrencyAmount(row.grossPaid, row.currency)} · refunds {formatCurrencyAmount(row.refunded, row.currency)}
            </p>
            <p className="mt-1 text-black/45">
              {row.settledOrders} settled · net avg {formatCurrencyAmount(row.averageNetOrderValue, row.currency)} · cancelled face value {formatCurrencyAmount(row.cancelledFaceValue, row.currency)}
            </p>
          </article>
        ))}
        {stats.byCurrency.length === 0 ? (
          <p className="text-sm text-black/45">No order money to report.</p>
        ) : null}
      </div>
        <div className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
          <input
            className="min-h-10 min-w-56 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm"
            type="search"
            placeholder="Search orders, emails, sessions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search orders"
          />
          <select className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45">
            <th className="py-2">Order</th>
            <th className="py-2">Customer</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Total</th>
            <th className="py-2 text-right">Created</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(o => (
            <tr key={o.id} className="border-b border-black/[0.07]">
              <td className="py-3 font-medium"><a className="underline decoration-black/20 underline-offset-2 hover:decoration-black" href={`./orders/${o.id}`}>{o.id}</a></td>
              <td className="py-3 text-black/60">{o.customerName ?? o.customerEmail ?? "—"}</td>
              <td className="py-3"><span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/60">{o.status}</span></td>
              <td className="py-3 text-right font-mono font-semibold">{formatPrice(o.amountTotal, o.currency)}</td>
              <td className="py-3 text-right text-black/50">{formatUkDate(o.createdAt, { dateStyle: "medium", timeStyle: "short" })}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="py-12 text-center text-black/45">No orders match.</td></tr>
          )}
        </tbody>
      </table></div>
    </section>
  );
}
