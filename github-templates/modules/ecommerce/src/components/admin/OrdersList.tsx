"use client";

import { useMemo, useState } from "react";

import type { ServerOrder } from "../../server/orders";
import { dashboardStats, filterOrders, formatPrice } from "../../lib/admin/orders";

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

  return (
    <section className="ecom-orders">
      <header className="ecom-list-header">
        <div>
          <h1>Orders</h1>
          <p>{stats.totalOrders} total · revenue {formatPrice(stats.totalRevenue, "gbp")} · avg {formatPrice(stats.averageOrderValue, "gbp")}</p>
        </div>
        <div className="ecom-list-actions">
          <input
            type="search"
            placeholder="Search orders, emails, sessions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search orders"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
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
      </header>

      <table className="ecom-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(o => (
            <tr key={o.id}>
              <td><a href={`./orders/${o.id}`}>{o.id}</a></td>
              <td>{o.customerName ?? o.customerEmail ?? "—"}</td>
              <td><span className={`ecom-status ecom-status-${o.status}`}>{o.status}</span></td>
              <td>{formatPrice(o.amountTotal, o.currency)}</td>
              <td>{new Date(o.createdAt).toLocaleString()}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="ecom-empty">No orders match.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
