// Close-deal HTTP route smoke — `POST /api/tenants/close-deal`.
//
// Why this file exists: the orchestration underneath (`lib/server/closeDeal`)
// is well tested, but the HTTP layer the browser actually clicks
// (`_FinanceTabClient.tsx` → this route) had ZERO coverage. That layer is where
// the idempotency key can be silently dropped or mis-forwarded at the boundary
// — and if it is, a double-clicked "Close the deal" bills the client twice
// while the suite stays green, because nothing drives the route.
//
// So this drives the REAL exported `POST` in-process (the runtime-verify
// convention: a minted session + a NextRequest), against a memory backend and
// a real agency-finance install. No behaviour change is intended here; this is
// the missing proof.
//
// Money note: bank-transfer channel throughout. `stripe` is not a dependency of
// this repo, so no card path is exercised (and none is needed — the manual
// channels are the ones that record + route without any pay-link).

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "close-deal-route-smoke-secret";

// First, and statically: this import installs the request-scope helpers before
// anything pulls in `next/`. See the note in dev-console-request-scope.ts.
import { withRequestScope, withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── The one piece of rigging ────────────────────────────────────────────────
//
// This route authenticates with `requireRoleForClient` → `getSession()` →
// `cookies()` from `next/headers`, which throws "called outside a request
// scope" when a handler is invoked in-process.
//
// This file used to stub the whole `next/headers` module with a cookie jar of
// its own, on the stated grounds that "nothing in this repo rigs Next's request
// async-context for tests". That stopped being true: `dev-console-request-scope`
// does exactly that, and ~25 files use it. Worse, a module stub is not a request
// scope — `getSession()` now also resolves the session's live user and the data
// realm from the REAL request store, so the stub answered the cookie question
// and silently failed the realm one, and every authenticated case here 401'd.
//
// So: one rig, the shared one. Everything else — the route, auth's HMAC verify,
// the role gate, the real stores, the real finance container — is shipped code.

// ─── Real storage latency ────────────────────────────────────────────────────
//
// In ONE Node process, `Promise.all([POST(), POST()])` does not actually
// interleave: `request.json()` is a macrotask, and everything after it is
// microtasks, so the first call runs to completion before the second resumes.
// That would hide the very race the parallel test is for. A server under real
// concurrency has no such barrier — two requests each sit on real storage I/O
// between their read and their write. `makePluginStorage` is wrapped here to put
// a macrotask on every storage op, which restores that window. `storageOps`
// proves the wrapper is genuinely on the path the route uses.
const pluginStorageId = require.resolve("../src/lib/server/pluginStorage");
const realPluginStorage = require("../src/lib/server/pluginStorage") as typeof import("../src/lib/server/pluginStorage");
const stall = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
let storageOps = 0;
require.cache[pluginStorageId]!.exports = {
  makePluginStorage(installId: string) {
    const inner = realPluginStorage.makePluginStorage(installId);
    return {
      async get<T = unknown>(key: string): Promise<T | undefined> { storageOps++; await stall(); return inner.get<T>(key); },
      async set<T = unknown>(key: string, value: T): Promise<void> { storageOps++; await stall(); return inner.set<T>(key, value); },
      async del(key: string): Promise<void> { storageOps++; await stall(); return inner.del(key); },
      async list(prefix?: string): Promise<string[]> { storageOps++; await stall(); return inner.list(prefix); },
    };
  },
};

// Loaded with `require` rather than `import` on purpose: these must be pulled in
// AFTER the stubs above are in place, and this file is transpiled to CJS (where
// `import` statements hoist to the top and would beat them).
const { NextRequest } = require("next/server") as typeof import("next/server");
const { POST } = require("../src/app/api/tenants/close-deal/route") as typeof import("../src/app/api/tenants/close-deal/route");
const { issueSession } = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const { ensureHydrated } = require("../src/server/storage") as typeof import("../src/server/storage");
const { createAgency, createClient, getClientForAgency } = require("../src/server/tenants") as typeof import("../src/server/tenants");
const { upsertInstall, deleteInstall } = require("../src/server/pluginInstalls") as typeof import("../src/server/pluginInstalls");
const { createUser } = require("../src/server/users") as typeof import("../src/server/users");
const { makePluginStorage } = require("../src/lib/server/pluginStorage") as typeof import("../src/lib/server/pluginStorage");
const { containerFor } = require("../src/built-ins/modules/agency-finance/src/server/foundationAdapter") as typeof import("../src/built-ins/modules/agency-finance/src/server/foundationAdapter");
const { ensureAgencyFinanceFoundationRegistered } = require("../src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation") as typeof import("../src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation");

type ClientContract = { id: string; title: string; status: string };

interface World {
  agencyId: string;
  clientId: string;
  cookie: string;
  installId: string;
}

let seq = 0;

// A fresh agency + client + enabled agency-finance install, and an agency-owner
// session cookie for it. Each world is its own tenant, so tests never share
// contracts, invoices or plugin storage.
async function seedWorld(options: { installFinance?: boolean; role?: string } = {}): Promise<World> {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: `Close Deal Smoke ${seq}`, ownerEmail: `owner${seq}@example.com` });
  const client = createClient(agency.id, { name: `Payer Ltd ${seq}`, stage: "live" });
  let installId = "";
  if (options.installFinance !== false) {
    const install = upsertInstall({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      enabled: true,
      config: { defaultCurrency: "gbp", ukDefaultCurrencyV1: true },
      features: {},
    });
    installId = install.id;
  }
  ensureAgencyFinanceFoundationRegistered();
  // A REAL user, not a made-up id. `getSession()` re-resolves the session's user
  // on every call and refuses a cookie whose subject does not exist, whose role
  // has changed, or whose `sessionRev` is stale — the central fresh-session
  // boundary (issues #22). A hand-minted `user_<n>` used to sail through that;
  // it now 401s, correctly, so the fixture has to seed the person it claims.
  const role = (options.role ?? "agency-owner") as never;
  const owner = createUser({
    email: `owner${seq}@example.com`,
    name: `Close Deal Owner ${seq}`,
    role,
    agencyId: agency.id,
    password: "close-deal-smoke-pass-phrase",
  });
  const cookie = issueSession({
    userId: owner.id,
    email: owner.email,
    role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  return { agencyId: agency.id, clientId: client.id, cookie, installId };
}

function closeDealRequest(body: Record<string, unknown>): InstanceType<typeof NextRequest> {
  return new NextRequest("http://localhost/api/tenants/close-deal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface CloseResponse {
  ok?: boolean;
  error?: string;
  contractId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  channel?: string;
  payLink?: string;
  deduped?: boolean;
}

// Drive the real handler as the given world's user.
async function close(world: World, body: Record<string, unknown>): Promise<{ status: number; data: CloseResponse }> {
  const response = await withSession(world.cookie, () =>
    POST(closeDealRequest({ clientId: world.clientId, ...body })));
  return { status: response.status, data: (await response.json()) as CloseResponse };
}

function contractsOf(world: World): ClientContract[] {
  const client = getClientForAgency(world.agencyId, world.clientId);
  return ((client?.metadata?.contracts as ClientContract[] | undefined) ?? []);
}

async function invoicesOf(world: World) {
  const finance = containerFor({
    agencyId: world.agencyId,
    storage: makePluginStorage(world.installId) as never,
    install: { id: world.installId, config: { defaultCurrency: "gbp" } } as never,
  });
  return finance.invoices.list();
}

const BANK = { title: "Q4 retainer", amountCents: 240_000, currency: "gbp", channel: "bank-transfer", dueInDays: 30 };

// ─── The happy path this route never had ─────────────────────────────────────

test("a bank-transfer close over HTTP creates exactly one contract and one invoice", async () => {
  const world = await seedWorld();
  const { status, data } = await close(world, { ...BANK, idempotencyKey: "close-http-1" });

  assert.equal(status, 200, "the close succeeds over HTTP");
  assert.equal(data.ok, true);
  assert.ok(data.contractId, "a contract id comes back");
  assert.ok(data.invoiceNumber, "the invoice number is surfaced — this is what the UI shows after a close");
  assert.equal(data.channel, "bank-transfer");
  assert.equal(data.payLink, undefined, "no Stripe involved on the manual channel");
  assert.equal(data.deduped, false, "a first close is not a resubmit");

  const contracts = contractsOf(world);
  assert.equal(contracts.length, 1, "exactly ONE contract on the client");
  assert.equal(contracts[0].status, "sent");
  const invoices = await invoicesOf(world);
  assert.equal(invoices.length, 1, "exactly ONE invoice");
  assert.equal(invoices[0].totalCents, 240_000, "billed once, at the deal amount");
  assert.equal(invoices[0].status, "sent", "issued, so it can be paid");
});

// ─── The double-bill this route is the last unproven hop of ──────────────────

test("the same idempotencyKey posted twice over HTTP yields ONE contract and ONE invoice", async () => {
  const world = await seedWorld();
  const body = { ...BANK, idempotencyKey: "double-click-key" };

  const first = await close(world, body);
  const second = await close(world, body);   // the double-click

  assert.equal(first.status, 200);
  assert.equal(second.status, 200, "the second click is not an error the user has to interpret");
  assert.equal(second.data.deduped, true, "the route reports the resubmit honestly");
  assert.equal(first.data.contractId, second.data.contractId, "it reuses the first contract");
  assert.equal(first.data.invoiceId, second.data.invoiceId, "and the first invoice");

  assert.equal(contractsOf(world).length, 1, "ONE contract — the key survived the route boundary");
  const invoices = await invoicesOf(world);
  assert.equal(invoices.length, 1, "ONE invoice — the client is billed once, not twice");
  assert.equal(invoices.reduce((sum, inv) => sum + inv.totalCents, 0), 240_000, "£2,400 billed once");
  // No second pay-link was minted either (this channel has none; the point is
  // that the deduped branch creates nothing new at all).
  assert.equal(second.data.payLink, undefined);
});

test("a genuinely new deal for the same client (new key) is still billed", async () => {
  // The nuance the dedup must not eat: two deals at the SAME amount, closed
  // back to back, are two real deals.
  const world = await seedWorld();
  await close(world, { ...BANK, idempotencyKey: "deal-a" });
  await close(world, { ...BANK, idempotencyKey: "deal-b" });

  assert.equal(contractsOf(world).length, 2, "both deals have a contract");
  const invoices = await invoicesOf(world);
  assert.equal(invoices.length, 2, "both deals are billed");
  assert.equal(invoices.reduce((sum, inv) => sum + inv.totalCents, 0), 480_000, "identical amounts are NOT merged");
});

test("two parallel posts with the same key yield one contract and one invoice", async () => {
  // A true double-click: both requests in flight. The deduped fast path is a
  // read-then-check and can lose that race — what actually saves it is that the
  // contract id and the invoice id are DERIVED from the key, so the second
  // write lands on the same slots (an overwrite) instead of adding rows.
  const world = await seedWorld();
  const body = { ...BANK, amountCents: 99_900, idempotencyKey: "race-key" };

  const opsBefore = storageOps;
  const [a, b] = await Promise.all([close(world, body), close(world, body)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.ok(storageOps > opsBefore, "the latency-injecting storage really is on the route's path");
  // Proof that this is a TRUE race and not a serialised imitation: with the
  // latency in place BOTH calls report `deduped: false` — each read the store
  // before the other had written, so the fast path missed on both. What
  // collapses them to one contract + one invoice is the derived id, exactly as
  // designed. (Without the latency both of these come back serialised and the
  // second reports `deduped: true`, which tests a different, easier path.)
  assert.equal(a.data.deduped, false, "both requests raced past the fast-path read");
  assert.equal(b.data.deduped, false, "…so the derived id is what has to save this");

  assert.equal(contractsOf(world).length, 1, "no duplicate contract under a parallel race");
  const invoices = await invoicesOf(world);
  assert.equal(invoices.length, 1, "no duplicate invoice under a parallel race");
  assert.equal(invoices[0].totalCents, 99_900, "billed once");
});

// ─── The guards ──────────────────────────────────────────────────────────────

test("without agency-finance installed the route 409s 'Agency Finance is not connected'", async () => {
  const world = await seedWorld({ installFinance: false });
  const { status, data } = await close(world, { ...BANK, idempotencyKey: "no-finance" });

  assert.equal(status, 409);
  assert.equal(data.ok, false);
  assert.equal(data.error, "Agency Finance is not connected.");
  assert.equal(contractsOf(world).length, 0, "and nothing was written");
});

test("a disabled agency-finance install is refused too", async () => {
  const world = await seedWorld();
  upsertInstall({ pluginId: "agency-finance", scope: { agencyId: world.agencyId }, enabled: false, config: {}, features: {} });
  const { status, data } = await close(world, { ...BANK, idempotencyKey: "disabled-finance" });
  assert.equal(status, 409, "an install that exists but is switched off is not a connection");
  assert.equal(data.ok, false);
  deleteInstall({ agencyId: world.agencyId }, "agency-finance");
});

test("a non-agency role is rejected", async () => {
  // A client-side user cannot close a deal on their own account.
  const world = await seedWorld({ role: "client-admin" });
  const { status, data } = await close(world, { ...BANK, idempotencyKey: "wrong-role" });

  assert.ok(status === 401 || status === 403, `expected an auth refusal, got ${status}`);
  assert.equal(data.ok, false);
  assert.equal(contractsOf(world).length, 0, "no contract written for a refused caller");
});

test("no session at all is rejected", async () => {
  const world = await seedWorld();
  // A real request scope carrying NO session cookie — the browser case, not a
  // missing scope (which would fail for an unrelated reason and prove nothing).
  const response = await withRequestScope({}, () =>
    POST(closeDealRequest({ clientId: world.clientId, ...BANK, idempotencyKey: "no-session" })));
  assert.equal(response.status, 401);
  assert.equal(contractsOf(world).length, 0);
});

test("a missing title or a non-positive amount is a 400 before any auth or write", async () => {
  const world = await seedWorld();
  const noTitle = await close(world, { ...BANK, title: "", idempotencyKey: "bad-1" });
  assert.equal(noTitle.status, 400);
  const zero = await close(world, { ...BANK, amountCents: 0, idempotencyKey: "bad-2" });
  assert.equal(zero.status, 400);
  const negative = await close(world, { ...BANK, amountCents: -5_000, idempotencyKey: "bad-3" });
  assert.equal(negative.status, 400, "a negative amount cannot mint a credit-note-shaped invoice");
  assert.equal(contractsOf(world).length, 0, "nothing written on any rejected body");
});

test("a client from another agency cannot be closed against", async () => {
  const mine = await seedWorld();
  const theirs = await seedWorld();
  const response = await withSession(mine.cookie, () =>
    POST(closeDealRequest({ clientId: theirs.clientId, ...BANK, idempotencyKey: "cross-tenant" })));

  assert.equal(response.status, 404, "another agency's client is simply not found for me");
  assert.equal(contractsOf(theirs).length, 0, "and nothing was written on their client");
});
