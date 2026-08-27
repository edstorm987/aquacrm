// Finance plan assignment — validation, recoverable multi-write faults and
// real separate-process races over one isolated file-backed PortalState.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [] } as never;

import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type { ActivityEntry, Agency, Client, PluginInstall } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import { assignPlanHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers-r007";
import { containerWithDeps, registerAgencyFinanceFoundation } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, TenantPort, UserPort } from "../src/built-ins/modules/agency-finance/src/server/ports";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-finance-plan-assignment-"));
const STATE_FILE = join(SANDBOX, "portal-state.json");
const INSTALL_ID = "agency_plan_assignment|_agency|agency-finance";
const AGENCY_ID = "agency_plan_assignment";
const CLIENT_ONE = "client_plan_one";
const CLIENT_TWO = "client_plan_two";
const ACTOR = "owner_plan_assignment";

interface FaultStorage extends PluginStorage {
  arm(writeNumber: number): void;
  disarm(): void;
  snapshot(): string;
}

function memoryWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Plan Agency", slug: "plan-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const clients = new Set([CLIENT_ONE, CLIENT_TWO]);
  const clientFor = (id: string): Client | null => clients.has(id)
    ? { id, agencyId: AGENCY_ID, name: id, slug: id, brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 }
    : null;
  const data = new Map<string, unknown>();
  let failAt: number | null = null;
  let writes = 0;
  const beforeWrite = () => {
    writes += 1;
    if (writes === failAt) throw new Error(`planned storage fault ${writes}`);
  };
  const storage: FaultStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { beforeWrite(); data.set(key, value); },
    async del(key: string): Promise<void> { beforeWrite(); data.delete(key); },
    async list(prefix = ""): Promise<string[]> { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    arm(writeNumber) { failAt = writeNumber; writes = 0; },
    disarm() { failAt = null; writes = 0; },
    snapshot() { return JSON.stringify([...data.entries()].sort(([a], [b]) => a.localeCompare(b))); },
  };
  const tenant: TenantPort = {
    getAgency: id => id === AGENCY_ID ? agency : null,
    getClient: clientFor,
    getClientForAgency: (agencyId, clientId) => agencyId === AGENCY_ID ? clientFor(clientId) : null,
  };
  const user: UserPort = { getUser: () => null };
  const activity: ActivityLogPort = {
    logActivity: input => ({ id: "activity", ts: Date.now(), ...input }) as ActivityEntry,
    listActivity: () => [],
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall: () => null };
  const services = () => containerWithDeps({ agencyId: AGENCY_ID, storage, tenant, user, activity, events, pluginInstalls });
  return { storage, tenant, user, activity, events, pluginInstalls, services };
}

async function seedPlans(world: ReturnType<typeof memoryWorld>) {
  const services = world.services();
  const a = await services.plans.create(ACTOR, { tier: "growth", label: "Growth", monthlyAmountCents: 50_000, idempotencyKey: "plan-a" });
  const b = await services.plans.create(ACTOR, { tier: "scale", label: "Scale", monthlyAmountCents: 90_000, idempotencyKey: "plan-b" });
  return { services, a, b };
}

async function assertConsistent(
  services: ReturnType<ReturnType<typeof memoryWorld>["services"]>,
  clientIds: string[],
): Promise<void> {
  const plans = await services.plans.list(true);
  for (const clientId of clientIds) {
    const pointed = await services.plans.getForClient(clientId);
    const memberships = plans.filter(plan => plan.clientIds.includes(clientId));
    assert.equal(memberships.length, pointed ? 1 : 0, `${clientId} has one agreed assignment direction`);
    if (pointed) assert.equal(memberships[0].id, pointed.id);
  }
}

for (const scenario of [
  { name: "assign", previous: false, target: "a" as const, writes: 4 },
  { name: "move", previous: true, target: "b" as const, writes: 5 },
  { name: "unassign", previous: true, target: null, writes: 4 },
]) {
  test(`${scenario.name} recovers every interrupted write boundary on the next read`, async t => {
    for (let failAt = 1; failAt <= scenario.writes; failAt += 1) {
      await t.test(`write ${failAt}`, async () => {
        const world = memoryWorld();
        const { services, a, b } = await seedPlans(world);
        if (scenario.previous) await services.plans.assignClient(ACTOR, CLIENT_ONE, a.id);
        world.storage.arm(failAt);
        await assert.rejects(
          () => services.plans.assignClient(ACTOR, CLIENT_ONE, scenario.target === "a" ? a.id : scenario.target === "b" ? b.id : null),
          /planned storage fault/,
        );
        world.storage.disarm();

        const reloaded = world.services();
        const assigned = await reloaded.plans.getForClient(CLIENT_ONE);
        const expected = failAt === 1
          ? (scenario.previous ? a.id : null)
          : (scenario.target === "a" ? a.id : scenario.target === "b" ? b.id : null);
        assert.equal(assigned?.id ?? null, expected);
        await assertConsistent(reloaded, [CLIENT_ONE]);
        assert.deepEqual(await world.storage.list("plans/assignment-operations/"), [], "recovery marker cleared");
      });
    }
  });
}

test("missing clients, stale plans and malformed mounted requests write nothing", async () => {
  const world = memoryWorld();
  const { services, a } = await seedPlans(world);
  await services.plans.assignClient(ACTOR, CLIENT_ONE, a.id);
  const before = world.storage.snapshot();
  await assert.rejects(() => services.plans.assignClient(ACTOR, "missing-client", a.id), /client not found/);
  assert.equal(world.storage.snapshot(), before);
  await assert.rejects(() => services.plans.assignClient(ACTOR, CLIENT_ONE, "missing-plan"), /plan not found/);
  assert.equal(world.storage.snapshot(), before);

  registerAgencyFinanceFoundation({
    tenant: world.tenant,
    user: world.user,
    activity: world.activity,
    events: world.events,
    pluginInstalls: world.pluginInstalls,
    compensation: {
      getTerms: () => null,
      setProfileLink() {},
    },
  });
  const ctx: PluginCtx = {
    agencyId: AGENCY_ID,
    install: { id: INSTALL_ID, agencyId: AGENCY_ID, pluginId: "agency-finance", enabled: true, config: {}, installedAt: 0 } as PluginInstall,
    storage: world.storage,
    services: {} as PluginCtx["services"],
    actor: ACTOR,
  };
  const response = await assignPlanHandler(new Request("http://localhost/plans/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ONE }),
  }), ctx);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "planId_required" });
  const unknownField = await assignPlanHandler(new Request("http://localhost/plans/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ONE, planId: a.id, force: true }),
  }), ctx);
  assert.equal(unknownField.status, 400);
  assert.match((await unknownField.json() as { error: string }).error, /unsupported field/);
  const missingClient = await assignPlanHandler(new Request("http://localhost/plans/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "missing-client", planId: a.id }),
  }), ctx);
  assert.equal(missingClient.status, 404);
  assert.deepEqual(await missingClient.json(), { ok: false, error: "client_not_found" });
  const staleTarget = await assignPlanHandler(new Request("http://localhost/plans/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ONE, planId: "missing-plan" }),
  }), ctx);
  assert.equal(staleTarget.status, 404);
  assert.deepEqual(await staleTarget.json(), { ok: false, error: "not_found" });
  assert.equal(world.storage.snapshot(), before);
});

const CHILD_SOURCE = String.raw`
const [pluginStorageImported, financeImported, portalStorageImported] = await Promise.all([
  import(process.env.AQUA_PLUGIN_STORAGE_MODULE),
  import(process.env.AQUA_FINANCE_MODULE),
  import(process.env.AQUA_PORTAL_STORAGE_MODULE),
]);
const pluginStorageModule = pluginStorageImported.default || pluginStorageImported;
const financeModule = financeImported.default || financeImported;
const portalStorageModule = portalStorageImported.default || portalStorageImported;
await portalStorageModule.ensureHydrated({ fresh: true });
const agencyId = process.env.AQUA_AGENCY_ID;
const clients = new Set(["client_plan_one", "client_plan_two"]);
const agency = { id: agencyId, name: "Plan Agency", slug: "plan-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
const clientFor = id => clients.has(id) ? { id, agencyId, name: id, slug: id, brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 } : null;
const storage = pluginStorageModule.makePluginStorage(process.env.AQUA_INSTALL_ID);
const services = financeModule.containerWithDeps({
  agencyId,
  storage,
  tenant: {
    getAgency: id => id === agencyId ? agency : null,
    getClient: clientFor,
    getClientForAgency: (requestedAgencyId, id) => requestedAgencyId === agencyId ? clientFor(id) : null,
  },
  user: { getUser: () => null },
  activity: { logActivity: input => ({ id: "activity", ts: Date.now(), ...input }), listActivity: () => [] },
  events: { emit() {} },
  pluginInstalls: { getInstall: () => null },
});
const input = JSON.parse(process.env.AQUA_INPUT || "{}");
try {
  let value;
  if (process.env.AQUA_ACTION === "seed") {
    const a = await services.plans.create("owner", { tier: "growth", label: "Growth", monthlyAmountCents: 50000, idempotencyKey: "plan-a" });
    const b = await services.plans.create("owner", { tier: "scale", label: "Scale", monthlyAmountCents: 90000, idempotencyKey: "plan-b" });
    value = { a: a.id, b: b.id };
  } else if (process.env.AQUA_ACTION === "assign") {
    await services.plans.assignClient("owner", input.clientId, input.planId);
    value = true;
  } else if (process.env.AQUA_ACTION === "snapshot") {
    const plans = await services.plans.list(true);
    const assignments = {};
    for (const clientId of ["client_plan_one", "client_plan_two"]) {
      assignments[clientId] = (await services.plans.getForClient(clientId))?.id || null;
    }
    value = { plans: plans.map(plan => ({ id: plan.id, clientIds: plan.clientIds })), assignments };
  } else {
    throw new Error("unknown child action");
  }
  await portalStorageModule.flushPendingWrites();
  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) {
  await portalStorageModule.flushPendingWrites();
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}
`;

interface ChildResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}

interface AssignmentSnapshot {
  plans: Array<{ id: string; clientIds: string[] }>;
  assignments: Record<string, string | null>;
}

function moduleUrl(path: string): string {
  return pathToFileURL(join(REPO_ROOT, path)).href;
}

async function runChild<T>(action: "seed" | "assign" | "snapshot", input: Record<string, unknown> = {}): Promise<ChildResult<T>> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      TSX_LOADER,
      "--input-type=module",
      "--eval",
      CHILD_SOURCE,
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: STATE_FILE,
        TSX_TSCONFIG_PATH: join(REPO_ROOT, "tsconfig.json"),
        AQUA_ACTION: action,
        AQUA_INPUT: JSON.stringify(input),
        AQUA_INSTALL_ID: INSTALL_ID,
        AQUA_AGENCY_ID: AGENCY_ID,
        AQUA_PLUGIN_STORAGE_MODULE: moduleUrl("src/lib/server/pluginStorage.ts"),
        AQUA_FINANCE_MODULE: moduleUrl("src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts"),
        AQUA_PORTAL_STORAGE_MODULE: moduleUrl("src/server/storage.ts"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) {
        rejectChild(new Error(`plan-assignment child exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolveChild(JSON.parse(stdout) as ChildResult<T>);
      } catch {
        rejectChild(new Error(`plan-assignment child returned non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

function assertSnapshotConsistent(snapshot: AssignmentSnapshot): void {
  for (const [clientId, pointedPlanId] of Object.entries(snapshot.assignments)) {
    const memberships = snapshot.plans.filter(plan => plan.clientIds.includes(clientId));
    assert.equal(memberships.length, pointedPlanId ? 1 : 0, `${clientId} has one agreed assignment after reload`);
    if (pointedPlanId) assert.equal(memberships[0].id, pointedPlanId);
  }
}

test("assign, move, unassign and stale-plan races converge across processes and reload", async () => {
  const seeded = await runChild<{ a: string; b: string }>("seed");
  assert.equal(seeded.ok, true, seeded.error);
  const { a, b } = seeded.value!;

  const competingTargets = await Promise.all([
    runChild("assign", { clientId: CLIENT_ONE, planId: a }),
    runChild("assign", { clientId: CLIENT_ONE, planId: b }),
  ]);
  assert.ok(competingTargets.every(result => result.ok));
  let snapshot = (await runChild<AssignmentSnapshot>("snapshot")).value!;
  assertSnapshotConsistent(snapshot);

  const sharedTarget = await Promise.all([
    runChild("assign", { clientId: CLIENT_ONE, planId: a }),
    runChild("assign", { clientId: CLIENT_TWO, planId: a }),
  ]);
  assert.ok(sharedTarget.every(result => result.ok));
  snapshot = (await runChild<AssignmentSnapshot>("snapshot")).value!;
  assert.equal(snapshot.assignments[CLIENT_ONE], a);
  assert.equal(snapshot.assignments[CLIENT_TWO], a);
  assert.deepEqual(snapshot.plans.find(plan => plan.id === a)?.clientIds.sort(), [CLIENT_ONE, CLIENT_TWO]);
  assertSnapshotConsistent(snapshot);

  const moveAgainstUnassign = await Promise.all([
    runChild("assign", { clientId: CLIENT_ONE, planId: b }),
    runChild("assign", { clientId: CLIENT_ONE, planId: null }),
  ]);
  assert.ok(moveAgainstUnassign.every(result => result.ok));
  snapshot = (await runChild<AssignmentSnapshot>("snapshot")).value!;
  assert.ok(snapshot.assignments[CLIENT_ONE] === b || snapshot.assignments[CLIENT_ONE] === null);
  assert.equal(snapshot.assignments[CLIENT_TWO], a);
  assertSnapshotConsistent(snapshot);

  const validAgainstStale = await Promise.all([
    runChild("assign", { clientId: CLIENT_ONE, planId: a }),
    runChild("assign", { clientId: CLIENT_ONE, planId: "missing-plan" }),
  ]);
  assert.equal(validAgainstStale.filter(result => result.ok).length, 1);
  assert.match(validAgainstStale.find(result => !result.ok)?.error ?? "", /plan not found/);
  snapshot = (await runChild<AssignmentSnapshot>("snapshot")).value!;
  assert.equal(snapshot.assignments[CLIENT_ONE], a);
  assertSnapshotConsistent(snapshot);
});

after(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});
