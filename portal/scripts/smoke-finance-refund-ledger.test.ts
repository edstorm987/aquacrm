// Finance refund ledger — durable provider identity, cumulative Stripe events,
// partial/full allocation, failure recovery, disputes and fresh-process reload.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { after, test } from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, TenantPort, UserPort } from "../src/built-ins/modules/agency-finance/src/server/ports";
import type { ActivityEntry, Agency, Client } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import { containerWithDeps } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { reconcileStripeEvent } from "../src/built-ins/modules/agency-finance/src/server/stripeReconcile";

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");
const AGENCY_ID = "agency_refund_ledger";
const CLIENT_ID = "client_refund_ledger";
const ACTOR = "owner";
const NOW = Date.UTC(2026, 7, 26, 12);

// The end of every reporting window below must cover BOTH the fixed timestamps
// this file stamps on provider events AND the wall clock.
//
// A Stripe refund object that carries no `created` is stamped by the product
// with `now()` — correct in production, where any window ending "now" contains
// it. This file used `NOW + 1` as its window end, so those wall-clock rows fell
// outside it and the refund arithmetic under-counted. It passed every day up to
// 2026-08-26 and began failing on the 27th: a fixture time-bomb, not a product
// fault. Take whichever end is later so the window always contains everything
// the test created.
const REPORT_END = (): number => Math.max(NOW, Date.now()) + 1;

function memoryWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Refund Agency", slug: "refund-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const client: Client = { id: CLIENT_ID, agencyId: AGENCY_ID, name: "Refund Client", slug: "refund-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
  const rows = new Map<string, unknown>();
  let failAfterRefundRow = false;
  const storage: PluginStorage & { failAfterNextRefundRow(): void } = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return rows.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      rows.set(key, value);
      if (failAfterRefundRow && key.startsWith("refunds/by-id/")) {
        failAfterRefundRow = false;
        throw new Error("planned refund persistence interruption");
      }
    },
    async del(key: string): Promise<void> { rows.delete(key); },
    async list(prefix = ""): Promise<string[]> { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
    failAfterNextRefundRow() { failAfterRefundRow = true; },
  };
  const tenant: TenantPort = {
    getAgency: id => id === agency.id ? agency : null,
    getClient: id => id === client.id ? client : null,
    getClientForAgency: (agencyId, id) => agencyId === agency.id && id === client.id ? client : null,
    listClients: () => [client],
  };
  const user: UserPort = { getUser: () => null };
  const activityRows: ActivityEntry[] = [];
  const activityByKey = new Map<string, ActivityEntry>();
  const activity: ActivityLogPort = {
    logActivity(input) {
      if (input.idempotencyKey && activityByKey.has(input.idempotencyKey)) return activityByKey.get(input.idempotencyKey)!;
      const entry = { id: `activity_${activityRows.length + 1}`, ts: NOW, ...input } as ActivityEntry;
      activityRows.push(entry);
      if (input.idempotencyKey) activityByKey.set(input.idempotencyKey, entry);
      return entry;
    },
    listActivity: () => activityRows,
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall: () => null };
  const services = () => containerWithDeps({ agencyId: AGENCY_ID, storage, tenant, user, activity, events, pluginInstalls });
  return { storage, rows, activityRows, services };
}

async function seedPaid(services: ReturnType<ReturnType<typeof memoryWorld>["services"]>, key: string, totalCents = 10_000) {
  const invoice = await services.invoices.create({
    clientId: CLIENT_ID,
    issuedAt: NOW - 10_000,
    dueAt: NOW + 86_400_000,
    lineItems: [{ description: "Refund proof", quantity: 1, unitCents: totalCents - 1_000 }],
    taxCents: 1_000,
    currency: "gbp",
    idempotencyKey: key,
  }, ACTOR);
  await services.invoices.update(invoice.id, { status: "sent" }, ACTOR);
  const paid = await services.payments.record(ACTOR, {
    invoiceId: invoice.id,
    amountCents: totalCents,
    currency: "gbp",
    method: "stripe",
    externalRef: `pi_${key}`,
    paidAt: NOW - 5_000,
    idempotencyKey: `pay_${key}`,
  });
  return { invoice: paid.invoice, payment: paid.payment };
}

test("partial, multiple and full cumulative refunds share one net allocation book", async () => {
  const world = memoryWorld();
  const services = world.services();
  const { invoice, payment } = await seedPaid(services, "cumulative");

  const partial = await reconcileStripeEvent(services, {
    id: "evt_refund_1",
    type: "charge.refunded",
    data: { object: { payment_intent: payment.externalRef, amount_refunded: 3_000, refunds: { data: [{ id: "re_1", amount: 3_000, created: NOW / 1_000 }] } } },
  });
  assert.equal(partial.action, "refunded");
  assert.equal((await services.invoices.get(invoice.id))?.status, "partially-refunded");
  let refunds = await services.payments.listRefundsForPayment(payment.id);
  assert.deepEqual(refunds.map(refund => [refund.providerId, refund.amountCents]), [["re_1", 3_000]]);

  const repeated = await reconcileStripeEvent(services, {
    id: "evt_refund_1_replayed_elsewhere",
    type: "charge.refunded",
    data: { object: { payment_intent: payment.externalRef, amount_refunded: 3_000, refunds: { data: [{ id: "re_1", amount: 3_000 }] } } },
  });
  assert.equal(repeated.action, "deduped");
  assert.equal((await services.payments.listRefundsForPayment(payment.id)).length, 1);

  await reconcileStripeEvent(services, {
    id: "evt_refund_2",
    type: "charge.refunded",
    data: { object: { payment_intent: payment.externalRef, amount_refunded: 5_000, refunds: { data: [{ id: "re_1", amount: 3_000 }, { id: "re_2", amount: 2_000 }] } } },
  });
  refunds = await services.payments.listRefundsForPayment(payment.id);
  assert.equal(refunds.reduce((sum, refund) => sum + refund.amountCents, 0), 5_000);

  let accounting = await services.accounting.snapshot({ from: 0, to: REPORT_END(), currency: "gbp" });
  assert.equal(accounting.grossCashRevenueCents, 10_000);
  assert.equal(accounting.refundCents, 5_000);
  assert.equal(accounting.cashRevenueCents, 5_000);
  assert.equal(accounting.outputTaxCents, 500, "receipt tax reverses proportionally with cash");
  assert.equal(accounting.outstandingReceivableCents, 5_000, "the partial refund reopens the net allocation");

  await reconcileStripeEvent(services, {
    id: "evt_refund_full",
    type: "charge.refunded",
    data: { object: { payment_intent: payment.externalRef, amount_refunded: 10_000 } },
  });
  assert.equal((await services.invoices.get(invoice.id))?.status, "refunded");
  accounting = await services.accounting.snapshot({ from: 0, to: REPORT_END(), currency: "gbp" });
  const report = await services.reports.revenueSnapshot({ from: 0, to: REPORT_END(), currency: "gbp" });
  const pnl = await services.pnl.founderSnapshot(REPORT_END(), 30, "gbp");
  assert.equal(accounting.grossCashRevenueCents, 10_000);
  assert.equal(accounting.refundCents, 10_000);
  assert.equal(accounting.cashRevenueCents, 0);
  assert.equal(accounting.outputTaxCents, 0);
  assert.equal(report.totalPaidCents, 0);
  assert.equal(pnl.topClients.length, 0);
});

test("a failure after the refund row is retryable and adopts one durable provider identity", async () => {
  const world = memoryWorld();
  const services = world.services();
  const { invoice, payment } = await seedPaid(services, "retry");
  const event = {
    id: "evt_refund_retry",
    type: "charge.refunded",
    data: { object: { payment_intent: payment.externalRef, amount_refunded: 2_500, refunds: { data: [{ id: "re_retry", amount: 2_500 }] } } },
  };
  world.storage.failAfterNextRefundRow();
  await assert.rejects(reconcileStripeEvent(services, event), /planned refund persistence interruption/);
  assert.equal((await services.payments.listRefundsForPayment(payment.id)).length, 1, "the row is discoverable even before its index write");
  assert.equal((await services.invoices.get(invoice.id))?.status, "paid", "the interrupted side effect has not lied about completion");

  const retry = await reconcileStripeEvent(services, event);
  assert.equal(retry.action, "deduped");
  assert.equal((await services.payments.listRefundsForPayment(payment.id)).length, 1);
  assert.equal((await services.invoices.get(invoice.id))?.status, "partially-refunded");
  assert.equal(world.activityRows.filter(row => row.action === "payment.refunded").length, 1);
});

const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-finance-refunds-"));
const STATE_FILE = join(SANDBOX, "portal-state.json");
// A side channel both child processes append to: the event bus has no
// idempotency of its own, so "how many times was this emitted, across every
// instance?" is only answerable outside either process.
const EMIT_LOG = join(SANDBOX, "emitted-events.jsonl");
const INSTALL_ID = `${AGENCY_ID}|_agency|agency-finance`;

const CHILD_SOURCE = String.raw`
const [pluginStorageImported, financeImported, portalStorageImported, reconcileImported] = await Promise.all([
  import(process.env.AQUA_PLUGIN_STORAGE_MODULE),
  import(process.env.AQUA_FINANCE_MODULE),
  import(process.env.AQUA_PORTAL_STORAGE_MODULE),
  import(process.env.AQUA_RECONCILE_MODULE),
]);
const { appendFileSync } = await import("node:fs");
const emitLog = process.env.AQUA_EMIT_LOG;
const pluginStorageModule = pluginStorageImported.default || pluginStorageImported;
const financeModule = financeImported.default || financeImported;
const portalStorageModule = portalStorageImported.default || portalStorageImported;
const reconcileModule = reconcileImported.default || reconcileImported;
await portalStorageModule.ensureHydrated({ fresh: true });
const agencyId = process.env.AQUA_AGENCY_ID;
const clientId = process.env.AQUA_CLIENT_ID;
const input = JSON.parse(process.env.AQUA_INPUT || "{}");
const storage = pluginStorageModule.makePluginStorage(process.env.AQUA_INSTALL_ID);
const finance = financeModule.containerWithDeps({
  agencyId,
  storage,
  tenant: {
    getAgency: id => id === agencyId ? { id: agencyId, name: "Refund Agency", slug: "refund-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 } : null,
    getClient: id => id === clientId ? { id: clientId, agencyId, name: "Refund Client", slug: "refund-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 } : null,
    getClientForAgency: (requestedAgencyId, id) => requestedAgencyId === agencyId && id === clientId ? { id: clientId, agencyId, name: "Refund Client", slug: "refund-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 } : null,
  },
  user: { getUser: () => null },
  activity: { logActivity: value => ({ id: value.idempotencyKey || "activity", ts: Date.now(), ...value }), listActivity: () => [] },
  events: { emit(scope, name, payload) { if (emitLog) appendFileSync(emitLog, JSON.stringify({ name: name, payload: payload }) + "\n"); } },
  pluginInstalls: { getInstall: () => null },
});
let value;
if (process.env.AQUA_ACTION === "seed") {
  let invoice = await finance.invoices.create({ clientId, issuedAt: input.now - 10_000, dueAt: input.now + 100_000, lineItems: [{ description: "Process refund", quantity: 1, unitCents: 10_000 }], currency: "gbp", idempotencyKey: "process-invoice" }, "owner");
  if (invoice.status === "draft") invoice = await finance.invoices.update(invoice.id, { status: "sent" }, "owner");
  const paid = await finance.payments.record("owner", { invoiceId: invoice.id, amountCents: 10_000, currency: "gbp", method: "stripe", externalRef: "pi_process", paidAt: input.now - 5_000, idempotencyKey: "process-payment" });
  value = { invoiceId: invoice.id, paymentId: paid.payment.id };
} else if (process.env.AQUA_ACTION === "refund") {
  value = await reconcileModule.reconcileStripeEvent(finance, { id: input.eventId, type: "charge.refunded", data: { object: { payment_intent: "pi_process", amount_refunded: input.totalRefundedCents, refunds: { data: [{ id: input.refundId, amount: input.refundAmountCents }] } } } });
} else if (process.env.AQUA_ACTION === "dispute") {
  value = await reconcileModule.reconcileStripeEvent(finance, { id: input.eventId, type: "charge.dispute.created", data: { object: { id: input.disputeId, payment_intent: "pi_process", amount: input.amountCents } } });
} else if (process.env.AQUA_ACTION === "snapshot") {
  value = { invoice: await finance.invoices.get(input.invoiceId), refunds: await finance.payments.listRefunds(), disputes: await finance.payments.listDisputes(), accounting: await finance.accounting.snapshot({ from: 0, to: input.now + 1, currency: "gbp" }) };
} else throw new Error("unknown action");
await portalStorageModule.flushPendingWrites();
process.stdout.write(JSON.stringify({ ok: true, value }));
`;

interface ChildResult<T = unknown> { ok: boolean; value?: T; }
function moduleUrl(path: string): string { return pathToFileURL(join(REPO_ROOT, path)).href; }
async function runChild<T>(action: "seed" | "refund" | "dispute" | "snapshot", input: Record<string, unknown>): Promise<ChildResult<T>> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", TSX_LOADER, "--input-type=module", "--eval", CHILD_SOURCE], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: STATE_FILE,
        TSX_TSCONFIG_PATH: join(REPO_ROOT, "tsconfig.json"),
        AQUA_ACTION: action,
        AQUA_INPUT: JSON.stringify(input),
        AQUA_INSTALL_ID: INSTALL_ID,
        AQUA_EMIT_LOG: EMIT_LOG,
        AQUA_AGENCY_ID: AGENCY_ID,
        AQUA_CLIENT_ID: CLIENT_ID,
        AQUA_PLUGIN_STORAGE_MODULE: moduleUrl("src/lib/server/pluginStorage.ts"),
        AQUA_FINANCE_MODULE: moduleUrl("src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts"),
        AQUA_PORTAL_STORAGE_MODULE: moduleUrl("src/server/storage.ts"),
        AQUA_RECONCILE_MODULE: moduleUrl("src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) return rejectChild(new Error(`refund child exited ${code}: ${stderr || stdout}`));
      try { resolveChild(JSON.parse(stdout) as ChildResult<T>); }
      catch { rejectChild(new Error(`refund child returned non-JSON: ${stdout}\n${stderr}`)); }
    });
  });
}

after(async () => { await rm(SANDBOX, { recursive: true, force: true }); });

test("independent processes converge one refund/dispute row and a fresh reload sees net cash", async () => {
  const seeded = await runChild<{ invoiceId: string; paymentId: string }>("seed", { now: NOW });
  assert.equal(seeded.ok, true);
  assert.ok(seeded.value);
  const refundInput = { eventId: "evt_process_refund", refundId: "re_process", refundAmountCents: 3_000, totalRefundedCents: 3_000 };
  const [left, right] = await Promise.all([
    runChild("refund", refundInput),
    runChild("refund", refundInput),
  ]);
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  const [disputeLeft, disputeRight] = await Promise.all([
    runChild<{ action: string }>("dispute", { eventId: "evt_process_dispute_a", disputeId: "dp_process", amountCents: 2_000 }),
    runChild<{ action: string }>("dispute", { eventId: "evt_process_dispute_b", disputeId: "dp_process", amountCents: 2_000 }),
  ]);
  // One process wrote the dispute; the other met it already there. The loser
  // must SAY so — reporting a second "chargeback" would tell the operator the
  // client disputed twice.
  assert.deepEqual(
    [disputeLeft.value?.action, disputeRight.value?.action].sort(),
    ["chargeback", "deduped"],
    "exactly one delivery records the chargeback, the other reports itself deduped",
  );
  const snapshot = await runChild<{ invoice: { status: string }; refunds: Array<{ providerId: string; amountCents: number }>; disputes: Array<{ providerId: string }>; accounting: { grossCashRevenueCents: number; refundCents: number; cashRevenueCents: number } }>("snapshot", { invoiceId: seeded.value.invoiceId, now: REPORT_END() });
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.value?.invoice.status, "partially-refunded");
  assert.deepEqual(snapshot.value?.refunds.map(row => [row.providerId, row.amountCents]), [["re_process", 3_000]]);
  assert.deepEqual(snapshot.value?.disputes.map(row => row.providerId), ["dp_process"]);
  assert.equal(snapshot.value?.accounting.grossCashRevenueCents, 10_000);
  assert.equal(snapshot.value?.accounting.refundCents, 3_000);
  assert.equal(snapshot.value?.accounting.cashRevenueCents, 7_000);

  // The side effects, not just the rows. The bus re-runs every subscriber and
  // automation per emit — a duplicate `payment.disputed` chases the client
  // about the same chargeback twice.
  const emitted = readFileSync(EMIT_LOG, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { name: string });
  assert.equal(emitted.filter(e => e.name === "agency-finance.payment.disputed").length, 1, "one dispute, one emitted event across BOTH processes");
  assert.equal(emitted.filter(e => e.name === "agency-finance.payment.refunded").length, 1, "one refund, one emitted event across BOTH processes");
});

test("mounted/manual and visible consumers keep gross, refund and net fields explicit", () => {
  const handler = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts"), "utf8");
  const accounting = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/server/accounting.ts"), "utf8");
  const reports = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx"), "utf8");
  const income = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx"), "utf8");
  assert.match(handler, /idempotencyKey or Idempotency-Key header is required/);
  assert.match(handler, /recordRefund\(ctx\.actor/);
  assert.match(accounting, /grossCashRevenueCents/);
  assert.match(accounting, /refundCents/);
  assert.match(reports, /Gross receipts/);
  assert.match(reports, /Refunds/);
  assert.match(income, /source: "refund" as const/);
});
