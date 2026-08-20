// Finance Phase 3 — Stripe (online channel): reconciliation + adapter.
//
// The valuable, verifiable core: given a *verified* Stripe event, the
// reconciliation reflects it into the real finance records (records a Stripe
// payment, settles the invoice, flows a refund/chargeback back). Driven against
// the real InvoiceService/PaymentService over an in-memory container — no
// `stripe` package, no live keys. The adapter is exercised with an injected
// fake client. Record + surface only; the app never holds funds.

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";

// `stripe.ts` / `stripeReconcile.ts` are `server-only`; neutralise it so the
// test runs regardless of resolver conditions.
const require = createRequire(import.meta.url);
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [] } as never;

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
  UserProjection,
} from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import type { PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/agency-finance/src/server/ports";
import { containerWithDeps } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { reconcileStripeEvent, reconcileStripeEventOnce } from "../src/built-ins/modules/agency-finance/src/server/stripeReconcile";
import { deriveRecordId } from "../src/built-ins/modules/agency-finance/src/lib/idempotency";
import {
  createInvoiceCheckout,
  createStripeRefund,
  readStripeKeysFromInstall,
  stripeConfigured,
  verifyStripeWebhook,
  type StripeClientLike,
  type StripeEvent,
} from "../src/built-ins/modules/agency-finance/src/lib/stripe";

const AGENCY_ID: AgencyId = "agency_stripe_smoke";
const CLIENT_ID: ClientId = "client_stripe_smoke";
const ACTOR: UserId = "user_admin";

function buildWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Stripe Smoke", slug: "stripe-smoke", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const client: Client = { id: CLIENT_ID, agencyId: AGENCY_ID, name: "Payer Ltd", slug: "payer", brand: { primaryColor: "#0af" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> { const keys = [...data.keys()]; return prefix ? keys.filter(k => k.startsWith(prefix)) : keys; },
  };
  const tenant: TenantPort = {
    getAgency: id => (id === AGENCY_ID ? agency : null),
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };
  const user: UserPort = { getUser: () => null };
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = { id: `act_${actSeq++}`, ts: Date.now(), agencyId: input.agencyId, clientId: input.clientId, actorUserId: input.actorUserId, actorEmail: input.actorEmail, category: input.category, action: input.action, message: input.message, metadata: input.metadata };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) { return activityLog.filter(e => e.agencyId === filter.agencyId); },
  };
  const eventBus: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = { getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; } };
  return { storage, tenant, user, activity, events: eventBus, pluginInstalls, inspect: { activityLog, events } };
}

// A fake Stripe client capturing the params it's called with.
function fakeStripe(overrides: Partial<StripeClientLike> = {}): { client: StripeClientLike; captured: Record<string, unknown> } {
  const captured: Record<string, unknown> = {};
  const client: StripeClientLike = {
    checkout: { sessions: { async create(params) { captured.checkout = params; return { id: "cs_fake", url: "https://checkout.stripe.test/cs_fake" }; } } },
    webhooks: { constructEvent() { throw new Error("not used"); } },
    refunds: { async create(params) { captured.refund = params; return { id: "re_fake", status: "succeeded" }; } },
    ...overrides,
  };
  return { client, captured };
}

const evt = (type: string, object: Record<string, unknown>, id = `evt_${type}`): StripeEvent => ({ id, type, data: { object } });

let world: ReturnType<typeof buildWorld>;
let services: ReturnType<typeof containerWithDeps>;
let invoiceId: string;

before(async () => {
  world = buildWorld();
  services = containerWithDeps({ agencyId: AGENCY_ID, storage: world.storage, tenant: world.tenant, user: world.user, activity: world.activity, events: world.events, pluginInstalls: world.pluginInstalls });
  const invoice = await services.invoices.create({ clientId: CLIENT_ID, dueAt: 1_000_000, lineItems: [{ description: "Website build", quantity: 1, unitCents: 50_000 }], currency: "gbp" }, ACTOR);
  invoiceId = invoice.id;
  await services.invoices.update(invoiceId, { status: "sent" }, ACTOR);
});

test("checkout.session.completed records a Stripe payment and settles the invoice", async () => {
  const result = await reconcileStripeEvent(
    services,
    evt("checkout.session.completed", { id: "cs_1", payment_intent: "pi_1", amount_total: 50_000, currency: "gbp", metadata: { invoiceId } }),
  );
  assert.equal(result.action, "paid");
  assert.equal(result.invoiceId, invoiceId);

  const invoice = await services.invoices.get(invoiceId);
  assert.equal(invoice?.status, "paid", "the invoice is settled");
  assert.equal(invoice?.paidVia, "stripe");

  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].method, "stripe");
  assert.equal(payments[0].externalRef, "pi_1", "the PaymentIntent id is the reconciliation key");
});

test("a redelivered checkout.session.completed is idempotent (no double-charge)", async () => {
  const result = await reconcileStripeEvent(
    services,
    evt("checkout.session.completed", { id: "cs_1", payment_intent: "pi_1", amount_total: 50_000, currency: "gbp", metadata: { invoiceId } }),
  );
  assert.equal(result.action, "deduped");
  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1, "still exactly one payment after a redelivery");
});

test("charge.refunded flows back to the invoice status and surfaces an event + activity", async () => {
  const result = await reconcileStripeEvent(
    services,
    evt("charge.refunded", { payment_intent: "pi_1", amount_refunded: 50_000 }),
  );
  assert.equal(result.action, "refunded");
  const invoice = await services.invoices.get(invoiceId);
  assert.equal(invoice?.status, "refunded", "paid → refunded");
  assert.ok(world.inspect.events.some(e => e.name === "agency-finance.payment.refunded"), "a refund event is emitted");
  assert.ok(world.inspect.activityLog.some(a => a.action === "payment.refunded"), "a refund is logged");
});

test("charge.dispute.created surfaces a chargeback without forcing the invoice status", async () => {
  const before = (await services.invoices.get(invoiceId))?.status;
  const result = await reconcileStripeEvent(
    services,
    evt("charge.dispute.created", { payment_intent: "pi_1", amount: 50_000 }),
  );
  assert.equal(result.action, "chargeback");
  assert.ok(world.inspect.events.some(e => e.name === "agency-finance.payment.disputed"), "a dispute event is emitted");
  assert.ok(world.inspect.activityLog.some(a => a.action === "payment.disputed"), "a dispute is logged");
  assert.equal((await services.invoices.get(invoiceId))?.status, before, "a contested dispute does not itself change status");
});

test("an event we don't handle, or a session without an invoiceId, is safely ignored", async () => {
  assert.equal((await reconcileStripeEvent(services, evt("payment_intent.created", { id: "pi_x" }))).action, "ignored");
  assert.equal((await reconcileStripeEvent(services, evt("checkout.session.completed", { id: "cs_2", payment_intent: "pi_2", metadata: {} }))).action, "ignored");
});

test("createInvoiceCheckout builds a one-line-item session stamped with the invoiceId", async () => {
  const { client, captured } = fakeStripe();
  const out = await createInvoiceCheckout(
    { secretKey: "sk_test_x" },
    { invoiceId: "inv_42", invoiceNumber: "INV-2026-0042", amountCents: 50_000, currency: "gbp", successUrl: "https://app/ok", cancelUrl: "https://app/cancel" },
    client,
  );
  assert.equal(out.url, "https://checkout.stripe.test/cs_fake");
  const params = captured.checkout as Record<string, any>;
  assert.equal(params.mode, "payment");
  assert.equal(params.line_items[0].price_data.unit_amount, 50_000);
  assert.equal(params.line_items[0].price_data.currency, "gbp");
  assert.equal(params.metadata.invoiceId, "inv_42", "the webhook reconciles by this");
  assert.equal(params.payment_intent_data.metadata.invoiceId, "inv_42");
});

test("createStripeRefund calls Stripe with the PaymentIntent (full refund when no amount)", async () => {
  const { client, captured } = fakeStripe();
  const out = await createStripeRefund({ secretKey: "sk_test_x" }, { paymentIntentId: "pi_1" }, client);
  assert.equal(out.id, "re_fake");
  const params = captured.refund as Record<string, any>;
  assert.equal(params.payment_intent, "pi_1");
  assert.equal(params.amount, undefined, "no amount = full refund");
});

test("verifyStripeWebhook refuses when no webhook secret is configured", async () => {
  await assert.rejects(
    verifyStripeWebhook({ secretKey: "sk_test_x" }, "{}", "sig", fakeStripe().client),
    /webhook secret not configured/i,
  );
});

test("readStripeKeysFromInstall / stripeConfigured read Ed's keys off the install config", () => {
  assert.equal(stripeConfigured({ stripeSecretKey: "sk_test_x" }), true);
  assert.equal(stripeConfigured({}), false);
  assert.equal(stripeConfigured(null), false);
  assert.throws(() => readStripeKeysFromInstall({}), /not configured/i);
  const keys = readStripeKeysFromInstall({ stripeSecretKey: "sk_test_x", stripeWebhookSecret: "whsec_y" });
  assert.equal(keys.secretKey, "sk_test_x");
  assert.equal(keys.webhookSecret, "whsec_y");
});

// ─── Concurrent webhook redelivery (the residual double-count) ───────────────
//
// The `findByExternalRef` pre-check above closes the ORDINARY redelivery (the
// second delivery arrives after the first finished). It does NOT close a TRUE
// concurrent one: two deliveries in flight at the same time both scan, both see
// nothing, and both record — the invoice gets paid twice on Ed's books. Stripe
// really does redeliver in parallel (retries overlap; two app instances can take
// the same event), so this is a real path, not a thought experiment.
//
// The fix under test: `reconcileStripeEvent` passes `idempotencyKey: externalRef`
// (the PaymentIntent id) so the payment's id is DERIVED from the intent. Two
// concurrent recordings land on one storage slot instead of two rows.
//
// The nuance that must survive: multiple/partial Stripe payments on one invoice
// are legitimate. A second genuine payment is a different PaymentIntent → a
// different key → still recorded. Both directions are proven below.

// Its own world, so this can't disturb the ordered pi_1 paid→refunded→disputed
// sequence above.
async function stripeWorld(totalCents = 50_000) {
  const w = buildWorld();
  const s = containerWithDeps({ agencyId: AGENCY_ID, storage: w.storage, tenant: w.tenant, user: w.user, activity: w.activity, events: w.events, pluginInstalls: w.pluginInstalls });
  const invoice = await s.invoices.create({ clientId: CLIENT_ID, dueAt: 1_000_000, lineItems: [{ description: "Retainer", quantity: 1, unitCents: totalCents }], currency: "gbp" }, ACTOR);
  await s.invoices.update(invoice.id, { status: "sent" }, ACTOR);
  return { world: w, services: s, invoiceId: invoice.id };
}

test("CONCURRENT redelivery of the same webhook records exactly ONE payment", async () => {
  const { services: s, invoiceId: inv } = await stripeWorld();
  const event = evt("checkout.session.completed", { id: "cs_race", payment_intent: "pi_race", amount_total: 50_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_race");

  // Three deliveries of the SAME event, all in flight at once — none of them can
  // see another's write before its own pre-check.
  const results = await Promise.all([
    reconcileStripeEvent(s, event),
    reconcileStripeEvent(s, event),
    reconcileStripeEvent(s, event),
  ]);

  const payments = await s.payments.listForInvoice(inv);
  assert.equal(payments.length, 1, "exactly ONE payment survives a concurrent redelivery");
  assert.equal(payments.reduce((sum, p) => sum + p.amountCents, 0), 50_000, "money-in counted once, not 3x");
  assert.equal(payments[0].externalRef, "pi_race", "the PaymentIntent stays the reconciliation reference");
  // The mechanism, asserted directly: the payment's id is DERIVED from the
  // PaymentIntent. Drop `idempotencyKey: externalRef` and this fails — which is
  // exactly why the three concurrent writes collapse to one row above.
  assert.equal(payments[0].id, deriveRecordId("pay", "pi_race"), "the PaymentIntent is the idempotency key");
  assert.ok(results.every(r => r.handled), "every delivery is handled (Stripe gets a 200, no retry storm)");
  assert.ok(results.every(r => r.action === "paid" || r.action === "deduped"), "and none of them errors");
  assert.equal((await s.invoices.get(inv))?.status, "paid", "and the invoice settles once");
});

test("a repeated redelivery AFTER the first completed is still deduped (the sequential path)", async () => {
  const { services: s, invoiceId: inv } = await stripeWorld();
  const event = evt("checkout.session.completed", { id: "cs_seq", payment_intent: "pi_seq", amount_total: 50_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_seq");

  assert.equal((await reconcileStripeEvent(s, event)).action, "paid");
  assert.equal((await reconcileStripeEvent(s, event)).action, "deduped");
  assert.equal((await reconcileStripeEvent(s, event)).action, "deduped");
  assert.equal((await s.payments.listForInvoice(inv)).length, 1, "still one payment after 3 deliveries");
});

test("a genuine SECOND Stripe payment on the same invoice is still allowed (partials are legal)", async () => {
  // A £1,000 invoice paid by two real checkouts of £400 + £600. Two distinct
  // PaymentIntents = two distinct intents — dedup must NOT merge them.
  const { services: s, invoiceId: inv } = await stripeWorld(100_000);

  const first = await reconcileStripeEvent(s, evt("checkout.session.completed", { id: "cs_p1", payment_intent: "pi_partial_1", amount_total: 40_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_p1"));
  const second = await reconcileStripeEvent(s, evt("checkout.session.completed", { id: "cs_p2", payment_intent: "pi_partial_2", amount_total: 60_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_p2"));

  assert.equal(first.action, "paid");
  assert.equal(second.action, "paid", "the second genuine payment is NOT swallowed as a duplicate");
  const payments = await s.payments.listForInvoice(inv);
  assert.equal(payments.length, 2, "both partial payments recorded");
  assert.equal(payments.reduce((sum, p) => sum + p.amountCents, 0), 100_000, "the full amount is banked");
  assert.deepEqual(payments.map(p => p.externalRef).sort(), ["pi_partial_1", "pi_partial_2"]);
  assert.equal((await s.invoices.get(inv))?.status, "paid", "reaching the total settles the invoice");
});

// ─── The drop-on-retry: a transient failure must not swallow a real payment ──
//
// The auditor's open 🟠 (Phase 3 verdict). The webhook handler cached an event
// id BEFORE reconcile ran. If reconcile then threw — a storage blip — the cache
// was poisoned: Stripe retries to the same warm process, the cache says "already
// done", we answer 200, Stripe stops retrying, and **the payment is never
// recorded**. The customer paid; the invoice sits unpaid. That's a DROP, the
// opposite of the double-count the rest of this file guards, and it's worse:
// nothing on the books hints that anything happened.
//
// `reconcileStripeEventOnce` caches only after success and lets the error
// propagate so the caller can answer 5xx. Tested here rather than through
// `stripeWebhookHandler` because the handler needs the real `stripe` package to
// verify a signature, which isn't installed (and never handles Ed's live keys).

// Storage that fails the first write of a payment row — a realistic transient
// blip, mid-reconcile, after the invoice has already been read.
function blipOnFirstPaymentWrite(totalCents = 50_000) {
  const w = buildWorld();
  let blown = false;
  const inner = w.storage;
  const storage: PluginStorage = {
    ...inner,
    async set<T = unknown>(key: string, value: T): Promise<void> {
      if (!blown && key.startsWith("payments/by-id/")) {
        blown = true;
        throw new Error("storage unavailable");
      }
      return inner.set<T>(key, value);
    },
  };
  const services = containerWithDeps({ agencyId: AGENCY_ID, storage, tenant: w.tenant, user: w.user, activity: w.activity, events: w.events, pluginInstalls: w.pluginInstalls });
  return { services, seed: async () => {
    const invoice = await services.invoices.create({ clientId: CLIENT_ID, dueAt: 1_000_000, lineItems: [{ description: "Build", quantity: 1, unitCents: totalCents }], currency: "gbp" }, ACTOR);
    await services.invoices.update(invoice.id, { status: "sent" }, ACTOR);
    return invoice.id;
  } };
}

test("a transient failure is NOT cached — Stripe's retry still records the payment", async () => {
  const { services, seed } = blipOnFirstPaymentWrite();
  const inv = await seed();
  const seen = new Set<string>();
  const event = evt("checkout.session.completed", { id: "cs_blip", payment_intent: "pi_blip", amount_total: 50_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_blip");

  // Delivery 1: the storage blows up mid-reconcile. The error must PROPAGATE so
  // the handler can answer 5xx — swallowing it here is what loses the money.
  await assert.rejects(reconcileStripeEventOnce(services, event, { seen }), /storage unavailable/);
  assert.equal(seen.has("evt_blip"), false, "a failed event is NOT marked processed");
  assert.equal((await services.payments.listForInvoice(inv)).length, 0, "nothing recorded yet");

  // Delivery 2 — Stripe's retry, same warm process. This is where the old code
  // answered "deduped" and dropped the payment forever.
  const retry = await reconcileStripeEventOnce(services, event, { seen });
  assert.equal(retry.action, "paid", "the retry actually processes, it is not waved through");

  const payments = await services.payments.listForInvoice(inv);
  assert.equal(payments.length, 1, "the real payment IS on the books after the retry");
  assert.equal(payments[0].externalRef, "pi_blip");
  assert.equal((await services.invoices.get(inv))?.status, "paid", "and the invoice settles");
});

test("a SUCCESSFUL event is cached — redelivery is waved through without re-running reconcile", async () => {
  // The cache still earns its keep: refunds/disputes aren't durably idempotent,
  // so without it a redelivered refund logs and emits twice.
  const { services: s, invoiceId: inv } = await stripeWorld();
  const seen = new Set<string>();
  const event = evt("checkout.session.completed", { id: "cs_once", payment_intent: "pi_once", amount_total: 50_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_once");

  assert.equal((await reconcileStripeEventOnce(s, event, { seen })).action, "paid");
  assert.equal(seen.has("evt_once"), true, "a successful event IS marked processed");

  const second = await reconcileStripeEventOnce(s, event, { seen });
  assert.equal(second.action, "deduped", "the redelivery short-circuits on the cache");
  assert.equal((await s.payments.listForInvoice(inv)).length, 1, "still exactly one payment");
});

test("a redelivered refund does not log or emit twice (what the cache is really for)", async () => {
  const { world: w, services: s, invoiceId: inv } = await stripeWorld();
  const seen = new Set<string>();
  await reconcileStripeEventOnce(s, evt("checkout.session.completed", { id: "cs_r", payment_intent: "pi_r", amount_total: 50_000, currency: "gbp", metadata: { invoiceId: inv } }, "evt_pay_r"), { seen });

  const refund = evt("charge.refunded", { payment_intent: "pi_r", amount_refunded: 50_000 }, "evt_refund_r");
  await reconcileStripeEventOnce(s, refund, { seen });
  await reconcileStripeEventOnce(s, refund, { seen });   // Stripe redelivers

  const refundLogs = w.inspect.activityLog.filter(a => a.action === "payment.refunded");
  const refundEvents = w.inspect.events.filter(e => e.name === "agency-finance.payment.refunded");
  assert.equal(refundLogs.length, 1, "one refund, one activity entry");
  assert.equal(refundEvents.length, 1, "one refund, one emitted event");
});
