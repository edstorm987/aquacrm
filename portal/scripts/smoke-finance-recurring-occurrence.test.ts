// Finance recurring expenses — exactly one child per schedule + due timestamp,
// with recoverable write/log failures and real separate-process races.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [] } as never;

import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type { ActivityEntry, Agency, PluginInstall } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import type { Expense } from "../src/built-ins/modules/agency-finance/src/lib/domain";
import { postRecurringExpenseHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers";
import { containerWithDeps, registerAgencyFinanceFoundation } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, TenantPort, UserPort } from "../src/built-ins/modules/agency-finance/src/server/ports";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-finance-recurring-"));
const STATE_FILE = join(SANDBOX, "portal-state.json");
const INSTALL_ID = "agency_recurring|_agency|agency-finance";
const AGENCY_ID = "agency_recurring";
const ACTOR = "owner_recurring";
const FIRST_OCCURRENCE = Date.UTC(2026, 1, 1);
const SECOND_OCCURRENCE = Date.UTC(2026, 2, 1);
const THIRD_OCCURRENCE = Date.UTC(2026, 3, 1);

type FailureMode = { action: string; timing: "before" | "after" } | null;

interface FaultStorage extends PluginStorage {
  arm(writeNumber: number): void;
  disarm(): void;
}

function memoryWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Recurring Agency", slug: "recurring-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
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
  };
  const tenant: TenantPort = {
    getAgency: id => id === AGENCY_ID ? agency : null,
    getClient: () => null,
    getClientForAgency: () => null,
  };
  const user: UserPort = { getUser: () => null };
  const activityEntries: ActivityEntry[] = [];
  const activityByKey = new Map<string, ActivityEntry>();
  let activityFailure: FailureMode = null;
  const activity: ActivityLogPort & { failOnce(mode: Exclude<FailureMode, null>): void } = {
    failOnce(mode) { activityFailure = mode; },
    logActivity(input) {
      const stable = input.idempotencyKey ? activityByKey.get(input.idempotencyKey) : undefined;
      if (stable) return stable;
      const failure = activityFailure?.action === input.action ? activityFailure : null;
      if (failure) activityFailure = null;
      if (failure?.timing === "before") throw new Error(`planned ${input.action} log fault before write`);
      const entry = { id: `activity_${activityEntries.length + 1}`, ts: Date.now(), ...input } as ActivityEntry;
      activityEntries.push(entry);
      if (input.idempotencyKey) activityByKey.set(input.idempotencyKey, entry);
      if (failure?.timing === "after") throw new Error(`planned ${input.action} log fault after write`);
      return entry;
    },
    listActivity: () => activityEntries,
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall: () => null };
  const services = () => containerWithDeps({ agencyId: AGENCY_ID, storage, tenant, user, activity, events, pluginInstalls });
  return { storage, tenant, user, activity, events, pluginInstalls, activityEntries, services };
}

async function seedSchedule(world: ReturnType<typeof memoryWorld>) {
  const services = world.services();
  const category = await services.categories.create({ name: "Software" }, ACTOR);
  const source = await services.expenses.create({
    categoryId: category.id,
    vendor: "Aqua Hosting",
    description: "Monthly platform",
    amountCents: 12_000,
    currency: "gbp",
    incurredAt: Date.UTC(2026, 0, 1),
    recurrence: "monthly",
    nextDueAt: FIRST_OCCURRENCE,
    idempotencyKey: "recurring-source",
  }, ACTOR);
  return { services, source };
}

async function assertOneOccurrence(
  world: ReturnType<typeof memoryWorld>,
  sourceId: string,
  occurrenceAt = FIRST_OCCURRENCE,
  expectedNext = SECOND_OCCURRENCE,
) {
  const services = world.services();
  const rows = await services.expenses.list();
  const children = rows.filter(row => row.id !== sourceId && row.incurredAt === occurrenceAt);
  assert.equal(children.length, 1, "one schedule + occurrence has exactly one child");
  assert.equal(children[0].recurrence, undefined);
  assert.equal((await services.expenses.get(sourceId))?.nextDueAt, expectedNext, "the schedule advances exactly once");
  assert.deepEqual(await world.storage.list(`expenses/recurring-operations/${sourceId}/`), [], "the recovery marker clears");
  assert.equal((await world.storage.list(`expenses/recurring-results/${sourceId}/`)).length >= 1, true, "the durable result remains replayable");
  return { services, child: children[0] };
}

test("every recurring write boundary resumes without duplicate or skipped periods", async t => {
  // marker, child row, advisory index, durable result, source advance, marker clear
  for (let failAt = 1; failAt <= 6; failAt += 1) {
    await t.test(`write ${failAt}`, async () => {
      const world = memoryWorld();
      const { services, source } = await seedSchedule(world);
      world.storage.arm(failAt);
      await assert.rejects(
        () => services.expenses.postNextOccurrence(source.id, ACTOR, FIRST_OCCURRENCE),
        /planned storage fault/,
      );
      world.storage.disarm();

      const retry = await world.services().expenses.postNextOccurrence(source.id, ACTOR, FIRST_OCCURRENCE);
      assert.ok(retry);
      const { services: reloaded, child } = await assertOneOccurrence(world, source.id);
      assert.equal(retry.expense.id, child.id);
      const replay = await reloaded.expenses.postNextOccurrence(source.id, ACTOR, FIRST_OCCURRENCE);
      assert.equal(replay?.expense.id, child.id, "same occurrence replay adopts the durable result");
      assert.equal(replay?.replayed, true);
      assert.equal((await reloaded.expenses.get(source.id))?.nextDueAt, SECOND_OCCURRENCE);
      assert.equal(world.activityEntries.filter(entry => entry.action === "expense.recurring.posted").length, 1);
    });
  }
});

test("creation and recurring audit failures before/after their write remain retryable", async t => {
  for (const action of ["expense.created", "expense.recurring.posted"]) {
    for (const timing of ["before", "after"] as const) {
      await t.test(`${action} ${timing}`, async () => {
        const world = memoryWorld();
        const { services, source } = await seedSchedule(world);
        world.activity.failOnce({ action, timing });
        await assert.rejects(
          () => services.expenses.postNextOccurrence(source.id, ACTOR, FIRST_OCCURRENCE),
          new RegExp(`planned ${action.replace(".", "\\.")} log fault`),
        );
        const retry = await world.services().expenses.postNextOccurrence(source.id, ACTOR, FIRST_OCCURRENCE);
        assert.ok(retry);
        await assertOneOccurrence(world, source.id);
        assert.equal(world.activityEntries.filter(entry => entry.action === "expense.recurring.posted").length, 1);
      });
    }
  }
});

test("two direct package calls infer one shared occurrence before either mutates", async () => {
  const world = memoryWorld();
  const { services, source } = await seedSchedule(world);
  const [first, second] = await Promise.all([
    services.expenses.postNextOccurrence(source.id, ACTOR),
    services.expenses.postNextOccurrence(source.id, ACTOR),
  ]);
  assert.ok(first && second);
  assert.equal(first.expense.id, second.expense.id);
  await assertOneOccurrence(world, source.id);
});

test("mounted handler requires the due timestamp and replays one occurrence", async () => {
  const world = memoryWorld();
  const { source } = await seedSchedule(world);
  registerAgencyFinanceFoundation({
    tenant: world.tenant,
    user: world.user,
    activity: world.activity,
    events: world.events,
    pluginInstalls: world.pluginInstalls,
    compensation: { getTerms: () => null, setProfileLink() {} },
  });
  const ctx: PluginCtx = {
    agencyId: AGENCY_ID,
    install: { id: INSTALL_ID, agencyId: AGENCY_ID, pluginId: "agency-finance", enabled: true, config: {}, installedAt: 0 } as PluginInstall,
    storage: world.storage,
    services: {} as PluginCtx["services"],
    actor: ACTOR,
  };
  const missing = await postRecurringExpenseHandler(new Request("http://localhost/expenses/post-recurring", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: source.id }),
  }), ctx);
  assert.equal(missing.status, 422);

  const request = () => new Request("http://localhost/expenses/post-recurring", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: source.id, occurrenceAt: FIRST_OCCURRENCE }),
  });
  const first = await postRecurringExpenseHandler(request(), ctx);
  const replay = await postRecurringExpenseHandler(request(), ctx);
  assert.equal(first.status, 201);
  assert.equal(replay.status, 201);
  const firstBody = await first.json() as { expense: Expense };
  const replayBody = await replay.json() as { expense: Expense; replayed: boolean };
  assert.equal(replayBody.expense.id, firstBody.expense.id);
  assert.equal(replayBody.replayed, true);
  await assertOneOccurrence(world, source.id);

  const ui = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx"), "utf8");
  assert.match(ui, /JSON\.stringify\(\{ id: expense\.id, occurrenceAt: expense\.nextDueAt \}\)/);
  assert.match(ui, /\.filter\(row => row\.id !== posted\.id\)/, "replayed responses do not duplicate the child in local UI state");
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
const agency = { id: agencyId, name: "Recurring Agency", slug: "recurring-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
const storage = pluginStorageModule.makePluginStorage(process.env.AQUA_INSTALL_ID);
const services = financeModule.containerWithDeps({
  agencyId,
  storage,
  tenant: { getAgency: id => id === agencyId ? agency : null, getClient: () => null, getClientForAgency: () => null },
  user: { getUser: () => null },
  activity: { logActivity: input => ({ id: "activity", ts: Date.now(), ...input }), listActivity: () => [] },
  events: { emit() {} },
  pluginInstalls: { getInstall: () => null },
});
const input = JSON.parse(process.env.AQUA_INPUT || "{}");
try {
  let value;
  if (process.env.AQUA_ACTION === "seed") {
    const category = await services.categories.create({ name: "Software" }, "owner");
    const source = await services.expenses.create({
      categoryId: category.id,
      vendor: "Aqua Hosting",
      amountCents: 12000,
      currency: "gbp",
      incurredAt: Date.UTC(2026, 0, 1),
      recurrence: "monthly",
      nextDueAt: Number(process.env.AQUA_FIRST_OCCURRENCE),
      idempotencyKey: "recurring-source",
    }, "owner");
    value = source;
  } else if (process.env.AQUA_ACTION === "post") {
    value = await services.expenses.postNextOccurrence(input.sourceId, "owner", input.occurrenceAt);
  } else if (process.env.AQUA_ACTION === "snapshot") {
    const rows = await services.expenses.list();
    value = {
      rows,
      source: await services.expenses.get(input.sourceId),
      operations: await storage.list("expenses/recurring-operations/"),
      results: await storage.list("expenses/recurring-results/"),
    };
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

interface RecurringSnapshot {
  rows: Expense[];
  source: Expense;
  operations: string[];
  results: string[];
}

function moduleUrl(path: string): string {
  return pathToFileURL(join(REPO_ROOT, path)).href;
}

async function runChild<T>(action: "seed" | "post" | "snapshot", input: Record<string, unknown> = {}): Promise<ChildResult<T>> {
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
        AQUA_FIRST_OCCURRENCE: String(FIRST_OCCURRENCE),
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
        rejectChild(new Error(`recurring-expense child exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolveChild(JSON.parse(stdout) as ChildResult<T>);
      } catch {
        rejectChild(new Error(`recurring-expense child returned non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

test("same occurrence races converge in separate processes without advancing twice", async () => {
  const seeded = await runChild<Expense>("seed");
  assert.equal(seeded.ok, true, seeded.error);
  const sourceId = seeded.value!.id;

  const firstRace = await Promise.all([
    runChild<{ expense: Expense }>("post", { sourceId, occurrenceAt: FIRST_OCCURRENCE }),
    runChild<{ expense: Expense }>("post", { sourceId, occurrenceAt: FIRST_OCCURRENCE }),
  ]);
  assert.ok(firstRace.every(result => result.ok));
  assert.equal(firstRace[0].value?.expense.id, firstRace[1].value?.expense.id);
  let snapshot = (await runChild<RecurringSnapshot>("snapshot", { sourceId })).value!;
  assert.equal(snapshot.rows.filter(row => row.id !== sourceId && row.incurredAt === FIRST_OCCURRENCE).length, 1);
  assert.equal(snapshot.source.nextDueAt, SECOND_OCCURRENCE);
  assert.equal(snapshot.operations.length, 0);
  assert.equal(snapshot.results.length, 1);

  const replay = await runChild<{ expense: Expense; replayed: boolean }>("post", { sourceId, occurrenceAt: FIRST_OCCURRENCE });
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.value?.expense.id, firstRace[0].value?.expense.id);
  assert.equal(replay.value?.replayed, true);

  const secondRace = await Promise.all([
    runChild<{ expense: Expense }>("post", { sourceId, occurrenceAt: SECOND_OCCURRENCE }),
    runChild<{ expense: Expense }>("post", { sourceId, occurrenceAt: SECOND_OCCURRENCE }),
  ]);
  assert.ok(secondRace.every(result => result.ok));
  assert.equal(secondRace[0].value?.expense.id, secondRace[1].value?.expense.id);
  snapshot = (await runChild<RecurringSnapshot>("snapshot", { sourceId })).value!;
  assert.equal(snapshot.rows.filter(row => row.id !== sourceId && row.incurredAt === FIRST_OCCURRENCE).length, 1);
  assert.equal(snapshot.rows.filter(row => row.id !== sourceId && row.incurredAt === SECOND_OCCURRENCE).length, 1);
  assert.equal(snapshot.source.nextDueAt, THIRD_OCCURRENCE, "two real periods advance twice, with none skipped");
  assert.equal(snapshot.operations.length, 0);
  assert.equal(snapshot.results.length, 2);

  const stale = await runChild("post", { sourceId, occurrenceAt: Date.UTC(2026, 0, 15) });
  assert.equal(stale.ok, false);
  assert.match(stale.error ?? "", /occurrence is stale/);
  const unchanged = (await runChild<RecurringSnapshot>("snapshot", { sourceId })).value!;
  assert.equal(unchanged.rows.length, snapshot.rows.length);
  assert.equal(unchanged.source.nextDueAt, THIRD_OCCURRENCE);
});

after(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});
