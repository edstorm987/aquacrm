import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CustomerInvoice } from "../src/app/portal/customer/_portalData";
import { customerPortalReadPhase, resolveCustomerDepositState } from "../src/lib/portal/customerPortalReadState";
import { readOrUnavailable } from "../src/lib/readAvailability";

const PAID_DEPOSIT: CustomerInvoice = {
  id: "inv-deposit",
  number: "INV-1",
  issuedAt: 1,
  dueAt: 2,
  lineItems: [{ description: "Project deposit", quantity: 1, unitCents: 10_000, totalCents: 10_000 }],
  subtotalCents: 10_000,
  taxCents: 0,
  totalCents: 10_000,
  currency: "gbp",
  status: "paid",
  paidAt: 3,
};

test("a delayed customer Finance read stays pending until it has a confirmed result", async () => {
  let release!: (value: CustomerInvoice[]) => void;
  let settled = false;
  const gate = new Promise<CustomerInvoice[]>(resolve => { release = resolve; });
  const pending = readOrUnavailable(() => gate, [] as CustomerInvoice[]).then(result => {
    settled = true;
    return result;
  });

  await Promise.resolve();
  assert.equal(settled, false, "the fallback must not be emitted as a ready empty result while Finance is still loading");

  release([PAID_DEPOSIT]);
  const result = await pending;
  assert.equal(result.available, true);
  assert.deepEqual(result.data, [PAID_DEPOSIT]);
  assert.equal(customerPortalReadPhase({ reads: { invoices: "ready", messages: "ready" }, available: { invoices: true, messages: true } }, "invoices"), "ready");
});

test("failed and stale invoice evidence cannot become a negative deposit claim", async () => {
  const failed = await readOrUnavailable<CustomerInvoice[]>(async () => {
    throw new Error("provider unavailable");
  }, [PAID_DEPOSIT]);

  assert.equal(failed.available, false);
  assert.equal(customerPortalReadPhase({ reads: { invoices: "unavailable", messages: "ready" }, available: { invoices: false, messages: true } }, "invoices"), "unavailable");
  assert.equal(resolveCustomerDepositState({
    durablePaid: false,
    invoiceRead: "unavailable",
    invoices: failed.data,
  }), "unavailable", "even a retained paid row is not current evidence after the read failed");
  assert.equal(resolveCustomerDepositState({
    durablePaid: true,
    invoiceRead: "unavailable",
    invoices: [],
  }), "received", "the independent durable paid marker remains positive evidence");
  assert.equal(resolveCustomerDepositState({
    durablePaid: false,
    invoiceRead: "ready",
    invoices: [],
  }), "not-recorded");
  assert.equal(resolveCustomerDepositState({
    durablePaid: false,
    invoiceRead: "ready",
    invoices: [PAID_DEPOSIT],
  }), "received");
});

test("every customer invoice empty, total and attention surface is gated by the checked read", async () => {
  const [dataSource, views, composition, attention, chrome, loading] = await Promise.all([
    readFile(new URL("../src/app/portal/customer/_portalData.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/customer/_PortalPageComposition.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/portal/customerPortalAttention.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/customer/_CustomerPortalChrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/customer/loading.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dataSource, /reads:\s*\{\s*invoices: invoiceReadPhase/);
  assert.match(dataSource, /depositState = resolveCustomerDepositState/);
  assert.match(views, /data\.depositState === "unavailable"/);
  assert.match(views, /<CustomerPaymentPlans[^>]*invoiceRead=\{invoiceRead\}/);
  assert.match(views, /The agreed schedule remains visible, but payment totals and linked milestone statuses are withheld/);
  assert.match(views, /!invoicesReady \? \(\s*<div className="px-6 py-10 text-center">/);
  assert.match(composition, /customerPortalReadPhase\(data, "invoices"\) !== "ready"/);
  assert.match(attention, /sections\.billing = \{ count: 0, label, unavailable: true \}/);
  assert.match(chrome, /attention\.state === "unavailable"/);
  assert.match(chrome, /Some status could not be checked/);
  assert.match(loading, /PortalViewportLoading/);
});
