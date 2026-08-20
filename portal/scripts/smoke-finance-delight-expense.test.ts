// Finance — You-Deserve-It (client delight) spend → an approval-gated expense.
// Idempotent on the delight id. Driven against the real ExpenseService.

import assert from "node:assert/strict";
import { before, test } from "node:test";
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
import { recordDelightExpenseInContainer } from "../src/lib/server/clientDelightExpense";

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
