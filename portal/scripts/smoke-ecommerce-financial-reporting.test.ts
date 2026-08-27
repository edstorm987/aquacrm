import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { summariseCustomers } from "../src/built-ins/modules/ecommerce/src/lib/admin/customers";
import { dashboardStats } from "../src/built-ins/modules/ecommerce/src/lib/admin/orders";
import type { ServerOrder } from "../src/built-ins/modules/ecommerce/src/server/orders";

function order(
  id: string,
  status: ServerOrder["status"],
  amountTotal: number,
  currency: string,
  customerEmail: string,
  refundedAmountCents?: number,
): ServerOrder {
  return {
    id,
    clientId: "client_ecommerce_reporting",
    status,
    amountTotal,
    currency,
    customerEmail,
    items: [],
    createdAt: Number(id.replace(/\D/g, "")) || 1,
    refundedAmountCents,
  };
}

test("dashboard accounting partitions currency and excludes pending/cancelled face value from revenue", () => {
  const orders = [
    order("order_1", "paid", 1_000, "GBP", "alice@example.test"),
    order("order_2", "refunded", 500, "gbp", "alice@example.test", 500),
    order("order_3", "cancelled", 2_000, "USD", "bob@example.test"),
    order("order_4", "pending", 3_000, "usd", "bob@example.test"),
    order("order_5", "paid", 1_000, "EUR", "alice@example.test", 250),
  ];
  const stats = dashboardStats(orders);
  assert.equal(stats.totalOrders, 5);
  assert.equal(stats.pendingOrders, 1);
  assert.equal(stats.refundedOrders, 1);
  assert.equal(stats.cancelledOrders, 1);
  assert.deepEqual(stats.byCurrency, [
    {
      currency: "eur",
      settledOrders: 1,
      grossPaid: 1_000,
      refunded: 250,
      netRevenue: 750,
      cancelledFaceValue: 0,
      pendingFaceValue: 0,
      averageNetOrderValue: 750,
    },
    {
      currency: "gbp",
      settledOrders: 2,
      grossPaid: 1_500,
      refunded: 500,
      netRevenue: 1_000,
      cancelledFaceValue: 0,
      pendingFaceValue: 0,
      averageNetOrderValue: 500,
    },
    {
      currency: "usd",
      settledOrders: 0,
      grossPaid: 0,
      refunded: 0,
      netRevenue: 0,
      cancelledFaceValue: 2_000,
      pendingFaceValue: 3_000,
      averageNetOrderValue: 0,
    },
  ]);
});

test("customer spend is net settled money per currency", () => {
  const customers = summariseCustomers([
    order("order_1", "paid", 1_000, "GBP", "alice@example.test"),
    order("order_2", "refunded", 500, "gbp", "ALICE@example.test", 500),
    order("order_3", "paid", 1_000, "EUR", "alice@example.test", 250),
    order("order_4", "cancelled", 2_000, "USD", "bob@example.test"),
    order("order_5", "pending", 3_000, "USD", "bob@example.test"),
  ]);
  const alice = customers.find(customer => customer.email.toLowerCase() === "alice@example.test");
  const bob = customers.find(customer => customer.email.toLowerCase() === "bob@example.test");
  assert.equal(alice?.totalOrders, 3);
  assert.equal(alice?.settledOrders, 3);
  assert.deepEqual(alice?.spendByCurrency, [
    { currency: "eur", grossPaid: 1_000, refunded: 250, netSpent: 750 },
    { currency: "gbp", grossPaid: 1_500, refunded: 500, netSpent: 1_000 },
  ]);
  assert.equal(bob?.totalOrders, 2);
  assert.equal(bob?.settledOrders, 0);
  assert.deepEqual(bob?.spendByCurrency, []);
});

test("mounted order and customer summaries label grouped net money instead of invented GBP", async () => {
  const [ordersList, customersList, customerDetail] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/OrdersList.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/CustomersList.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/pages/CustomerDetailPage.tsx"), "utf8"),
  ]);
  assert.match(ordersList, /stats\.byCurrency\.map/);
  assert.match(ordersList, /Net revenue/);
  assert.match(ordersList, /Gross/);
  assert.match(ordersList, /refunds/);
  assert.doesNotMatch(ordersList, /stats\.totalRevenue/);
  assert.match(customersList, /spendByCurrency/);
  assert.match(customersList, /Net spend/);
  assert.doesNotMatch(customersList, /totalSpent/);
  assert.match(customerDetail, /Net spend by currency/);
  assert.doesNotMatch(customerDetail, /totalSpent/);
});
