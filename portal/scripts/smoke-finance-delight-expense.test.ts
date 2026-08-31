// Finance — You-Deserve-It (client delight) spend → an approval-gated expense.
// Idempotent on the delight id. Driven against the real ExpenseService.

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

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
import {
  delightExpenseStateInContainer,
  delightSpendApproved,
  delightSpendCents,
  recordDelightExpenseInContainer,
} from "../src/lib/server/clients/clientDelightExpense";

const AGENCY_ID: AgencyId = "agency_delight_smoke";
const CLIENT_ID: ClientId = "client_delight_smoke";
const ACTOR: UserId = "user_owner";

function buildWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Delight Smoke", slug: "delight-smoke", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const client: Client = { id: CLIENT_ID, agencyId: AGENCY_ID, name: "Gifted Ltd", slug: "gifted", brand: { primaryColor: "#0af" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
  const data = new Map<string, unknown>();
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
  const activity: ActivityLogPort = { logActivity: (input) => ({ id: "act", ts: 0, ...input } as ActivityEntry), listActivity: () => [] };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall(_s: PluginInstallScope, _p: string): PluginInstall | null { return null; } };
  return { storage, tenant, user, activity, events, pluginInstalls };
}

let finance: ReturnType<typeof containerWithDeps>;

before(async () => {
  const world = buildWorld();
  finance = containerWithDeps({ agencyId: AGENCY_ID, storage: world.storage, tenant: world.tenant, user: world.user, activity: world.activity, events: world.events, pluginInstalls: world.pluginInstalls });
  await finance.categories.seedDefaults(ACTOR); // gives Marketing / Other / …
});

test("a delivered delight's cost becomes a pending (approval-gated) finance expense", async () => {
  const id = await recordDelightExpenseInContainer(finance, { clientId: CLIENT_ID, title: "Birthday hamper", amountCents: 4_500, delightId: "d1" }, ACTOR);
  assert.ok(id, "an expense id is returned");
  const expenses = await finance.expenses.list();
  const expense = expenses.find(e => e.id === id);
  assert.equal(expense?.amountCents, 4_500);
  assert.equal(expense?.status, "pending", "approval-gated, not auto-paid");
  assert.equal(expense?.reference, "delight:d1", "referenced to the delight for idempotency");
  assert.equal(expense?.clientId, CLIENT_ID);
  assert.match(expense?.description ?? "", /Birthday hamper/);
});

test("re-recording the same delight is idempotent — no second expense", async () => {
  const again = await recordDelightExpenseInContainer(finance, { clientId: CLIENT_ID, title: "Birthday hamper", amountCents: 4_500, delightId: "d1" }, ACTOR);
  const expenses = (await finance.expenses.list()).filter(e => e.reference === "delight:d1");
  assert.equal(expenses.length, 1, "still exactly one expense for this delight");
  assert.equal(again, expenses[0].id, "returns the existing expense id");
});

test("nothing to record (no cost / no delight id) is a safe no-op", async () => {
  assert.equal(await recordDelightExpenseInContainer(finance, { title: "Free note", amountCents: 0, delightId: "d2" }, ACTOR), null);
  assert.equal(await recordDelightExpenseInContainer(finance, { title: "No id", amountCents: 1_000, delightId: "" }, ACTOR), null);
  assert.equal((await finance.expenses.list()).some(e => e.reference === "delight:d2"), false);
});

// --- The commitment is visible BEFORE the money moves -----------------------

test("a delight commits money from planned onwards — an idea or a cancellation commits nothing", () => {
  // Planned with only a budget: that budget is the commitment.
  assert.equal(delightSpendCents({ status: "planned", budgetCents: 12_000 }), 12_000);
  // A logged actual supersedes the budget.
  assert.equal(delightSpendCents({ status: "ordered", budgetCents: 12_000, costCents: 9_950 }), 9_950);
  assert.equal(delightSpendCents({ status: "delivered", costCents: 4_500 }), 4_500);
  // Not yet a commitment, or no longer one.
  assert.equal(delightSpendCents({ status: "idea", budgetCents: 12_000 }), 0);
  assert.equal(delightSpendCents({ status: "cancelled", costCents: 9_950 }), 0);
  assert.equal(delightSpendCents({ status: "planned" }), 0);
});

test("a planned gift's budget already sits in Finance as a pending expense, with supplier and occasion carried through", async () => {
  const id = await recordDelightExpenseInContainer(
    finance,
    { clientId: CLIENT_ID, title: "Anniversary hamper", amountCents: 12_000, delightId: "d3", supplier: "Fortnum & Mason", occasion: "milestone" },
    ACTOR,
  );
  const expense = (await finance.expenses.list()).find(e => e.id === id);
  assert.equal(expense?.status, "pending", "planned spend is awaiting sign-off, not already spent");
  assert.equal(expense?.amountCents, 12_000);
  assert.equal(expense?.vendor, "Fortnum & Mason", "Finance can see who it is being bought from");
  assert.match(expense?.reason ?? "", /milestone/, "Finance can see why");
});

test("while pending, the expense tracks the delight's number; once approved it is never silently re-priced", async () => {
  const id = await recordDelightExpenseInContainer(finance, { clientId: CLIENT_ID, title: "Anniversary hamper", amountCents: 13_500, delightId: "d3" }, ACTOR);
  const repriced = (await finance.expenses.list()).find(e => e.id === id);
  assert.equal(repriced?.amountCents, 13_500, "a pending commitment follows the plan");
  assert.equal((await finance.expenses.list()).filter(e => e.reference === "delight:d3").length, 1, "still one expense");

  await finance.expenses.approve(id!, ACTOR);
  await recordDelightExpenseInContainer(finance, { clientId: CLIENT_ID, title: "Anniversary hamper", amountCents: 40_000, delightId: "d3" }, ACTOR);
  const afterApproval = (await finance.expenses.list()).find(e => e.id === id);
  assert.equal(afterApproval?.amountCents, 13_500, "an approved number is not rewritten behind Finance's back");
  assert.equal(afterApproval?.status, "approved");
});

test("ordering is gated on a real Finance sign-off — no expense means not approved", async () => {
  // Never recorded: absence of evidence is not an approval.
  assert.equal(await delightExpenseStateInContainer(finance, "never-recorded"), null);
  assert.equal(delightSpendApproved(null), false);

  const pendingId = await recordDelightExpenseInContainer(finance, { clientId: CLIENT_ID, title: "Retreat deposit", amountCents: 25_000, delightId: "d4" }, ACTOR);
  const pending = await delightExpenseStateInContainer(finance, "d4");
  assert.equal(pending?.id, pendingId);
  assert.equal(pending?.status, "pending");
  assert.equal(delightSpendApproved(pending), false, "a pending expense does not clear the gift to be ordered");

  await finance.expenses.approve(pendingId!, ACTOR);
  const approved = await delightExpenseStateInContainer(finance, "d4");
  assert.equal(approved?.status, "approved");
  assert.equal(delightSpendApproved(approved), true, "sign-off is what clears the purchase");
});

test("the client-delight route records at plan time and refuses to order an unapproved spend", async () => {
  const route = await readFile(new URL("../src/app/api/tenants/client-delight/route.ts", import.meta.url), "utf8");
  // Plan-time recording: the finance wire is driven by the commitment helper,
  // not by "delivered" alone.
  assert.match(route, /delightSpendCents\(record\)/, "the wire records whatever the record commits");
  assert.doesNotMatch(route, /record\.status === "delivered" && \(record\.costCents/, "no longer delivered-only");
  // The ordered gate, and the honest 409 that names what clears it.
  assert.match(route, /body\.status === "ordered"[\s\S]*delightSpendApproved/, "moving to ordered consults the sign-off");
  assert.match(route, /status: 409/, "a refused order is reported, not silently swallowed");
  assert.match(route, /Finance → Expenses/, "the refusal states how it is dealt with");
  // Plan-time finance writes are a commercial act, gated as one.
  assert.match(route, /resultingSpendCents > 0[\s\S]*"client\.commercial", "use"/);
});

test("the workspace surfaces a refused move instead of leaving the row looking moved", async () => {
  const workspace = await readFile(new URL("../src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /setPlanError\(json\?\.error/, "the API's reason is shown, not a generic shrug");
  assert.match(workspace, /role="alert"[\s\S]*\{planError\}/, "and it is announced");
});
