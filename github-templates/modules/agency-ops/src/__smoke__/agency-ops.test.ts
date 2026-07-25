// Agency-ops smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import { CADENCE_MS, DEFAULT_RECURRING_TASKS } from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const ACTOR: UserId = "user_admin";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  return { storage, activity, events: eventBus, inspect: { activityLog, events } };
}

function container(world: World) {
  return containerWithDeps({
    agencyId: AGENCY,
    storage: world.storage,
    activity: world.activity,
    events: world.events,
  });
}

describe("@aqua/plugin-agency-ops smoke", () => {
  test("1. RecurringTask CRUD — create + list + update + archive", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const t = await c.tasks.create(ACTOR, { title: "Weekly KPI review", cadence: "weekly" });
    assert.equal(t.active, true);
    assert.equal(t.nextDue, T0);
    let list = await c.tasks.list();
    assert.equal(list.length, 1);
    const upd = await c.tasks.update(ACTOR, t.id, { description: "Pull MRR + churn." });
    assert.equal(upd.description, "Pull MRR + churn.");
    await c.tasks.archive(ACTOR, t.id);
    list = await c.tasks.list({ active: true });
    assert.equal(list.length, 0);
    list = await c.tasks.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.active, false);
    resetClock();
  });

  test("2. complete rolls nextDue forward by exactly one cadence window relative to prior nextDue (not now)", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const task = await c.tasks.create(ACTOR, { title: "Daily inbox", cadence: "daily" });
    const startDue = task.nextDue;

    // Skip 3 days then complete — late completion rolls relative to
    // startDue, not to "now". So nextDue should be startDue + 1 day,
    // even though we completed 3 days late.
    t = T0 + 3 * 86_400_000;
    const done1 = await c.tasks.complete(ACTOR, task.id);
    assert.equal(done1.nextDue, startDue + CADENCE_MS.daily, "rolls relative to missed window");
    assert.equal(done1.lastDoneAt, t);

    // Complete again — rolls forward another stride from previous nextDue.
    const done2 = await c.tasks.complete(ACTOR, task.id);
    assert.equal(done2.nextDue, startDue + 2 * CADENCE_MS.daily);
    resetClock();
  });

  test("3. seedDefaults is idempotent — adds DEFAULT_RECURRING_TASKS, second call is a no-op", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const r1 = await c.tasks.seedDefaults(ACTOR);
    assert.equal(r1.seeded, DEFAULT_RECURRING_TASKS.length);
    const r2 = await c.tasks.seedDefaults(ACTOR);
    assert.equal(r2.seeded, 0);
    assert.equal(r2.existed, DEFAULT_RECURRING_TASKS.length);
    const list = await c.tasks.list();
    assert.equal(list.length, DEFAULT_RECURRING_TASKS.length);
    resetClock();
  });

  test("4. RecurringTask filter overdue=true returns only nextDue<=now active rows", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const past = await c.tasks.create(ACTOR, { title: "P", cadence: "daily", startDue: T0 - 86_400_000 });
    const future = await c.tasks.create(ACTOR, { title: "F", cadence: "daily", startDue: T0 + 86_400_000 });
    const inactive = await c.tasks.create(ACTOR, { title: "I", cadence: "daily", startDue: T0 - 86_400_000, active: false });
    void past; void future; void inactive;
    t = T0;
    const overdue = await c.tasks.list({ overdue: true });
    assert.deepEqual(overdue.map(x => x.title), ["P"]);
    const onTime = await c.tasks.list({ overdue: false });
    // future + inactive both fall here (inactive isOverdue is false).
    assert.deepEqual(new Set(onTime.map(x => x.title)), new Set(["F", "I"]));
    resetClock();
  });

  test("5. Status item — create defaults to unknown; markChecked sets level + lastChecked + emits status.checked", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const s = await c.status.create(ACTOR, { system: "Postgres" });
    assert.equal(s.status, "unknown");
    assert.equal(s.lastChecked, undefined);
    t = T0 + 1000;
    const checked = await c.status.markChecked(ACTOR, s.id, { status: "green", message: "All replicas healthy." });
    assert.equal(checked.status, "green");
    assert.equal(checked.lastChecked, t);
    assert.equal(checked.lastCheckedBy, ACTOR);
    assert.ok(world.inspect.events.some(e => e.name === "agency-ops.status.checked"));
    resetClock();
  });

  test("6. Incident.open + resolve — startedAt defaults to now; resolve writes resolvedAt + emits resolved event with durationMs", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const inc = await c.incidents.open(ACTOR, { title: "Stripe webhook 500s", severity: "major" });
    assert.equal(inc.startedAt, T0);
    assert.equal(inc.resolvedAt, undefined);

    t = T0 + 90 * 60_000; // 90m later
    const resolved = await c.incidents.resolve(ACTOR, inc.id);
    assert.equal(resolved.resolvedAt, t);
    const ev = world.inspect.events.find(e => e.name === "agency-ops.incident.resolved");
    assert.ok(ev);
    assert.equal((ev?.payload as { durationMs: number }).durationMs, 90 * 60_000);
    resetClock();
  });

  test("7. Incident.update is idempotent on resolvedAt — emits resolved event ONCE; re-update does not re-emit", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const inc = await c.incidents.open(ACTOR, { title: "x", severity: "minor" });
    await c.incidents.update(ACTOR, inc.id, { resolvedAt: T0 + 1000 });
    const resolvedEvents1 = world.inspect.events.filter(e => e.name === "agency-ops.incident.resolved").length;
    assert.equal(resolvedEvents1, 1);
    // Re-update with the same / different resolvedAt — already
    // resolved, so no duplicate event.
    await c.incidents.update(ACTOR, inc.id, { resolvedAt: T0 + 2000 });
    const resolvedEvents2 = world.inspect.events.filter(e => e.name === "agency-ops.incident.resolved").length;
    assert.equal(resolvedEvents2, 1);
    resetClock();
  });

  test("8. Incident filter resolved=true|false partitions correctly", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.incidents.open(ACTOR, { title: "A", severity: "minor" });
    const b = await c.incidents.open(ACTOR, { title: "B", severity: "minor" });
    await c.incidents.resolve(ACTOR, a.id);
    void b;
    const open = await c.incidents.list({ resolved: false });
    assert.deepEqual(open.map(i => i.title), ["B"]);
    const closed = await c.incidents.list({ resolved: true });
    assert.deepEqual(closed.map(i => i.title), ["A"]);
    resetClock();
  });

  test("9. HealthService.overview honesty contract — empty world returns hasData:false, all zero counts", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const overview = await c.health.overview();
    assert.equal(overview.hasData, false);
    assert.equal(overview.systems.total, 0);
    assert.equal(overview.recurringTasks.overdueCount, 0);
    assert.equal(overview.incidents.open, 0);
    resetClock();
  });

  test("10. HealthService.overview aggregates systems + tasks + incidents; reports overdue + criticalOpen counts", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    await c.status.create(ACTOR, { system: "S1", status: "green" });
    const s2 = await c.status.create(ACTOR, { system: "S2", status: "amber" });
    const s3 = await c.status.create(ACTOR, { system: "S3", status: "red" });
    void s2; void s3;
    await c.tasks.create(ACTOR, { title: "Overdue", cadence: "daily", startDue: T0 - 86_400_000 });
    await c.tasks.create(ACTOR, { title: "Future", cadence: "daily", startDue: T0 + 86_400_000 });
    const open = await c.incidents.open(ACTOR, { title: "Crit", severity: "critical" });
    void open;
    const overview = await c.health.overview(T0);
    assert.equal(overview.hasData, true);
    assert.deepEqual(
      { green: overview.systems.green, amber: overview.systems.amber, red: overview.systems.red, unknown: overview.systems.unknown, total: overview.systems.total },
      { green: 1, amber: 1, red: 1, unknown: 0, total: 3 },
    );
    assert.equal(overview.recurringTasks.overdueCount, 1);
    assert.equal(overview.incidents.open, 1);
    assert.equal(overview.incidents.criticalOpen, 1);
    resetClock();
  });

  test("11. RecurringTask rejects empty title; Status rejects empty system; Incident rejects empty title", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.tasks.create(ACTOR, { title: "", cadence: "daily" }));
    await assert.rejects(() => c.status.create(ACTOR, { system: "" }));
    await assert.rejects(() => c.incidents.open(ACTOR, { title: "", severity: "minor" }));
    resetClock();
  });

  test("12. Activity events — task.created/completed + incident.opened/resolved + status.checked all log activity entries under 'settings' category", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const task = await c.tasks.create(ACTOR, { title: "T", cadence: "daily" });
    await c.tasks.complete(ACTOR, task.id);
    const inc = await c.incidents.open(ACTOR, { title: "I", severity: "minor" });
    await c.incidents.resolve(ACTOR, inc.id);
    const stat = await c.status.create(ACTOR, { system: "S" });
    await c.status.markChecked(ACTOR, stat.id, { status: "green" });

    const actions = world.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("agency-ops.task.created"));
    assert.ok(actions.includes("agency-ops.task.completed"));
    assert.ok(actions.includes("agency-ops.incident.opened"));
    assert.ok(actions.includes("agency-ops.incident.resolved"));
    assert.ok(actions.includes("agency-ops.status.checked"));
    assert.ok(world.inspect.activityLog.every(e => e.category === "settings"));
    resetClock();
  });
});

resetClock();
