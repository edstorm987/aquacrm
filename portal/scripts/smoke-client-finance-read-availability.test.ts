import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  beginClientFinanceRead,
  clientFinanceReadPresentation,
  initialClientFinanceReadState,
  readClientFinanceSources,
  settleClientFinanceRead,
  type ClientFinanceInvoice,
} from "../src/lib/client/clientFinanceReads";

const invoice: ClientFinanceInvoice = {
  id: "inv_1",
  number: "INV-1",
  issuedAt: 1,
  dueAt: 2,
  totalCents: 12_500,
  currency: "gbp",
  status: "sent",
  lineItems: [{ description: "Launch" }],
};

const expense = {
  id: "exp_1",
  categoryId: "cat_1",
  amountCents: 2_500,
  currency: "gbp",
  incurredAt: 1,
  status: "reimbursed" as const,
};

const category = { id: "cat_1", name: "Hosting", status: "active" as const };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bySource(options: {
  invoices?: () => Promise<Response>;
  expenses?: () => Promise<Response>;
  categories?: () => Promise<Response>;
}) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/invoices")) return (options.invoices ?? (async () => json({ ok: true, invoices: [] })))();
    if (url.includes("/expenses")) return (options.expenses ?? (async () => json({ ok: true, expenses: [] })))();
    if (url.includes("/categories")) return (options.categories ?? (async () => json({ ok: true, categories: [] })))();
    throw new Error(`unexpected read ${url}`);
  };
}

describe("client Finance checked reads", () => {
  it("accepts independently confirmed empty catalogues", async () => {
    const result = await readClientFinanceSources({ clientId: "client one", fetcher: bySource({}) });
    assert.deepEqual(result.invoices, { available: true, rows: [] });
    assert.deepEqual(result.expenses, { available: true, rows: [] });
    assert.deepEqual(result.categories, { available: true, rows: [] });
  });

  it("keeps HTTP 503, transport rejection and malformed 200 responses unavailable", async () => {
    const result = await readClientFinanceSources({
      clientId: "client_1",
      fetcher: bySource({
        invoices: async () => json({ ok: false, error: "provider unavailable" }, 503),
        expenses: async () => { throw new Error("network gone"); },
        categories: async () => json({ ok: true, categories: "not-an-array" }),
      }),
    });
    assert.equal(result.invoices.available, false);
    assert.equal(result.expenses.available, false);
    assert.equal(result.categories.available, false);
    if (!result.invoices.available) assert.equal(result.invoices.kind, "unavailable");
    if (!result.expenses.available) assert.equal(result.expenses.kind, "unavailable");
    if (!result.categories.available) assert.equal(result.categories.kind, "unavailable");
  });

  it("does not let one source failure erase the sources that answered", async () => {
    const result = await readClientFinanceSources({
      clientId: "client_1",
      fetcher: bySource({
        invoices: async () => json({ ok: true, invoices: [invoice] }),
        expenses: async () => json({ ok: false }, 503),
        categories: async () => json({ ok: true, categories: [category] }),
      }),
    });
    assert.equal(result.invoices.available, true);
    assert.equal(result.expenses.available, false);
    assert.equal(result.categories.available, true);
    if (result.invoices.available) assert.equal(result.invoices.rows[0]?.number, "INV-1");
    if (result.categories.available) assert.equal(result.categories.rows[0]?.name, "Hosting");
  });

  it("reserves plugin-missing for an explicit disabled/not-installed response", async () => {
    const disabled = await readClientFinanceSources({
      clientId: "client_1",
      fetcher: bySource({ invoices: async () => json({ ok: false, error: "feature_disabled" }, 404) }),
    });
    assert.equal(disabled.invoices.available, false);
    if (!disabled.invoices.available) assert.equal(disabled.invoices.kind, "plugin-missing");

    const generic404 = await readClientFinanceSources({
      clientId: "client_1",
      fetcher: bySource({ invoices: async () => json({ ok: false, error: "not_found" }, 404) }),
    });
    assert.equal(generic404.invoices.available, false);
    if (!generic404.invoices.available) assert.equal(generic404.invoices.kind, "unavailable");
  });

  it("retains a labelled last-confirmed snapshot through failure and replaces it on retry recovery", () => {
    let state = initialClientFinanceReadState<ClientFinanceInvoice>();
    state = settleClientFinanceRead(state, { available: true, rows: [invoice] });
    assert.equal(state.phase, "ready");
    assert.equal(clientFinanceReadPresentation(state).showRows, true);

    state = beginClientFinanceRead(state);
    assert.equal(state.phase, "loading");
    assert.equal(state.rows[0]?.id, "inv_1", "refresh must not blank confirmed evidence");

    state = settleClientFinanceRead(state, { available: false, kind: "unavailable", message: "Invoices could not be loaded." });
    const failed = clientFinanceReadPresentation(state);
    assert.equal(failed.showRows, true);
    assert.equal(failed.showEmpty, false);
    assert.equal(failed.canMutate, false);
    assert.equal(failed.retainedSnapshotIsStale, true);

    state = beginClientFinanceRead(state);
    state = settleClientFinanceRead(state, { available: true, rows: [] });
    const recovered = clientFinanceReadPresentation(state);
    assert.equal(recovered.showEmpty, true);
    assert.equal(recovered.canMutate, true);
    assert.deepEqual(state.rows, []);
  });

  it("recovers each checked source on a real retry after an unavailable pass", async () => {
    let attempt = 0;
    const fetcher = bySource({
      invoices: async () => attempt === 0
        ? json({ ok: false, error: "temporary" }, 503)
        : json({ ok: true, invoices: [invoice] }),
      expenses: async () => json({ ok: true, expenses: [expense] }),
      categories: async () => json({ ok: true, categories: [category] }),
    });
    const first = await readClientFinanceSources({ clientId: "client_1", fetcher });
    assert.equal(first.invoices.available, false);
    attempt += 1;
    const retry = await readClientFinanceSources({ clientId: "client_1", fetcher });
    assert.equal(retry.invoices.available, true);
    if (retry.invoices.available) assert.equal(retry.invoices.rows[0]?.id, "inv_1");
  });
});

describe("mounted client Finance availability contract", () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

  it("withholds empty and derived claims until their contributing reads are current", () => {
    const finance = read("src/app/portal/clients/[clientId]/_FinanceTabClient.tsx");
    assert.match(finance, /readClientFinanceSources\(\{ clientId, signal \}\)/);
    assert.match(finance, /settleClientFinanceRead\(current, result\.invoices\)/);
    assert.match(finance, /settleClientFinanceRead\(current, result\.expenses\)/);
    assert.match(finance, /settleClientFinanceRead\(current, result\.categories\)/);
    assert.match(finance, /invoicePresentation\.showEmpty/);
    assert.match(finance, /expensePresentation\.showEmpty/);
    assert.match(finance, /grossProfit === null \? "—"/);
    assert.match(finance, /not confirmation that this client has no invoices/i);
    assert.match(finance, /Last-confirmed invoice rows/);
    assert.match(finance, /Retry invoices/);
    assert.doesNotMatch(finance, /if \(!res\.ok\)[\s\S]{0,120}setPluginMissing\(true\)/,
      "an arbitrary HTTP failure must not become pluginMissing");
  });

  it("passes invoice availability into payment plans and locks stale reconciliation and writes", () => {
    const finance = read("src/app/portal/clients/[clientId]/_FinanceTabClient.tsx");
    const plans = read("src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx");
    assert.match(finance, /invoiceReadState=\{invoiceRead\.phase\}/);
    assert.match(finance, /invoiceHasConfirmedSnapshot=\{invoiceRead\.hasConfirmedSnapshot\}/);
    assert.match(plans, /if \(!invoiceEvidenceCurrent\) return;[\s\S]{0,160}reconcileClientPaymentPlan/);
    assert.match(plans, /invoiceEvidenceCurrent \? summariseClientPaymentPosition/);
    assert.match(plans, /Current invoice evidence is required before issuing or retrying a milestone invoice/);
    assert.match(plans, /disabled=\{Boolean\(busy\) \|\| !invoiceEvidenceCurrent\}/);
    assert.match(plans, /paymentPosition \? paymentPosition\.missedPayments : "—"/);
    assert.match(plans, /const missed = invoiceEvidenceCurrent && plan\.status === "active"/);
    assert.match(plans, /Last-confirmed invoice evidence is retained/);
  });
});
