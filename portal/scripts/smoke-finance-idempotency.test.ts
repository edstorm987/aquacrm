// Finance — the shared money-CREATE idempotency guard (launch blocker).
//
// The bug (auditor, tick-19 + the cross-cutting finding): every money-creating
// path minted a fresh id per call, so a double-click / retry recorded a SECOND
// record → money-in silently double-counted (and close-deal double-billed).
//
// The fix, proven here: a client supplies a one-time idempotency key per intent;
// the record id is derived from it, so a resubmit lands on the SAME record. Two
// things must BOTH hold:
//   1. two rapid identical submits (sequential AND parallel) → exactly ONE record;
//   2. a genuine second/partial payment (a NEW key) on the same invoice → ALLOWED.
// Driven over the real Payment/Income services in an in-memory finance container.
// Record + surface only; the app never holds funds.

// First, and statically: this import installs the request-scope helpers
// before anything pulls in `next/`. See the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { createRequire } from "node:module";

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
import { deriveRecordId, normaliseIdempotencyKey } from "../src/built-ins/modules/agency-finance/src/lib/idempotency";

// The handlers below are not pure module code: each one asks the ACCESS KERNEL
// whether this caller may touch this client's `client.commercial` element, and
// the kernel reads the session from Next's request store. A bare handler call
// therefore runs with no request scope at all — `cookies()` throws, and (before
// the gate fix in handlers-r007.ts) that surfaced as a 400 rather than as the
// 401/403/500 it really was. A browser request always has a scope, so the
// honest fixture is to give these calls one too.
//
// That means the synthetic finance world and the portal store must agree on WHO
// the client is: the ids below are seeded from a real portal agency/client so
// the kernel can resolve the same client the finance container is holding.
let AGENCY_ID: AgencyId;
let CLIENT_ID: ClientId;
let ACTOR: UserId;
let OWNER_SESSION: string;

/** Run a handler the way the server does: inside this owner's request scope. */
const asOwner = <T>(fn: () => Promise<T>): Promise<T> => withSession(OWNER_SESSION, fn);

before(async () => {
  const { ensureHydrated } = await import("../src/server/storage");
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { createUser } = await import("../src/server/users");
  const { issueSession } = await import("../src/lib/server/auth/auth");

  await ensureHydrated();
  const agency = createAgency({ name: "Idem Smoke", slug: `idem-smoke-${Date.now()}` });
  const client = createClient(agency.id, { name: "Payer Ltd", slug: "payer" });
  const owner = createUser({
    email: `owner-${Date.now()}@idem.test`,
    name: "Idem Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "idem-smoke-pass-phrase",
  });

  AGENCY_ID = agency.id as AgencyId;
  CLIENT_ID = client.id as ClientId;
  ACTOR = owner.id as UserId;
  OWNER_SESSION = await issueSession({
    userId: owner.id, email: owner.email, role: "agency-owner",
    agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
});

function buildWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Idem Smoke", slug: "idem-smoke", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const client: Client = { id: CLIENT_ID, agencyId: AGENCY_ID, name: "Payer Ltd", slug: "payer", brand: { primaryColor: "#0af" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
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
    logActivity(input) { const entry = { id: `act_${actSeq++}`, ts: 0, ...input } as ActivityEntry; activityLog.push(entry); return entry; },
    listActivity() { return activityLog; },
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall(_s: PluginInstallScope, _p: string): PluginInstall | null { return null; } };
  return { storage, tenant, user, activity, events, pluginInstalls, activityLog };
}

let world: ReturnType<typeof buildWorld>;
let finance: ReturnType<typeof containerWithDeps>;

beforeEach(async () => {
  world = buildWorld();
  finance = containerWithDeps({ agencyId: AGENCY_ID, storage: world.storage, tenant: world.tenant, user: world.user, activity: world.activity, events: world.events, pluginInstalls: world.pluginInstalls });
});

// A fresh sent invoice big enough to take several partial payments.
async function seedInvoice(totalCents = 100_000): Promise<string> {
  const inv = await finance.invoices.create({ clientId: CLIENT_ID, dueAt: 1_800_000_000_000, lineItems: [{ description: "Retainer", quantity: 1, unitCents: totalCents }], currency: "gbp" }, ACTOR);
  await finance.invoices.update(inv.id, { status: "sent" }, ACTOR);
  return inv.id;
}

// ─── The shared derivation ───────────────────────────────────────────────────

test("deriveRecordId: same key → same id, different key → different id, no key → random", () => {
  assert.equal(deriveRecordId("pay", "k1"), deriveRecordId("pay", "k1"), "a key is a stable reference");
  assert.notEqual(deriveRecordId("pay", "k1"), deriveRecordId("pay", "k2"), "distinct intents get distinct ids");
  assert.notEqual(deriveRecordId("pay"), deriveRecordId("pay"), "no key = unchanged random behaviour");
  assert.match(deriveRecordId("pay", "k1"), /^pay_[0-9a-f]{32}$/, "prefix + 128-bit hex suffix");
  // Prefix-namespaced: the same key on two record kinds must not collide.
  assert.notEqual(deriveRecordId("inv", "same"), deriveRecordId("contract", "same"));
  // Blank / whitespace keys are treated as absent (no dedup).
  assert.equal(normaliseIdempotencyKey("   "), undefined);
  assert.equal(normaliseIdempotencyKey("  x "), "x");
});

// ─── Payments: the flagship double-count ─────────────────────────────────────

test("two rapid identical submits (SEQUENTIAL) record exactly one payment", async () => {
  const invoiceId = await seedInvoice();
  const input = { invoiceId, amountCents: 40_000, currency: "gbp" as const, method: "bank-transfer" as const, idempotencyKey: "submit-abc" };

  const first = await finance.payments.record(ACTOR, input);
  const second = await finance.payments.record(ACTOR, input);   // the double-click / retry

  assert.equal(second.deduped, true, "the resubmit is recognised as a duplicate");
  assert.equal(first.payment.id, second.payment.id, "it returns the very first payment");
  const payments = await finance.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1, "exactly ONE payment recorded");
  assert.equal(payments.reduce((s, p) => s + p.amountCents, 0), 40_000, "money-in counted once, not doubled");
});

test("two rapid identical submits (PARALLEL) still record exactly one payment", async () => {
  const invoiceId = await seedInvoice();
  const input = { invoiceId, amountCents: 40_000, currency: "gbp" as const, method: "cash" as const, idempotencyKey: "race-xyz" };

  // A true double-click: both requests in flight at once. Deterministic ids make
  // the second write an overwrite, not a duplicate row.
  await Promise.all([finance.payments.record(ACTOR, input), finance.payments.record(ACTOR, input)]);

  const payments = await finance.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1, "no double-count even under a parallel race");
  assert.equal(payments[0].amountCents, 40_000);
});

test("a genuine second / partial payment on the same invoice is ALLOWED (new key)", async () => {
  const invoiceId = await seedInvoice(100_000);
  // Two legitimate partial payments of the SAME amount — different intents, so
  // different keys. These must NOT be merged.
  const a = await finance.payments.record(ACTOR, { invoiceId, amountCents: 50_000, currency: "gbp", method: "cash", idempotencyKey: "instalment-1" });
  const b = await finance.payments.record(ACTOR, { invoiceId, amountCents: 50_000, currency: "gbp", method: "cash", idempotencyKey: "instalment-2" });

  assert.equal(a.deduped, false);
  assert.equal(b.deduped, false);
  assert.notEqual(a.payment.id, b.payment.id, "two distinct partial payments");
  const payments = await finance.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 2, "both partials recorded");
  assert.equal(payments.reduce((s, p) => s + p.amountCents, 0), 100_000);
  // And the second one settles the now-fully-paid invoice.
  assert.equal(b.settled, true, "reaching the total settles the invoice");
  assert.equal((await finance.invoices.get(invoiceId))?.status, "paid");
});

test("without an idempotency key behaviour is unchanged — two records (dedup is opt-in)", async () => {
  const invoiceId = await seedInvoice(200_000);
  await finance.payments.record(ACTOR, { invoiceId, amountCents: 30_000, currency: "gbp", method: "bank-transfer" });
  await finance.payments.record(ACTOR, { invoiceId, amountCents: 30_000, currency: "gbp", method: "bank-transfer" });
  const payments = await finance.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 2, "no key → each call is its own record, exactly as before");
});

// ─── Income: the same guard, same shape ──────────────────────────────────────

test("non-invoice income dedups on the key too; a different key records a second entry", async () => {
  const key = "income-intent-1";
  const first = await finance.income.create(ACTOR, { title: "Consulting day", amountCents: 25_000, method: "bank-transfer", idempotencyKey: key });
  const dup = await finance.income.create(ACTOR, { title: "Consulting day", amountCents: 25_000, method: "bank-transfer", idempotencyKey: key });
  assert.equal(first.id, dup.id, "resubmit returns the first income entry");
  assert.equal((await finance.income.list()).length, 1, "one income entry after a double-submit");

  await finance.income.create(ACTOR, { title: "Consulting day", amountCents: 25_000, method: "bank-transfer", idempotencyKey: "income-intent-2" });
  assert.equal((await finance.income.list()).length, 2, "a genuinely separate income entry is allowed");
});

// ─── "Mark invoice paid": the second residual no-key path ────────────────────
//
// `markInvoicePaidHandler` records the OUTSTANDING BALANCE as a payment. Its
// only guard was a balance read (`paidCents >= totalCents → return early`) —
// a check-then-write, so two concurrent double-clicks (or two admins hitting it
// at once) both read "nothing paid yet" and both record the full balance →
// money-in doubled on Ed's books.
//
// The fix under test: the handler supplies a SERVER-derived key,
// `settle:<invoiceId>`. "Settle this invoice" is one intent per invoice, so the
// key is stable and nothing in the UI has to remember to pass it. Genuine
// partial payments come in through `payments/create` with their own per-submit
// key and are untouched — proven below in both directions.
//
// Driven through the REAL handler, over a storage with REAL latency (see
// `racingWorld`) — without that the race can't be reproduced in one process and
// the test would pass on the broken code.

import { registerAgencyFinanceFoundation } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { markInvoicePaidHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers";
import type { PluginCtx } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";

// Why this exists: in ONE Node process, `Promise.all([handler(), handler()])`
// does not actually interleave — `req.json()` is a macrotask, and everything
// after it is microtasks, so the first call runs to completion before the
// second resumes. That hides the very bug we're guarding against. A server
// under real concurrency has no such barrier: two requests (two instances, or
// two connections) each sit on real storage I/O between their read and their
// write. Putting a macrotask on every storage op restores that window, so this
// test reproduces the true server-side race rather than a serialised imitation.
function racingWorld() {
  const base = buildWorld();
  const stall = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { await stall(); return base.storage.get<T>(key); },
    async set<T = unknown>(key: string, value: T): Promise<void> { await stall(); return base.storage.set<T>(key, value); },
    async del(key: string): Promise<void> { await stall(); return base.storage.del(key); },
    async list(prefix?: string): Promise<string[]> { await stall(); return base.storage.list(prefix); },
  };
  const w = { ...base, storage };
  // The handler builds its container through the registered foundation, so give
  // it this world. Registration is module-global; each test file runs in its own
  // process and nothing else here registers, so this stays hermetic.
  registerAgencyFinanceFoundation({ tenant: w.tenant, user: w.user, activity: w.activity, events: w.events, pluginInstalls: w.pluginInstalls });
  const services = containerWithDeps({ agencyId: AGENCY_ID, storage: w.storage, tenant: w.tenant, user: w.user, activity: w.activity, events: w.events, pluginInstalls: w.pluginInstalls });
  const ctx = { agencyId: AGENCY_ID, storage: w.storage, actor: ACTOR } as unknown as PluginCtx;
  return { services, ctx, storage: w.storage };
}

async function seedIn(services: ReturnType<typeof containerWithDeps>, totalCents: number): Promise<string> {
  const inv = await services.invoices.create({ clientId: CLIENT_ID, dueAt: 1_800_000_000_000, lineItems: [{ description: "Retainer", quantity: 1, unitCents: totalCents }], currency: "gbp" }, ACTOR);
  await services.invoices.update(inv.id, { status: "sent" }, ACTOR);
  return inv.id;
}

// Through the real handler, in a real request scope — the client-element gate
// inside it reads the session, so a bare call would never reach the code under
// test.
const markPaid = (ctx: PluginCtx, invoiceId: string, body: Record<string, unknown> = {}): Promise<Response> =>
  asOwner(() => markInvoicePaidHandler(
    new Request("http://localhost/invoices/mark-paid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invoiceId, ...body }) }),
    ctx,
  ));

test("two CONCURRENT mark-paid clicks record exactly one settling payment", async () => {
  const { services, ctx } = racingWorld();
  const invoiceId = await seedIn(services, 100_000);

  // A real double-click: both requests in flight, both read paidCents = 0, so
  // the balance guard alone lets both through. Only the derived id saves it.
  const responses = await Promise.all([markPaid(ctx, invoiceId), markPaid(ctx, invoiceId)]);
  assert.ok(responses.every(r => r.ok), "both requests succeed (the user sees no error)");

  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1, "exactly ONE payment, not two");
  assert.equal(payments.reduce((s, p) => s + p.amountCents, 0), 100_000, "the invoice total is banked once, not doubled");
  assert.equal(payments[0].id, deriveRecordId("pay", `settle:${invoiceId}`), "the settle intent is the idempotency key");
  assert.equal((await services.invoices.get(invoiceId))?.status, "paid");
});

test("five CONCURRENT mark-paid clicks still record exactly one settling payment", async () => {
  const { services, ctx } = racingWorld();
  const invoiceId = await seedIn(services, 60_000);

  await Promise.all(Array.from({ length: 5 }, () => markPaid(ctx, invoiceId)));

  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1, "a fistful of double-clicks is still one payment");
  assert.equal(payments.reduce((s, p) => s + p.amountCents, 0), 60_000, "money-in counted once, not 5x");
});

test("repeated mark-paid clicks (sequential) also stay at one payment", async () => {
  const { services, ctx } = racingWorld();
  const invoiceId = await seedIn(services, 80_000);

  await markPaid(ctx, invoiceId);
  await markPaid(ctx, invoiceId);   // second click, invoice already settled
  await markPaid(ctx, invoiceId);

  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 1, "the balance guard and the key both hold");
  assert.equal(payments[0].amountCents, 80_000);
});

test("mark-paid settles only the REMAINING balance after a genuine partial payment", async () => {
  // The nuance: a real £400 part-payment lands first (its own submit key), then
  // Ed marks the invoice paid. Two payments must exist and they must sum to the
  // total — the dedup must not swallow the partial, nor re-bank the whole £1,000.
  const { services, ctx } = racingWorld();
  const invoiceId = await seedIn(services, 100_000);

  await services.payments.record(ACTOR, { invoiceId, amountCents: 40_000, currency: "gbp", method: "bank-transfer", idempotencyKey: "part-1" });
  const response = await markPaid(ctx, invoiceId, { paidVia: "cash" });
  assert.ok(response.ok);

  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 2, "the genuine partial AND the settling payment both stand");
  assert.equal(payments.reduce((s, p) => s + p.amountCents, 0), 100_000, "no over-banking, no double-count");
  assert.equal(payments.find(p => p.method === "cash")?.amountCents, 60_000, "only the remaining balance is settled");
  assert.equal((await services.invoices.get(invoiceId))?.status, "paid");
});

test("two DIFFERENT invoices settled concurrently: neither payment goes missing", async () => {
  // The other half of the concurrency story, and the one this suite found by
  // accident: the key is per-invoice, so these two are correctly NOT deduped —
  // but they then raced to append to the shared `payments/index` array, and the
  // second write clobbered the first. The payment was stored yet invisible to
  // money-in: a payment silently off the books. `PaymentService.list` now unions
  // the index with a prefix scan of the rows (the idiom expenses/operations
  // already use), so a lost index slot can't hide real money.
  const { services, ctx } = racingWorld();
  const a = await seedIn(services, 30_000);
  const b = await seedIn(services, 70_000);

  await Promise.all([markPaid(ctx, a), markPaid(ctx, b)]);

  assert.equal((await services.payments.listForInvoice(a)).length, 1, "invoice A's payment is on the books");
  assert.equal((await services.payments.listForInvoice(b)).length, 1, "invoice B's payment is on the books");
  assert.equal((await services.payments.list()).reduce((s, p) => s + p.amountCents, 0), 100_000, "both invoices banked in full — nothing lost, nothing doubled");
});

// ─── The other half of concurrency: a record that goes MISSING ───────────────
//
// Idempotency stops the same intent being recorded twice. This is the opposite
// failure, and it lives in the same place: every store keeps an `<area>/index`
// array beside its `<area>/by-id/<id>` rows, and appending to that array is a
// read-modify-write. Two records created CONCURRENTLY both read the same array
// and the second write wins — one id is lost and its row, though stored, is
// invisible to `list()`. Money quietly under-counts, and (as the Stripe test
// showed) it can even MASK a double-count by collapsing three rows into one.
//
// `server/rowIndex.ts` `listRowIds` makes reads union the index with a prefix
// scan of the rows, so the index is a fast path, not the source of truth. These
// tests pin that for each money store — over `racingWorld()`, because without
// real storage latency the writes serialise and every one of them passes on the
// broken code.

test("two invoices created concurrently: both are listed, agency-wide AND on the client", async () => {
  const { services } = racingWorld();
  const line = (unitCents: number) => [{ description: "Work", quantity: 1, unitCents }];

  const created = await Promise.all([
    services.invoices.create({ clientId: CLIENT_ID, dueAt: 1_800_000_000_000, lineItems: line(10_000), currency: "gbp" }, ACTOR),
    services.invoices.create({ clientId: CLIENT_ID, dueAt: 1_800_000_000_000, lineItems: line(20_000), currency: "gbp" }, ACTOR),
  ]);

  assert.notEqual(created[0].number, created[1].number, "distinct concurrent invoices reserve distinct human numbers");
  const all = await services.invoices.list();
  assert.equal(all.length, 2, "neither invoice fell out of the agency list");
  assert.equal(all.reduce((s, i) => s + i.totalCents, 0), 30_000, "the full amount is on the books");
  // The client tab reads its own index — the more confusing place to lose one.
  assert.equal((await services.invoices.listForClient(CLIENT_ID)).length, 2, "and both show on the client's own tab");
});

test("the same invoice intent adopts one row and does not burn another number", async () => {
  const { services } = racingWorld();
  const input = {
    clientId: CLIENT_ID,
    issuedAt: Date.parse("2026-08-26T09:00:00Z"),
    dueAt: Date.parse("2026-09-09T09:00:00Z"),
    lineItems: [{ description: "Retry-safe work", quantity: 1, unitCents: 30_000 }],
    currency: "gbp" as const,
    idempotencyKey: "invoice-form-operation-1",
  };

  const [first, retry] = await Promise.all([
    services.invoices.create(input, ACTOR),
    services.invoices.create(input, ACTOR),
  ]);
  assert.equal(retry.id, first.id);
  assert.equal(retry.number, first.number);
  assert.equal((await services.invoices.list()).length, 1);

  const next = await services.invoices.create({ ...input, idempotencyKey: "invoice-form-operation-2" }, ACTOR);
  assert.equal(Number(next.number.slice(-4)), Number(first.number.slice(-4)) + 1, "the retry did not consume a sequence slot");
});

test("two income entries recorded concurrently: neither is lost", async () => {
  const { services } = racingWorld();

  await Promise.all([
    services.income.create(ACTOR, { title: "Consulting", amountCents: 25_000, method: "bank-transfer", idempotencyKey: "inc-a" }),
    services.income.create(ACTOR, { title: "Workshop", amountCents: 15_000, method: "cash", idempotencyKey: "inc-b" }),
  ]);

  const rows = await services.income.list();
  assert.equal(rows.length, 2, "both income entries are listed");
  assert.equal(rows.reduce((s, r) => s + r.amountCents, 0), 40_000, "money-in counted in full");
});

test("two plans created concurrently: neither is lost", async () => {
  const { services } = racingWorld();

  await Promise.all([
    services.plans.create(ACTOR, { tier: "starter", label: "Starter", monthlyAmountCents: 20_000, idempotencyKey: "plan-a" }),
    services.plans.create(ACTOR, { tier: "growth", label: "Growth", monthlyAmountCents: 50_000, idempotencyKey: "plan-b" }),
  ]);

  const plans = await services.plans.list();
  assert.equal(plans.length, 2, "both plans are listed");
  assert.deepEqual(plans.map(p => p.label), ["Growth", "Starter"], "ordering (by amount desc) is unchanged");
});

test("the index stays the fast path — a healthy store lists exactly once, in order", async () => {
  // Guard against the scan double-counting or reordering when nothing raced:
  // sequential creates must behave exactly as they always did.
  const { services } = racingWorld();
  const a = await services.income.create(ACTOR, { title: "First", amountCents: 1_000, method: "cash", receivedAt: 1_000 });
  const b = await services.income.create(ACTOR, { title: "Second", amountCents: 2_000, method: "cash", receivedAt: 2_000 });

  const rows = await services.income.list();
  assert.equal(rows.length, 2, "no duplicates from unioning the index with the scan");
  assert.deepEqual(rows.map(r => r.id), [b.id, a.id], "newest-first ordering is unchanged");
});

// ─── Payroll: the last create-surface path with a guard but no key ───────────
//
// The audit asked whether `plans.create` and `createCompensationPayment` had a
// server guard that nothing supplied a key for. They did — the guard was dead
// code. A double-clicked "Record people payment" recorded the salary or
// freelancer invoice twice, which then double-counts through the people-cost
// projections and eats a budget pot twice. The payroll modal now mints one key
// per opened form (`FinanceOperationsWorkspace.tsx`), same as the payment and
// income modals. Proven here at the service the modal posts to.

async function payrollProfile(services: ReturnType<typeof containerWithDeps>): Promise<string> {
  const profile = await services.operations.createCompensationProfile(ACTOR, {
    name: "Sam Contractor", payeeType: "freelancer", currency: "gbp",
    rateBasis: "daily", baseRateCents: 40_000, employerCostPercent: 0,
    annualBonusTargetCents: 0,
  });
  return profile.id;
}

test("a double-clicked payroll payment records ONCE; a genuinely separate one still records", async () => {
  const { services } = racingWorld();
  const profileId = await payrollProfile(services);
  const input = { profileId, kind: "freelancer-invoice" as const, grossCents: 120_000, dueAt: 1_800_000_000_000, idempotencyKey: "payroll-submit-1" };

  const first = await services.operations.createCompensationPayment(ACTOR, input);
  const second = await services.operations.createCompensationPayment(ACTOR, input);   // the double-click
  assert.equal(first.id, second.id, "the resubmit returns the first payment");
  assert.equal((await services.operations.listCompensationPayments()).length, 1, "one payment, not two");

  // Next month's invoice is a new intent — a new key — and must still record.
  await services.operations.createCompensationPayment(ACTOR, { ...input, idempotencyKey: "payroll-submit-2" });
  const all = await services.operations.listCompensationPayments();
  assert.equal(all.length, 2, "a genuinely separate payroll payment is allowed");
  assert.equal(all.reduce((s, p) => s + p.grossCents, 0), 240_000, "and both count toward people cost");
});

test("payroll payments created concurrently under different keys are both listed", async () => {
  const { services } = racingWorld();
  const profileId = await payrollProfile(services);
  const base = { profileId, kind: "salary" as const, grossCents: 50_000, dueAt: 1_800_000_000_000 };

  await Promise.all([
    services.operations.createCompensationPayment(ACTOR, { ...base, idempotencyKey: "pay-a" }),
    services.operations.createCompensationPayment(ACTOR, { ...base, idempotencyKey: "pay-b" }),
  ]);

  assert.equal((await services.operations.listCompensationPayments()).length, 2, "neither lost to an index race");
});

test("recording a payment writes only the row + the index — no unread secondary indexes", async () => {
  // `payments/by-invoice/` and `payments/by-client/` were maintained on every
  // record and read by nothing. This pins them gone: they were four storage ops
  // and two more read-modify-writes per payment, each its own lost-update risk.
  const { services, storage } = racingWorld();
  const invoiceId = await seedIn(services, 50_000);
  await services.payments.record(ACTOR, { invoiceId, amountCents: 50_000, currency: "gbp", method: "cash", idempotencyKey: "one" });

  const keys = await storage.list("payments/");
  assert.deepEqual(
    [...new Set(keys.map(k => k.split("/").slice(0, 2).join("/")))].sort(),
    ["payments/by-id", "payments/index"],
    "only the row store and the index — nothing unread being maintained",
  );
  // And the payment is still fully reachable by every query that matters.
  assert.equal((await services.payments.listForInvoice(invoiceId)).length, 1);
  assert.equal((await services.payments.list({ clientId: CLIENT_ID })).length, 1);
});

// ─── Plans: the create form that could never create anything ─────────────────
//
// `PlansPage` shipped a native `<form action=".../plans/create" method="post">`
// inside a server component. A native submit sends
// `application/x-www-form-urlencoded`; `createPlanHandler` reads the body with
// `req.json()`, which throws on that encoding — so `safeJson` returned null and
// EVERY plan creation answered 400 `invalid_body`. A finished-looking page that
// could not create a single plan, and the reason it was never noticed is that
// nothing exercised the endpoint the way the form actually called it.
//
// The form is now a client component posting JSON (`components/NewPlanForm.tsx`)
// and carrying the key `plans.create`'s existing guard was already waiting for.
// These tests pin both halves: the endpoint's real contract, and that the broken
// transport can't come back anywhere in this plugin.

import { createPlanHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers-r007";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const planRequest = (body: BodyInit, headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/plans/create", { method: "POST", headers, body });

test("plans/create rejects a form-encoded body and accepts JSON — the exact bug the page had", async () => {
  const { ctx } = racingWorld();
  const fields = { tier: "growth", label: "Growth", monthlyAmountCents: "50000", lockInMonths: "0", lockInFeeCents: "0" };

  // What the old native <form method="post"> actually sent.
  const formPost = await createPlanHandler(planRequest(new URLSearchParams(fields)), ctx);
  assert.equal(formPost.status, 400, "a form-encoded submit is rejected — this is why no plan could ever be created");

  // What the client form sends now.
  const jsonPost = await createPlanHandler(
    planRequest(JSON.stringify({ ...fields, monthlyAmountCents: 50_000, lockInMonths: 0, lockInFeeCents: 0, idempotencyKey: "plan-form-1" }), { "content-type": "application/json" }),
    ctx,
  );
  assert.equal(jsonPost.status, 201, "the JSON submit creates the plan");
  const created = await jsonPost.json() as { ok: boolean; plan: { label: string; monthlyAmountCents: number } };
  assert.equal(created.ok, true);
  assert.equal(created.plan.label, "Growth");
  assert.equal(created.plan.monthlyAmountCents, 50_000, "the amount survives the round-trip");
});

test("a double-clicked 'Create plan' makes ONE plan; a new intent makes another", async () => {
  const { services, ctx } = racingWorld();
  const body = (key: string) => JSON.stringify({ tier: "scale", label: "Scale", monthlyAmountCents: 90_000, idempotencyKey: key });
  const json = { "content-type": "application/json" };

  await createPlanHandler(planRequest(body("plan-key-1"), json), ctx);
  await createPlanHandler(planRequest(body("plan-key-1"), json), ctx);   // the double-click
  assert.equal((await services.plans.list(true)).length, 1, "the guard the UI never fed is finally doing its job");

  await createPlanHandler(planRequest(body("plan-key-2"), json), ctx);
  assert.equal((await services.plans.list(true)).length, 2, "a genuinely new plan is still allowed");
});

test("no page in the finance plugin posts a native form into a JSON handler", async () => {
  // The regression guard is for the CLASS, not the one page: every finance API
  // handler parses with `req.json()`, so any `<form method="post">` aimed at one
  // is broken on arrival — and it fails silently, as a 400 the user reads as a
  // validation error.
  const root = "src/built-ins/modules/agency-finance/src";
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".tsx") ? [full] : [];
  });

  // Comments are stripped first: NewPlanForm.tsx quotes the old broken markup in
  // its own explanation of the bug, and a guard that trips on the description of
  // a fixed bug is a guard people learn to ignore.
  const code = (file: string): string => readFileSync(file, "utf8")
    .split("\n").filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");

  const offenders = walk(root).filter(file => /<form[^>]*\bmethod=["{]?["']?post/i.test(code(file)));
  assert.deepEqual(offenders, [], "a native form POST cannot reach these JSON handlers — submit with fetch instead");
});

// ─── The class, finished: every finance store reads index ∪ rows ─────────────

test("expenses and categories created concurrently are all listed, and by category too", async () => {
  const { services } = racingWorld();
  const category = await services.categories.create({ name: "Software" }, ACTOR);

  await Promise.all([
    services.expenses.create({ categoryId: category.id, amountCents: 12_000, currency: "gbp", description: "Editor", incurredAt: 1_700_000_000_000 }, ACTOR),
    services.expenses.create({ categoryId: category.id, amountCents: 8_000, currency: "gbp", description: "Hosting", incurredAt: 1_700_000_000_000 }, ACTOR),
  ]);

  const all = await services.expenses.list();
  assert.equal(all.length, 2, "neither expense lost to an index race");
  assert.equal(all.reduce((s, e) => s + e.amountCents, 0), 20_000, "money-out counted in full");
  // `listForCategory` now filters through `list()` instead of its own array.
  assert.equal((await services.expenses.listForCategory(category.id)).length, 2, "and both show under their category");
});

test("recording an expense writes only the row + the index — no unread secondary indexes", async () => {
  const { services, storage } = racingWorld();
  const category = await services.categories.create({ name: "Travel" }, ACTOR);
  await services.expenses.create({ categoryId: category.id, amountCents: 5_000, currency: "gbp", description: "Train", incurredAt: 1_700_000_000_000 }, ACTOR);

  const areas = [...new Set((await storage.list("expenses/")).map(k => k.split("/").slice(0, 2).join("/")))].sort();
  assert.deepEqual(areas, ["expenses/by-id", "expenses/index"], "by-category and by-staff are gone — nothing read them");
});

// ─── Expenses: the money-OUT mirror of the flagship double-count ─────────────
//
// Money-in was guarded on 2026-08-19; expenses were the one create-surface left
// minting `makeId("exp")` unconditionally. The failure: an operator double-clicks
// "Add expense" on a £2,400 contractor bill, two rows land, and P&L, budget-pot
// burn and every margin derived from them are wrong by £2,400 with no visible
// duplicate warning. Same shared helper, same opt-in semantics — and the same
// nuance, which for expenses is sharper than for payments: two receipts at the
// IDENTICAL amount on the same day are routinely both real.

import { createExpenseHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers";
import { createPaymentHandler, createIncomeHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers-r007";

async function expenseCategory(services: ReturnType<typeof containerWithDeps>, name = "Contractors"): Promise<string> {
  return (await services.categories.create({ name }, ACTOR)).id;
}

test("a double-clicked expense records ONCE", async () => {
  // The plain (non-racing) world here, so `world.activityLog` is the log these
  // writes actually go to.
  const services = finance;
  const categoryId = await expenseCategory(services);
  const input = { categoryId, amountCents: 240_000, currency: "gbp" as const, vendor: "Contractor Ltd", incurredAt: 1_700_000_000_000, idempotencyKey: "expense-submit-1" };

  const first = await services.expenses.createDetailed(input, ACTOR);
  const second = await services.expenses.createDetailed(input, ACTOR);   // the double-click

  assert.equal(second.deduped, true, "the resubmit is recognised as a duplicate");
  assert.equal(first.deduped, false, "the first submit is not");
  assert.equal(first.expense.id, second.expense.id, "it returns the very first expense");

  const all = await services.expenses.list();
  assert.equal(all.length, 1, "exactly ONE expense recorded");
  assert.equal(all.reduce((sum, e) => sum + e.amountCents, 0), 240_000, "money-out counted once, not doubled");
  // And nothing was re-logged, so the activity feed doesn't show a phantom
  // second submission either.
  assert.equal(world.activityLog.filter(entry => entry.action === "expense.created").length, 1, "logged once");
});

test("a genuinely separate expense with a NEW key still records — even at the same amount", async () => {
  // The hard case, and the reason a content-hash "fix" would be wrong: two £50
  // taxi receipts on the same day are two real expenses.
  const { services } = racingWorld();
  const categoryId = await expenseCategory(services, "Travel");
  const base = { categoryId, amountCents: 5_000, currency: "gbp" as const, vendor: "Taxi", incurredAt: 1_700_000_000_000 };

  const a = await services.expenses.createDetailed({ ...base, idempotencyKey: "taxi-morning" }, ACTOR);
  const b = await services.expenses.createDetailed({ ...base, idempotencyKey: "taxi-evening" }, ACTOR);

  assert.equal(a.deduped, false);
  assert.equal(b.deduped, false);
  assert.notEqual(a.expense.id, b.expense.id, "two distinct expenses");
  const all = await services.expenses.list();
  assert.equal(all.length, 2, "both receipts recorded");
  assert.equal(all.reduce((sum, e) => sum + e.amountCents, 0), 10_000, "identical amounts are NOT merged");
});

test("a parallel double-submit of the same expense records ONCE", async () => {
  // `racingWorld` puts real latency on every storage op — without it the two
  // creates serialise and this passes on the broken code.
  const { services } = racingWorld();
  const categoryId = await expenseCategory(services);
  const input = { categoryId, amountCents: 240_000, currency: "gbp" as const, vendor: "Contractor Ltd", incurredAt: 1_700_000_000_000, idempotencyKey: "expense-race" };

  const [a, b] = await Promise.all([
    services.expenses.createDetailed(input, ACTOR),
    services.expenses.createDetailed(input, ACTOR),
  ]);
  // Both raced past the fast-path read; the derived id is what collapses them.
  assert.equal(a.deduped, false);
  assert.equal(b.deduped, false);

  const all = await services.expenses.list();
  assert.equal(all.length, 1, "no double-count even under a parallel race");
  assert.equal(all[0].amountCents, 240_000, "£2,400 counted once");
  assert.equal(all[0].id, deriveRecordId("exp", "expense-race"), "both writes landed on the derived id");
});

test("without an expense key behaviour is unchanged — two records (dedup is opt-in)", async () => {
  const { services } = racingWorld();
  const categoryId = await expenseCategory(services, "Software");
  const input = { categoryId, amountCents: 12_000, currency: "gbp" as const, description: "Editor", incurredAt: 1_700_000_000_000 };

  await services.expenses.create(input, ACTOR);
  await services.expenses.create(input, ACTOR);

  assert.equal((await services.expenses.list()).length, 2, "no key → each call is its own record, exactly as before");
});

test("expenses.create still returns the plain expense every existing caller expects", async () => {
  // `create` is called from recurring posting, the delight wire and the plugin's
  // own smoke suite; its shape must not change with the added guard.
  const { services } = racingWorld();
  const categoryId = await expenseCategory(services, "Subscriptions");
  const row = await services.expenses.create({ categoryId, amountCents: 9_900, currency: "gbp", incurredAt: 1_700_000_000_000, idempotencyKey: "shape-check" }, ACTOR);
  assert.equal(row.amountCents, 9_900);
  assert.equal(row.status, "pending");
  assert.equal(row.id, deriveRecordId("exp", "shape-check"));
  // And a resubmit through `create` gets the first row back, not a second one.
  const again = await services.expenses.create({ categoryId, amountCents: 9_900, currency: "gbp", incurredAt: 1_700_000_000_000, idempotencyKey: "shape-check" }, ACTOR);
  assert.equal(again.id, row.id);
  assert.equal((await services.expenses.list()).length, 1);
});

// ─── The handlers: the hop the UI actually posts through ─────────────────────
//
// The service guards above are only worth anything if the key survives the HTTP
// boundary. These three forwards were source-shape-only until now — a dropped
// or renamed field would have gone unnoticed by every test in this file.

const jsonPost = (path: string, body: unknown): Request =>
  new Request(`http://localhost/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// These three handlers resolve the agency's default currency off the install
// record, so the ctx needs one (the mark-paid handler above does not).
const withInstall = (ctx: PluginCtx): PluginCtx => ({
  ...ctx,
  install: { id: "install_idem_smoke", config: { defaultCurrency: "gbp", ukDefaultCurrencyV1: true } },
} as unknown as PluginCtx);

test("the expense create HANDLER dedups a double-clicked submit", async () => {
  const { services, ctx } = racingWorld();
  const httpCtx = withInstall(ctx);
  const categoryId = await expenseCategory(services);
  const body = { categoryId, amountCents: 240_000, currency: "gbp", vendor: "Contractor Ltd", incurredAt: 1_700_000_000_000, idempotencyKey: "handler-expense-1" };

  const first = await asOwner(() => createExpenseHandler(jsonPost("expenses", body), httpCtx));
  const second = await asOwner(() => createExpenseHandler(jsonPost("expenses", body), httpCtx));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201, "the second click is not an error the user has to interpret");

  const firstBody = await first.json() as { expense: { id: string }; deduped: boolean };
  const secondBody = await second.json() as { expense: { id: string }; deduped: boolean };
  assert.equal(firstBody.deduped, false);
  assert.equal(secondBody.deduped, true, "the handler reports the resubmit honestly");
  assert.equal(firstBody.expense.id, secondBody.expense.id, "and returns the first expense");
  assert.equal((await services.expenses.list()).length, 1, "ONE expense — the key survived the handler boundary");

  // A genuinely new intent through the same handler is still recorded.
  await asOwner(() => createExpenseHandler(jsonPost("expenses", { ...body, idempotencyKey: "handler-expense-2" }), httpCtx));
  const all = await services.expenses.list();
  assert.equal(all.length, 2, "a second contractor bill is not swallowed");
  assert.equal(all.reduce((sum, e) => sum + e.amountCents, 0), 480_000);
});

test("the payment create HANDLER dedups a double-clicked submit", async () => {
  const { services, ctx } = racingWorld();
  const httpCtx = withInstall(ctx);
  const invoiceId = await seedIn(services, 200_000);
  const body = { invoiceId, amountCents: 50_000, currency: "gbp", method: "bank-transfer", idempotencyKey: "handler-pay-1" };

  const first = await asOwner(() => createPaymentHandler(jsonPost("payments/create", body), httpCtx));
  const second = await asOwner(() => createPaymentHandler(jsonPost("payments/create", body), httpCtx));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal((await (second.json() as Promise<{ deduped: boolean }>)).deduped, true);
  assert.equal((await services.payments.listForInvoice(invoiceId)).length, 1, "ONE payment through the handler");

  // A genuine second partial payment (new key) still goes through.
  await asOwner(() => createPaymentHandler(jsonPost("payments/create", { ...body, idempotencyKey: "handler-pay-2" }), httpCtx));
  const payments = await services.payments.listForInvoice(invoiceId);
  assert.equal(payments.length, 2, "partial payments stay legal over HTTP");
  assert.equal(payments.reduce((sum, p) => sum + p.amountCents, 0), 100_000);
});

test("the income create HANDLER dedups a double-clicked submit", async () => {
  const { services, ctx } = racingWorld();
  const httpCtx = withInstall(ctx);
  const body = { title: "Consulting day", amountCents: 25_000, currency: "gbp", method: "bank-transfer", idempotencyKey: "handler-income-1" };

  const first = await asOwner(() => createIncomeHandler(jsonPost("income", body), httpCtx));
  const second = await asOwner(() => createIncomeHandler(jsonPost("income", body), httpCtx));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const firstBody = await first.json() as { income: { id: string } };
  const secondBody = await second.json() as { income: { id: string } };
  assert.equal(firstBody.income.id, secondBody.income.id, "the resubmit returns the first entry");
  assert.equal((await services.income.list()).length, 1, "ONE income entry through the handler");

  await asOwner(() => createIncomeHandler(jsonPost("income", { ...body, idempotencyKey: "handler-income-2" }), httpCtx));
  const all = await services.income.list();
  assert.equal(all.length, 2, "a genuinely separate consulting day is still recorded");
  assert.equal(all.reduce((sum, e) => sum + e.amountCents, 0), 50_000);
});
