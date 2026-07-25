// Admin-side order helpers — derived stats + filters used by the
// `/orders` admin page. Server-side reads from the OrderService.
//
// Lifted from `02 felicias aqua portal work/src/lib/admin/orders.ts`,
// adapted for the new ServerOrder shape (clientId, not orgId).

import type { OrderStatus, ServerOrder } from "../../server/orders";

export interface OrderFilter {
  status?: OrderStatus;
  search?: string;
  startDate?: number;
  endDate?: number;
  // Limit + offset for pagination.
  limit?: number;
  offset?: number;
}

export interface OrdersDashboardStats {
  totalOrders: number;
  totalRevenue: number;          // pence
  pendingOrders: number;
  paidOrders: number;
  shippedOrders: number;
  refundedOrders: number;
  averageOrderValue: number;     // pence
  recentOrders: ServerOrder[];
}

export function filterOrders(orders: ServerOrder[], filter: OrderFilter): ServerOrder[] {
  let out = orders;
  if (filter.status) out = out.filter(o => o.status === filter.status);
  if (filter.startDate) out = out.filter(o => o.createdAt >= filter.startDate!);
  if (filter.endDate) out = out.filter(o => o.createdAt <= filter.endDate!);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    out = out.filter(o => {
      return (
        o.id.toLowerCase().includes(q) ||
        (o.customerEmail ?? "").toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q) ||
        (o.stripeSessionId ?? "").toLowerCase().includes(q)
      );
    });
  }
  if (filter.offset || filter.limit) {
    const start = filter.offset ?? 0;
    const end = filter.limit ? start + filter.limit : undefined;
    out = out.slice(start, end);
  }
  return out;
}

export function dashboardStats(orders: ServerOrder[]): OrdersDashboardStats {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + o.amountTotal, 0);
  const stats = {
    pending: 0, paid: 0, shipped: 0, refunded: 0, fulfilled: 0, delivered: 0, cancelled: 0,
  };
  for (const o of orders) stats[o.status] = (stats[o.status] ?? 0) + 1;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);
  return {
    totalOrders,
    totalRevenue,
    pendingOrders: stats.pending,
    paidOrders: stats.paid,
    shippedOrders: stats.shipped,
    refundedOrders: stats.refunded,
    averageOrderValue,
    recentOrders,
  };
}

export function formatOrderId(o: ServerOrder): string {
  return o.id;
}

export function formatPrice(amount: number, currency: string): string {
  const symbol = currency.toUpperCase() === "GBP" ? "£"
    : currency.toUpperCase() === "USD" ? "$"
      : currency.toUpperCase() === "EUR" ? "€"
        : "";
  return `${symbol}${(amount / 100).toFixed(2)}`;
}
