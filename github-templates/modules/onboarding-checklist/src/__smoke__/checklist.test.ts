// Onboarding-checklist smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, KanbanPort } from "../server/ports";
import { containerWithDeps } from "../server/index";
import { DEFAULT_SEED_ITEMS } from "../lib/domain";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT: ClientId = "client_felicia";
const ACTOR: UserId = "user_admin";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  kanban: KanbanPort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    kanbanCards: { title: string; description?: string }[];
  };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const kanbanCards: { title: string; description?: string }[] = [];
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
  const kanban: KanbanPort = {
    postCardToClientTasksBoard(args) {
      kanbanCards.push({ title: args.title, ...(args.description !== undefined ? { description: args.description } : {}) });
      return { posted: true, cardId: `card_${kanbanCards.length}` };
    },
  };
  return { storage, activity, events: eventBus, kanban, inspect: { activityLog, events, kanbanCards } };
}

function container(world: World, withKanban = true) {
  return containerWithDeps({
    agencyId: AGENCY, clientId: CLIENT, storage: world.storage,
    activity: world.activity, events: world.events,
    ...(withKanban ? { kanban: world.kanban } : {}),
  });
}

describe("@aqua/plugin-onboarding-checklist smoke", () => {
  test("1. seedDefaults installs 8 items idempotently", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r1 = await c.checklist.seedDefaults(ACTOR);
    assert.equal(r1.seeded, true);
    assert.equal(r1.itemCount, DEFAULT_SEED_ITEMS.length);
    const r2 = await c.checklist.seedDefaults(ACTOR);
    assert.equal(r2.seeded, false);
    const items = await c.checklist.list();
    assert.equal(items.length, DEFAULT_SEED_ITEMS.length);
    resetClock();
  });

  test("2. seed items split by ownerKind in expected mix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.checklist.seedDefaults(ACTOR);
    const items = await c.checklist.list();
    const agency = items.filter(i => i.ownerKind === "agency").length;
    const customer = items.filter(i => i.ownerKind === "customer").length;
    assert.ok(agency > 0 && customer > 0, "both ownerKinds represented");
    assert.equal(agency + customer, DEFAULT_SEED_ITEMS.length);
    resetClock();
  });

  test("3. create appends with monotonic ordering", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.checklist.create(ACTOR, { title: "Alpha", ownerKind: "agency" });
    const b = await c.checklist.create(ACTOR, { title: "Bravo", ownerKind: "customer" });
    const cc = await c.checklist.create(ACTOR, { title: "Charlie", ownerKind: "agency" });
    assert.equal(a.ordering, 0);
    assert.equal(b.ordering, 1);
    assert.equal(cc.ordering, 2);
    resetClock();
  });

  test("4. tick → done emits onboarding.item.completed once + sets completedAt/By", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const it = await c.checklist.create(ACTOR, { title: "Welcome", ownerKind: "agency" });
    const done = await c.checklist.tick(ACTOR, it.id, "done");
    assert.equal(done.status, "done");
    assert.equal(done.completedBy, ACTOR);
    assert.ok(done.completedAt && done.completedAt > 0);
    const completed = w.inspect.events.filter(e => e.name === "onboarding.item.completed");
    assert.equal(completed.length, 1);
    // re-tick same status — no re-emit
    await c.checklist.tick(ACTOR, it.id, "done");
    assert.equal(w.inspect.events.filter(e => e.name === "onboarding.item.completed").length, 1);
    resetClock();
  });

  test("5. tick → todo from done clears completedAt/By", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const it = await c.checklist.create(ACTOR, { title: "x", ownerKind: "agency" });
    await c.checklist.tick(ACTOR, it.id, "done");
    const back = await c.checklist.tick(ACTOR, it.id, "todo");
    assert.equal(back.status, "todo");
    assert.equal(back.completedAt, undefined);
    assert.equal(back.completedBy, undefined);
    resetClock();
  });

  test("6. completionPct counts done + skipped as handled", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    const b = await c.checklist.create(ACTOR, { title: "b", ownerKind: "agency" });
    const cc = await c.checklist.create(ACTOR, { title: "c", ownerKind: "agency" });
    await c.checklist.tick(ACTOR, a.id, "done");
    await c.checklist.tick(ACTOR, b.id, "skipped");
    let pct = await c.checklist.completionPct();
    assert.equal(pct.total, 3);
    assert.equal(pct.done, 1);
    assert.equal(pct.skipped, 1);
    assert.equal(pct.todo, 1);
    assert.equal(pct.pct, 67);
    await c.checklist.tick(ACTOR, cc.id, "done");
    pct = await c.checklist.completionPct();
    assert.equal(pct.pct, 100);
    resetClock();
  });

  test("7. 100% completion emits onboarding.completed once + posts kanban hand-off card", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w, true);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    const b = await c.checklist.create(ACTOR, { title: "b", ownerKind: "customer" });
    await c.checklist.tick(ACTOR, a.id, "done");
    assert.equal(w.inspect.events.filter(e => e.name === "onboarding.completed").length, 0);
    await c.checklist.tick(ACTOR, b.id, "done");
    assert.equal(w.inspect.events.filter(e => e.name === "onboarding.completed").length, 1);
    assert.equal(w.inspect.kanbanCards.length, 1);
    assert.match(w.inspect.kanbanCards[0]?.title ?? "", /Diagnostics/i);
    // re-tick another item — no re-emit, no second card
    await c.checklist.tick(ACTOR, a.id, "todo");
    await c.checklist.tick(ACTOR, a.id, "done");
    assert.equal(w.inspect.events.filter(e => e.name === "onboarding.completed").length, 1);
    assert.equal(w.inspect.kanbanCards.length, 1);
    resetClock();
  });

  test("8. without kanban port, 100% still emits event but no card posted", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w, false);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    await c.checklist.tick(ACTOR, a.id, "done");
    assert.equal(w.inspect.events.filter(e => e.name === "onboarding.completed").length, 1);
    assert.equal(w.inspect.kanbanCards.length, 0);
    resetClock();
  });

  test("9. reorder applies new sequence; missing ids appended in original order", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    const b = await c.checklist.create(ACTOR, { title: "b", ownerKind: "agency" });
    const cc = await c.checklist.create(ACTOR, { title: "c", ownerKind: "agency" });
    const ord = await c.checklist.reorder([cc.id, a.id]);
    assert.deepEqual(ord.map(i => i.id), [cc.id, a.id, b.id]);
    assert.deepEqual(ord.map(i => i.ordering), [0, 1, 2]);
    resetClock();
  });

  test("10. delete removes item and de-indexes", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    await c.checklist.delete(ACTOR, a.id);
    assert.equal((await c.checklist.list()).length, 0);
    assert.equal(await c.checklist.get(a.id), null);
    resetClock();
  });

  test("11. bulkTick processes multiple ids; missing ids skipped", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    const b = await c.checklist.create(ACTOR, { title: "b", ownerKind: "agency" });
    const out = await c.checklist.bulkTick(ACTOR, [
      { id: a.id, status: "done" },
      { id: b.id, status: "skipped" },
      { id: "oci_missing", status: "done" },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0]?.status, "done");
    assert.equal(out[1]?.status, "skipped");
    resetClock();
  });

  test("12. activity entries use category 'onboarding' with onboarding.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.checklist.create(ACTOR, { title: "a", ownerKind: "agency" });
    await c.checklist.tick(ACTOR, a.id, "done");
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.ok(cats.has("onboarding"));
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("onboarding.item.created"));
    assert.ok(actions.includes("onboarding.item.completed"));
    assert.ok(actions.includes("onboarding.completed"));
    assert.ok(w.inspect.activityLog.every(e => e.category === "onboarding"));
    resetClock();
  });

  test("13. tenant isolation — items from other client invisible", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c1 = container(w);
    const c2 = containerWithDeps({
      agencyId: AGENCY, clientId: "client_other", storage: w.storage,
      activity: w.activity, events: w.events,
    });
    await c1.checklist.create(ACTOR, { title: "felicia-only", ownerKind: "agency" });
    assert.equal((await c1.checklist.list()).length, 1);
    assert.equal((await c2.checklist.list()).length, 0);
    resetClock();
  });
});

resetClock();
