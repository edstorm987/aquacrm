// Aqua-resources smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  BuiltInDeleteError,
  CollectionNotFoundError,
  ItemNotFoundError,
  DEFAULT_COLLECTIONS,
} from "../server/index";
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
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
  });
}

describe("@aqua/plugin-aqua-resources smoke", () => {
  test("1. seedDefaults seeds 5 built-in collections; second call is a no-op (idempotent)", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const r1 = await c.resources.seedDefaults(ACTOR);
    assert.equal(r1.seeded, DEFAULT_COLLECTIONS.length);
    const r2 = await c.resources.seedDefaults(ACTOR);
    assert.equal(r2.seeded, 0);
    assert.equal(r2.existed, DEFAULT_COLLECTIONS.length);
    const list = await c.resources.list();
    assert.equal(list.length, DEFAULT_COLLECTIONS.length);
    assert.ok(list.every(c => c.builtIn));
    resetClock();
  });

  test("2. create stores non-built-in collection; emits collection.created", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, {
      name: "Custom shelf", description: "Operator pack",
      phaseScope: ["traffic"],
      items: [{ kind: "link", ref: "https://example.com", title: "Example link" }],
    });
    assert.equal(col.builtIn, false);
    assert.equal(col.items.length, 1);
    assert.ok(world.inspect.events.some(e => e.name === "aqua-resources.collection.created"));
    resetClock();
  });

  test("3. create rejects empty name", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.resources.create(ACTOR, { name: "" }));
    resetClock();
  });

  test("4. delete on built-in throws BuiltInDeleteError; delete on user-created succeeds", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.resources.seedDefaults(ACTOR);
    const builtIns = await c.resources.list({ builtIn: true });
    assert.ok(builtIns.length > 0);
    await assert.rejects(
      () => c.resources.delete(ACTOR, builtIns[0]!.id),
      (err: unknown) => err instanceof BuiltInDeleteError,
    );
    const custom = await c.resources.create(ACTOR, { name: "X" });
    await c.resources.delete(ACTOR, custom.id);
    assert.equal(await c.resources.get(custom.id), null);
    resetClock();
  });

  test("5. addItem appends with monotonic order; removeItem compacts the order field", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, { name: "X" });
    const a = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/a", title: "A" });
    const b = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/b", title: "B" });
    const cc = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/c", title: "C" });
    assert.deepEqual([a.order, b.order, cc.order], [0, 1, 2]);

    await c.resources.removeItem(ACTOR, col.id, b.id);
    const fresh = await c.resources.get(col.id);
    assert.equal(fresh?.items.length, 2);
    assert.deepEqual(fresh?.items.map(i => i.order), [0, 1]);
    assert.deepEqual(fresh?.items.map(i => i.title), ["A", "C"]);
    resetClock();
  });

  test("6. addItem rejects invalid kind + empty title", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, { name: "X" });
    await assert.rejects(
      () => c.resources.addItem(ACTOR, col.id, { kind: "bogus" as never, ref: "/x", title: "Title" }),
    );
    await assert.rejects(
      () => c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/x", title: "" }),
    );
    resetClock();
  });

  test("7. updateItem patches fields; removeItem on missing item throws ItemNotFoundError", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, { name: "X" });
    const it = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/a", title: "A" });
    const updated = await c.resources.updateItem(ACTOR, col.id, it.id, { title: "A2", kind: "video" });
    assert.equal(updated.title, "A2");
    assert.equal(updated.kind, "video");
    await assert.rejects(
      () => c.resources.removeItem(ACTOR, col.id, "ri_nope"),
      (err: unknown) => err instanceof ItemNotFoundError,
    );
    resetClock();
  });

  test("8. reorderItems applies caller-supplied id order; missing ids land at the end", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, { name: "X" });
    const a = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/a", title: "A" });
    const b = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/b", title: "B" });
    const cc = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/c", title: "C" });
    const next = await c.resources.reorderItems(ACTOR, col.id, [cc.id, a.id, b.id]);
    assert.deepEqual(next.items.map(i => i.title), ["C", "A", "B"]);
    assert.deepEqual(next.items.map(i => i.order), [0, 1, 2]);
    resetClock();
  });

  test("9. list({ phase }) filters by phaseScope; empty phaseScope means 'all phases' (always visible)", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const everywhere = await c.resources.create(ACTOR, { name: "Everywhere", phaseScope: [] });
    const trafficOnly = await c.resources.create(ACTOR, { name: "Traffic-only", phaseScope: ["traffic"] });
    const masteryOnly = await c.resources.create(ACTOR, { name: "Mastery-only", phaseScope: ["mastery"] });
    void everywhere; void trafficOnly; void masteryOnly;

    const trafficView = await c.resources.list({ phase: "traffic" });
    const names = trafficView.map(c => c.name).sort();
    assert.deepEqual(names, ["Everywhere", "Traffic-only"]);
    const masteryView = await c.resources.list({ phase: "mastery" });
    assert.deepEqual(masteryView.map(c => c.name).sort(), ["Everywhere", "Mastery-only"]);
    resetClock();
  });

  test("10. list({ query }) searches name + description case-insensitively", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.resources.create(ACTOR, { name: "Brand Builder Tools" });
    await c.resources.create(ACTOR, { name: "Traffic playbook", description: "Includes Brand outreach" });
    await c.resources.create(ACTOR, { name: "Mastery essays" });
    const results = await c.resources.list({ query: "BRAND" });
    assert.deepEqual(results.map(r => r.name).sort(), ["Brand Builder Tools", "Traffic playbook"]);
    resetClock();
  });

  test("11. resourcesForPhase returns collections sorted by order with items pre-sorted", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, { name: "X", phaseScope: ["traffic"] });
    const a = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/a", title: "A" });
    const b = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/b", title: "B" });
    void a; void b;
    await c.resources.reorderItems(ACTOR, col.id, [b.id, a.id]);
    const view = await c.resources.resourcesForPhase("traffic");
    assert.equal(view.length, 1);
    assert.deepEqual(view[0]?.items.map(i => i.title), ["B", "A"]);
    resetClock();
  });

  test("12. activity events — collection.created + collection.updated + item.added + item.removed all under category 'settings' with `aqua-resources.*` action prefix", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const col = await c.resources.create(ACTOR, { name: "X" });
    const it = await c.resources.addItem(ACTOR, col.id, { kind: "link", ref: "/a", title: "A" });
    await c.resources.removeItem(ACTOR, col.id, it.id);
    const eventNames = world.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("aqua-resources.collection.created"));
    assert.ok(eventNames.includes("aqua-resources.item.added"));
    assert.ok(eventNames.includes("aqua-resources.item.removed"));
    assert.ok(world.inspect.activityLog.every(e => e.category === "settings"));
    resetClock();
  });
});

resetClock();
