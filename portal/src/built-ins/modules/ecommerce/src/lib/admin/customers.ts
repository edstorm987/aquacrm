// Admin-side customer aggregation.
//
// Lifted from `02 felicias aqua portal work/src/lib/admin/customers.ts`.
// Synthesises a customer record by aggregating orders for each unique
// `customerEmail`. No separate Customer table — orders are the source.

import type { ServerOrder } from "../../server/orders";
import { settlementAmounts } from "./orders";

export interface CustomerCurrencySpend {
  currency: string;
  grossPaid: number;
  refunded: number;
  netSpent: number;
}

export interface CustomerSummary {
  email: string;
  name?: string;
  totalOrders: number;
  settledOrders: number;
  spendByCurrency: CustomerCurrencySpend[];
  lastOrderAt?: number;
  firstOrderAt?: number;
  shippingCity?: string;
  shippingCountry?: string;
}

export function summariseCustomers(orders: ServerOrder[]): CustomerSummary[] {
  const byEmail = new Map<string, CustomerSummary>();
  const spendByEmail = new Map<string, Map<string, CustomerCurrencySpend>>();
  for (const o of orders) {
    if (!o.customerEmail) continue;
    const key = o.customerEmail.toLowerCase();
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, {
        email: o.customerEmail,
        name: o.customerName,
        totalOrders: 1,
        settledOrders: 0,
        spendByCurrency: [],
        firstOrderAt: o.createdAt,
        lastOrderAt: o.createdAt,
        shippingCity: o.shippingAddress?.city,
        shippingCountry: o.shippingAddress?.country,
      });
    } else {
      existing.totalOrders += 1;
      existing.lastOrderAt = Math.max(existing.lastOrderAt ?? 0, o.createdAt);
      existing.firstOrderAt = Math.min(existing.firstOrderAt ?? o.createdAt, o.createdAt);
      if (o.shippingAddress?.city && !existing.shippingCity) existing.shippingCity = o.shippingAddress.city;
      if (o.shippingAddress?.country && !existing.shippingCountry) existing.shippingCountry = o.shippingAddress.country;
    }
    const summary = byEmail.get(key)!;
    const amounts = settlementAmounts(o);
    if (amounts.settled) summary.settledOrders += 1;
    if (amounts.grossPaid > 0 || amounts.refunded > 0) {
      const currencies = spendByEmail.get(key) ?? new Map<string, CustomerCurrencySpend>();
      const spend = currencies.get(amounts.currency) ?? {
        currency: amounts.currency,
        grossPaid: 0,
        refunded: 0,
        netSpent: 0,
      };
      spend.grossPaid += amounts.grossPaid;
      spend.refunded += amounts.refunded;
      spend.netSpent += amounts.netRevenue;
      currencies.set(amounts.currency, spend);
      spendByEmail.set(key, currencies);
    }
  }
  for (const [email, summary] of byEmail) {
    summary.spendByCurrency = [...(spendByEmail.get(email)?.values() ?? [])]
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }
  return Array.from(byEmail.values()).sort((a, b) => (b.lastOrderAt ?? 0) - (a.lastOrderAt ?? 0));
}

export function customerOrders(orders: ServerOrder[], email: string): ServerOrder[] {
  const key = email.toLowerCase();
  return orders
    .filter(o => o.customerEmail?.toLowerCase() === key)
    .sort((a, b) => b.createdAt - a.createdAt);
}
