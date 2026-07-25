// Activity Inbox plugin smoke. node:test via tsx --test.

import { describe, test, before, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort } from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import { ALL_CATEGORIES, dayKey, resolveRange } from "../lib/domain";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const OTHER_AGENCY: AgencyId = "agency_other";
const ALICE: UserId = "user_alice";
const BOB: UserId = "user_bob";

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  log: ActivityEntry[];
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const log: ActivityEntry[] = [];
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  let seq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(seq++).padStart(4, "0")}`,
        ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      log.push(entry);
      return entry;
    },
    listActivity(filter) {
      const out = log
        .filter(e => e.agencyId === filter.agencyId)
        .filter(e => filter.clientId === undefined || e.clientId === filter.clientId)
        .slice()
        .reverse();
      return filter.limit ? out.slice(0, filter.limit) : out;
    },
  };
  return { storage, activity, log };
}

function container(world: World, agencyId: AgencyId = AGENCY) {
  return containerWithDeps({
    agencyId, storage: world.storage, activity: world.activity,
  });
}

function seedActivity(world: World, entries: Array<Partial<ActivityEntry> & { ts: number; category: ActivityCategory; action: string; message: string }>) {
  for (const e of entries) {
    setClock(() => e.ts);
    world.activity.logActivity({
      agencyId: e.agencyId ?? AGENCY,
      clientId: e.clientId,
      actorUserId: e.actorUserId,
      actorEmail: e.actorEmail,
      category: e.category,
      action: e.action,
      message: e.message,
      metadata: e.metadata,
    });
  }
  // Restore the test clock so subsequent calls (range resolution,
  // markAllRead) see the test's reference "now" rather than the last
  // seeded entry's timestamp.
  setClock(() => T0);
}

const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);
const DAY = 86_400_000;

describe("@aqua/plugin-activity-inbox smoke", () => {
  before(() => setClock(() => T0));

  beforeEach(() => setClock(() => T0));

  test("1. ALL_CATEGORIES exposes the foundation union", () => {
    assert.ok(ALL_CATEGORIES.includes("auth"));
    assert.ok(ALL_CATEGORIES.includes("sops"));
    assert.ok(ALL_CATEGORIES.includes("kanban"));
    assert.equal(new Set(ALL_CATEGORIES).size, ALL_CATEGORIES.length);
  });

  test("2. dayKey + resolveRange produce stable UTC windows", () => {
    assert.match(dayKey(T0), /^2026-05-07$/);
    const today = resolveRange("today", T0);
    assert.equal(today.start, Date.UTC(2026, 4, 7, 0, 0, 0));
    assert.equal(today.end, today.start + DAY);
    const week = resolveRange("week", T0);
    assert.equal(week.end - week.start, 7 * DAY);
    const month = resolveRange("month", T0);
    assert.equal(month.end - month.start, 30 * DAY);
    const all = resolveRange("all", T0);
    assert.equal(all.start, 0);
  });

  test("3. list returns events filtered by agency only", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 100, category: "auth", action: "login", message: "Alice logged in", clientId: "c1" },
      { ts: T0 - 200, category: "ecommerce", action: "order.created", message: "Order #1", clientId: "c2", agencyId: OTHER_AGENCY },
    ]);
    const c = container(world);
    const result = await c.inbox.list(ALICE, { range: "all" });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.message, "Alice logged in");
  });

  test("4. category filter narrows results; clientId filter narrows results", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 100, category: "auth", action: "login", message: "A", clientId: "c1" },
      { ts: T0 - 200, category: "ecommerce", action: "order.created", message: "B", clientId: "c1" },
      { ts: T0 - 300, category: "auth", action: "login", message: "C", clientId: "c2" },
    ]);
    const c = container(world);
    const cat = await c.inbox.list(ALICE, { range: "all", categories: ["auth"] });
    assert.deepEqual(cat.items.map(i => i.message).sort(), ["A", "C"]);
    const cli = await c.inbox.list(ALICE, { range: "all", clientIds: ["c1"] });
    assert.deepEqual(cli.items.map(i => i.message).sort(), ["A", "B"]);
    const both = await c.inbox.list(ALICE, { range: "all", categories: ["auth"], clientIds: ["c1"] });
    assert.deepEqual(both.items.map(i => i.message), ["A"]);
  });

  test("5. range=today excludes older entries", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 1, category: "auth", action: "login", message: "today" },
      { ts: T0 - 2 * DAY, category: "auth", action: "login", message: "two days ago" },
    ]);
    const c = container(world);
    const today = await c.inbox.list(ALICE, { range: "today" });
    assert.deepEqual(today.items.map(i => i.message), ["today"]);
    const week = await c.inbox.list(ALICE, { range: "week" });
    assert.equal(week.items.length, 2);
  });

  test("6. query filter searches message + action case-insensitively", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 1, category: "auth", action: "login", message: "Alice logged in" },
      { ts: T0 - 2, category: "ecommerce", action: "order.refunded", message: "Refund issued" },
    ]);
    const c = container(world);
    const r = await c.inbox.list(ALICE, { range: "all", query: "REFUND" });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0]?.message, "Refund issued");
  });

  test("7. read state — markAllRead sets lastReadTs; subsequent list marks items read; unreadCount = 0", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 100, category: "auth", action: "login", message: "X" },
      { ts: T0 - 50, category: "auth", action: "login", message: "Y" },
    ]);
    const c = container(world);
    const before = await c.inbox.list(ALICE, { range: "all" });
    assert.equal(before.unreadCount, 2);
    assert.deepEqual(before.items.map(i => i.read), [false, false]);

    setClock(() => T0);
    await c.inbox.markAllRead(ALICE);
    const after = await c.inbox.list(ALICE, { range: "all" });
    assert.equal(after.unreadCount, 0);
    assert.deepEqual(after.items.map(i => i.read), [true, true]);
    assert.equal(await c.inbox.unreadCount(ALICE), 0);
  });

  test("8. unreadOnly filter hides read items but does not change unreadCount semantics", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 200, category: "auth", action: "login", message: "old" },
    ]);
    const c = container(world);
    setClock(() => T0 - 100);
    await c.inbox.markAllRead(ALICE);
    seedActivity(world, [
      { ts: T0 - 50, category: "auth", action: "login", message: "fresh" },
    ]);
    const r = await c.inbox.list(ALICE, { range: "all", unreadOnly: true });
    assert.deepEqual(r.items.map(i => i.message), ["fresh"]);
    assert.equal(r.unreadCount, 1);
  });

  test("9. read state is per-actor (Alice vs Bob)", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 100, category: "auth", action: "login", message: "evt" },
    ]);
    const c = container(world);
    setClock(() => T0);
    await c.inbox.markAllRead(ALICE);
    assert.equal(await c.inbox.unreadCount(ALICE), 0);
    assert.equal(await c.inbox.unreadCount(BOB), 1);
  });

  test("10. groups bucket by day + clientId; agency-level rows precede client rows within a day", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 1, category: "auth", action: "login", message: "agency-evt" },
      { ts: T0 - 2, category: "auth", action: "login", message: "c1-evt", clientId: "c1" },
      { ts: T0 - 3, category: "auth", action: "login", message: "c2-evt", clientId: "c2" },
    ]);
    const c = container(world);
    const r = await c.inbox.list(ALICE, { range: "all" });
    assert.equal(r.groups.length, 3);
    assert.equal(r.groups[0]?.clientId, undefined);
    const clientIds = r.groups.slice(1).map(g => g.clientId);
    assert.deepEqual(clientIds, ["c1", "c2"]);
  });

  test("11. setFilters / getFilters round-trip per-actor", async () => {
    const world = buildWorld();
    const c = container(world);
    assert.equal(await c.inbox.getFilters(ALICE), null);
    await c.inbox.setFilters(ALICE, { range: "week", categories: ["finance"], unreadOnly: true });
    const f = await c.inbox.getFilters(ALICE);
    assert.equal(f?.range, "week");
    assert.deepEqual(f?.categories, ["finance"]);
    assert.equal(f?.unreadOnly, true);
    assert.equal(await c.inbox.getFilters(BOB), null);
  });

  test("12. unreadCount matches list().unreadCount for the same actor", async () => {
    const world = buildWorld();
    seedActivity(world, [
      { ts: T0 - 10, category: "kanban", action: "card.moved", message: "k1" },
      { ts: T0 - 20, category: "kanban", action: "card.moved", message: "k2" },
      { ts: T0 - 30, category: "kanban", action: "card.moved", message: "k3" },
    ]);
    const c = container(world);
    const r = await c.inbox.list(ALICE, { range: "all" });
    const direct = await c.inbox.unreadCount(ALICE);
    assert.equal(r.unreadCount, direct);
    assert.equal(direct, 3);
  });
});

resetClock();
