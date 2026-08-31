// You-Deserve-It HTTP route smoke — `POST /api/tenants/client-delight`.
//
// Why this file exists: the delight → Finance wire itself is covered by
// `smoke-finance-delight-expense.test.ts`, but that suite drives the helper
// against a container built from FAKE ports (`containerWithDeps`), so it cannot
// reach the route at all. The route's own new behaviour — recording the
// commitment at plan time, and REFUSING (409) to move a gift to "Booked /
// ordered" until Finance has signed the spend off — was pinned only by regexes
// over the route's source text. A regex matches an inverted condition just as
// happily as a correct one, and it cannot tell a gate that reads the sign-off
// from one that refuses unconditionally.
//
// So this drives the REAL exported `POST` in-process (the house convention: a
// minted session + a NextRequest inside a real request scope, per
// `smoke-close-deal-route.test.ts`), against a memory backend and a real
// agency-finance install. Nothing here is stubbed except the request scope.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "client-delight-route-smoke-secret";

// First, and statically: this installs the request-scope helpers before
// anything pulls in `next/`. See the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Loaded with `require` rather than `import` on purpose: these must be pulled in
// AFTER the scope helper above, and this file is transpiled to CJS (where
// `import` statements hoist to the top and would beat it).
const { NextRequest } = require("next/server") as typeof import("next/server");
const { POST } = require("../src/app/api/tenants/client-delight/route") as typeof import("../src/app/api/tenants/client-delight/route");
const { issueSession } = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const { ensureHydrated } = require("../src/server/storage") as typeof import("../src/server/storage");
const { createAgency, createClient } = require("../src/server/tenants") as typeof import("../src/server/tenants");
const { upsertInstall } = require("../src/server/pluginInstalls") as typeof import("../src/server/pluginInstalls");
const { createUser } = require("../src/server/users") as typeof import("../src/server/users");
const { makePluginStorage } = require("../src/lib/server/pluginStorage") as typeof import("../src/lib/server/pluginStorage");
const { containerFor } = require("../src/built-ins/modules/agency-finance/src/server/foundationAdapter") as typeof import("../src/built-ins/modules/agency-finance/src/server/foundationAdapter");
const { ensureAgencyFinanceFoundationRegistered } = require("../src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation") as typeof import("../src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation");
const { listClientDelight } = require("../src/server/clientDelight") as typeof import("../src/server/clientDelight");

type DelightResponse = { ok?: boolean; error?: string; record?: { id: string; status: string; budgetCents?: number } };

let seq = 0;

// A fresh agency + client + enabled agency-finance install, and an agency-owner
// session cookie for it. Each world is its own tenant, so tests never share
// delight records or expenses.
async function seedWorld() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: `Delight Route Smoke ${seq}`, ownerEmail: `delight-route-${seq}@example.com` });
  const client = createClient(agency.id, { name: `Gifted Ltd ${seq}`, stage: "live" });
  const install = upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: { defaultCurrency: "gbp" },
    features: {},
  });
  ensureAgencyFinanceFoundationRegistered();
  // A REAL user: `getSession()` re-resolves the session's user on every read and
  // refuses a cookie whose subject does not exist.
  const role = "agency-owner" as never;
  const owner = createUser({
    email: `delight-route-${seq}@example.com`,
    name: `Delight Route Owner ${seq}`,
    role,
    agencyId: agency.id,
    password: "client-delight-route-smoke-pass",
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
  const finance = containerFor({ agencyId: agency.id, storage: makePluginStorage(install.id) as never, install: install as never });
  await finance.categories.seedDefaults(owner.id as never);
  return { agencyId: agency.id, clientId: client.id, cookie, finance, userId: owner.id };
}

type World = Awaited<ReturnType<typeof seedWorld>>;

// Drive the real handler as the given world's user.
async function post(world: World, body: Record<string, unknown>): Promise<{ status: number; data: DelightResponse }> {
  const response = await withSession(world.cookie, () =>
    POST(new NextRequest("http://localhost/api/tenants/client-delight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })));
  return { status: response.status, data: await response.json() as DelightResponse };
}

async function delightExpenses(world: World) {
  return (await world.finance.expenses.list()).filter(expense => expense.reference?.startsWith("delight:"));
}

async function planHamper(world: World, budgetCents = 12_000) {
  const created = await post(world, {
    action: "create",
    clientId: world.clientId,
    recipientName: "Ada Lovelace",
    title: "Anniversary hamper",
    status: "planned",
    occasion: "milestone",
    supplier: "Fortnum & Mason",
    currency: "GBP",
    budgetCents,
  });
  assert.equal(created.status, 200, created.data.error ?? "planning the gift should succeed");
  assert.ok(created.data.record?.id, "the planned record comes back");
  return created.data.record!;
}

test("planning a gift with a budget puts it in Finance as a pending expense, before any money moves", async () => {
  const world = await seedWorld();
  await planHamper(world);

  const expenses = await delightExpenses(world);
  assert.equal(expenses.length, 1, "the plan-time commitment reached Finance");
  assert.equal(expenses[0].status, "pending", "awaiting sign-off — the app has not spent anything");
  assert.equal(expenses[0].amountCents, 12_000, "the planned budget is what Finance is asked to approve");
  assert.equal(expenses[0].vendor, "Fortnum & Mason", "Finance can see who it would be bought from");
  assert.match(expenses[0].reason ?? "", /milestone/, "and why");
});

test("moving a gift to Booked / ordered is refused until Finance approves the spend", async () => {
  const world = await seedWorld();
  const record = await planHamper(world);

  const refused = await post(world, { action: "update", id: record.id, status: "ordered" });
  assert.equal(refused.status, 409, "an unapproved purchase is refused, not quietly allowed");
  assert.match(refused.data.error ?? "", /has not approved/, "the refusal says what happened");
  assert.match(refused.data.error ?? "", /GBP 120\.00/, "and names the amount awaiting sign-off");
  assert.match(refused.data.error ?? "", /Finance → Expenses/, "and how it is cleared");
  assert.equal(
    listClientDelight(world.agencyId).find(item => item.id === record.id)?.status,
    "planned",
    "the record really did not move — the refusal is not cosmetic",
  );
});

test("a refused move leaves Finance holding the saved number, never one from the rejected request", async () => {
  const world = await seedWorld();
  const record = await planHamper(world);

  // The edit form posts every field, so a refused save carries a re-priced
  // budget with it. Nothing about a refused request is persisted to the delight,
  // so nothing about it may be persisted to Finance either — otherwise Finance
  // is left asking a human to approve a figure that exists on no record.
  const refused = await post(world, { action: "update", id: record.id, status: "ordered", budgetCents: 50_000 });
  assert.equal(refused.status, 409);
  assert.equal(listClientDelight(world.agencyId).find(item => item.id === record.id)?.budgetCents, 12_000, "the delight kept its saved budget");

  const expenses = await delightExpenses(world);
  assert.equal(expenses.length, 1, "no second expense was raised");
  assert.equal(expenses[0].amountCents, 12_000, "and the pending expense was not re-priced by a request that was refused");
  assert.match(refused.data.error ?? "", /GBP 120\.00/, "the refusal quotes what Finance actually holds");
});

test("once Finance approves the expense, the same move goes through — the gate reads the sign-off", async () => {
  const world = await seedWorld();
  const record = await planHamper(world);
  assert.equal((await post(world, { action: "update", id: record.id, status: "ordered" })).status, 409);

  const [expense] = await delightExpenses(world);
  await world.finance.expenses.approve(expense.id, world.userId as never);

  const allowed = await post(world, { action: "update", id: record.id, status: "ordered" });
  assert.equal(allowed.status, 200, allowed.data.error ?? "an approved spend clears the purchase");
  assert.equal(allowed.data.record?.status, "ordered");
  assert.equal(
    listClientDelight(world.agencyId).find(item => item.id === record.id)?.status,
    "ordered",
    "and the move is persisted",
  );
  const after = await delightExpenses(world);
  assert.equal(after[0].status, "approved", "the approved expense is left exactly as Finance signed it");
  assert.equal(after[0].amountCents, 12_000, "and is never silently re-priced afterwards");
});

test("an idea with a budget commits nothing — no expense is raised until it is planned", async () => {
  const world = await seedWorld();
  const created = await post(world, {
    action: "create",
    clientId: world.clientId,
    recipientName: "Grace Hopper",
    title: "Maybe a hamper",
    status: "idea",
    budgetCents: 9_000,
    currency: "GBP",
  });
  assert.equal(created.status, 200, created.data.error ?? "an idea saves fine");
  assert.equal((await delightExpenses(world)).length, 0, "an idea is not a commitment, so Finance is not asked to approve one");
});
