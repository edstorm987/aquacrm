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
  pendingOrders: number;
  paidOrders: number;
  shippedOrders: number;
  refundedOrders: number;
  cancelledOrders: number;
  byCurrency: OrderCurrencyAccounting[];
  recentOrders: ServerOrder[];
}

export interface OrderCurrencyAccounting {
  currency: string;
  settledOrders: number;
  grossPaid: number;
  refunded: number;
  netRevenue: number;
  cancelledFaceValue: number;
  pendingFaceValue: number;
  averageNetOrderValue: number;
}

export interface OrderSettlementAmounts {
  currency: string;
  settled: boolean;
  grossPaid: number;
  refunded: number;
  netRevenue: number;
  cancelledFaceValue: number;
  pendingFaceValue: number;
}

const SETTLED_STATUSES = new Set<OrderStatus>([
  "paid", "fulfilled", "shipped", "delivered", "refunded",
]);

export function settlementAmounts(order: ServerOrder): OrderSettlementAmounts {
  const currency = order.currency.trim().toLowerCase() || "unknown";
  const amount = Math.max(0, Math.round(order.amountTotal));
  if (order.status === "cancelled") {
    return {
      currency,
      settled: false,
      grossPaid: 0,
      refunded: 0,
      netRevenue: 0,
      cancelledFaceValue: amount,
      pendingFaceValue: 0,
    };
  }
  if (!SETTLED_STATUSES.has(order.status)) {
    return {
      currency,
      settled: false,
      grossPaid: 0,
      refunded: 0,
      netRevenue: 0,
      cancelledFaceValue: 0,
      pendingFaceValue: amount,
    };
  }
  const recordedRefund = order.refundedAmountCents
    ?? (order.status === "refunded" ? amount : 0);
  const refunded = Math.min(amount, Math.max(0, Math.round(recordedRefund)));
  return {
    currency,
    settled: true,
    grossPaid: amount,
    refunded,
    netRevenue: amount - refunded,
    cancelledFaceValue: 0,
    pendingFaceValue: 0,
  };
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
  const stats = {
    pending: 0, paid: 0, shipped: 0, refunded: 0, fulfilled: 0, delivered: 0, cancelled: 0,
  };
  const currencies = new Map<string, OrderCurrencyAccounting>();
  for (const order of orders) {
    stats[order.status] = (stats[order.status] ?? 0) + 1;
    const amounts = settlementAmounts(order);
    const row = currencies.get(amounts.currency) ?? {
      currency: amounts.currency,
      settledOrders: 0,
      grossPaid: 0,
      refunded: 0,
      netRevenue: 0,
      cancelledFaceValue: 0,
      pendingFaceValue: 0,
      averageNetOrderValue: 0,
    };
    if (amounts.settled) row.settledOrders += 1;
    row.grossPaid += amounts.grossPaid;
    row.refunded += amounts.refunded;
    row.netRevenue += amounts.netRevenue;
    row.cancelledFaceValue += amounts.cancelledFaceValue;
    row.pendingFaceValue += amounts.pendingFaceValue;
    currencies.set(amounts.currency, row);
  }
  const byCurrency = [...currencies.values()]
    .map(row => ({
      ...row,
      averageNetOrderValue: row.settledOrders > 0
        ? Math.round(row.netRevenue / row.settledOrders)
        : 0,
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);
  return {
    totalOrders,
    pendingOrders: stats.pending,
    paidOrders: stats.paid,
    shippedOrders: stats.shipped,
    refundedOrders: stats.refunded,
    cancelledOrders: stats.cancelled,
    byCurrency,
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

export function formatCurrencyAmount(amount: number, currency: string): string {
  return `${currency.toUpperCase()} ${formatPrice(amount, currency)}`;
}
