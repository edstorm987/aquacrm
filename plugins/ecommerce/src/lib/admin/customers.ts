// Admin-side customer aggregation.
//
// Lifted from `02 felicias aqua portal work/src/lib/admin/customers.ts`.
// Synthesises a customer record by aggregating orders for each unique
// `customerEmail`. No separate Customer table — orders are the source.

import type { ServerOrder } from "../../server/orders";

export interface CustomerSummary {
  email: string;
  name?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt?: number;
  firstOrderAt?: number;
  shippingCity?: string;
  shippingCountry?: string;
}

export function summariseCustomers(orders: ServerOrder[]): CustomerSummary[] {
  const byEmail = new Map<string, CustomerSummary>();
  for (const o of orders) {
    if (!o.customerEmail) continue;
    const key = o.customerEmail.toLowerCase();
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, {
        email: o.customerEmail,
        name: o.customerName,
        totalOrders: 1,
        totalSpent: o.amountTotal,
        firstOrderAt: o.createdAt,
        lastOrderAt: o.createdAt,
        shippingCity: o.shippingAddress?.city,
        shippingCountry: o.shippingAddress?.country,
      });
    } else {
      existing.totalOrders += 1;
      existing.totalSpent += o.amountTotal;
      existing.lastOrderAt = Math.max(existing.lastOrderAt ?? 0, o.createdAt);
      existing.firstOrderAt = Math.min(existing.firstOrderAt ?? o.createdAt, o.createdAt);
      if (o.shippingAddress?.city && !existing.shippingCity) existing.shippingCity = o.shippingAddress.city;
      if (o.shippingAddress?.country && !existing.shippingCountry) existing.shippingCountry = o.shippingAddress.country;
    }
  }
  return Array.from(byEmail.values()).sort((a, b) => (b.lastOrderAt ?? 0) - (a.lastOrderAt ?? 0));
}

export function customerOrders(orders: ServerOrder[], email: string): ServerOrder[] {
  const key = email.toLowerCase();
  return orders
    .filter(o => o.customerEmail?.toLowerCase() === key)
    .sort((a, b) => b.createdAt - a.createdAt);
}
