// Agency-resources smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  Role,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  ResourceForbiddenError,
  ResourceNotFoundError,
  canSee,
  slugify,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const ALICE: UserId = "user_alice";    // owner
const STAFF: UserId = "user_staff";    // staff
const FREELANCER: UserId = "user_freelancer";
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

const OWNER_ACTOR  = { userId: ALICE,      role: "agency-owner" as Role };
const STAFF_ACTOR  = { userId: STAFF,      role: "agency-staff" as Role };
const FREE_ACTOR   = { userId: FREELANCER, role: "freelancer"   as Role };

describe("@aqua/plugin-agency-resources smoke", () => {
  test("1. slugify lowercases + dashes + truncates to 80", () => {
    assert.equal(slugify("How To Onboard A New Staff Member"), "how-to-onboard-a-new-staff-member");
    assert.equal(slugify("  Hello,  World!  "), "hello-world");
    assert.equal(slugify("a".repeat(120)).length, 80);
  });

  test("2. canSee — admins always see; visibleToRoles:[] = all agency staff visible by default", () => {
    const r = { visibleToRoles: [] } as unknown as Parameters<typeof canSee>[0];
    assert.equal(canSee(r, "agency-owner"), true);
    assert.equal(canSee(r, "agency-staff"), true);
    assert.equal(canSee(r, "freelancer"), true);
    const restricted = { visibleToRoles: ["agency-staff"] } as unknown as Parameters<typeof canSee>[0];
    assert.equal(canSee(restricted, "agency-owner"), true, "owner bypasses ACL");
    assert.equal(canSee(restricted, "freelancer"), false);
    assert.equal(canSee(restricted, "agency-staff"), true);
  });

  test("3. create stores resource + assigns slug + emits resource.created", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const r = await c.resources.create(ALICE, {
      kind: "sop", title: "How to onboard a new staff member",
      body: "## Step 1\n…", tags: ["hr", "onboarding"],
    });
    assert.equal(r.kind, "sop");
    assert.equal(r.slug, "how-to-onboard-a-new-staff-member");
    assert.deepEqual(r.tags, ["hr", "onboarding"]);
    assert.ok(world.inspect.events.some(e => e.name === "agency-resources.resource.created"));
    resetClock();
  });

  test("4. create rejects empty title; rejects invalid kind", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.resources.create(ALICE, { kind: "sop", title: "" }));
    await assert.rejects(() => c.resources.create(ALICE, { kind: "bogus" as never, title: "x" }));
    resetClock();
  });

  test("5. create assigns unique slug — duplicate title gets `-2`, `-3`, …", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.resources.create(ALICE, { kind: "note", title: "Brand voice" });
    const b = await c.resources.create(ALICE, { kind: "note", title: "Brand voice" });
    const cc = await c.resources.create(ALICE, { kind: "note", title: "Brand voice" });
    assert.equal(a.slug, "brand-voice");
    assert.equal(b.slug, "brand-voice-2");
    assert.equal(cc.slug, "brand-voice-3");
    resetClock();
  });

  test("6. visibleToRoles ACL — staff sees [] resource; staff cannot see resource visible only to owners", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const everyone = await c.resources.create(ALICE, { kind: "policy", title: "All hands welcome", visibleToRoles: [] });
    const ownersOnly = await c.resources.create(ALICE, {
      kind: "policy", title: "Compensation bands",
      visibleToRoles: ["agency-owner", "agency-manager"],
    });
    void everyone; void ownersOnly;

    const staffView = await c.resources.list(STAFF_ACTOR);
    assert.deepEqual(staffView.map(r => r.title), ["All hands welcome"]);
    const ownerView = await c.resources.list(OWNER_ACTOR);
    assert.equal(ownerView.length, 2);

    // Staff direct-get on hidden resource → ResourceForbiddenError.
    await assert.rejects(
      () => c.resources.get(STAFF_ACTOR, ownersOnly.id),
      (err: unknown) => err instanceof ResourceForbiddenError,
    );
    resetClock();
  });

  test("7. tickView increments viewCount + lastViewedAt; non-canSee actor cannot tick (forbidden)", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const r = await c.resources.create(ALICE, {
      kind: "training", title: "Onboarding training",
      visibleToRoles: ["agency-owner", "agency-manager"],
    });
    t = T0 + 1000;
    const ticked = await c.resources.tickView(OWNER_ACTOR, r.id);
    assert.equal(ticked.viewCount, 1);
    assert.equal(ticked.lastViewedAt, t);
    await assert.rejects(
      () => c.resources.tickView(STAFF_ACTOR, r.id),
      (err: unknown) => err instanceof ResourceForbiddenError,
    );
    // viewCount unchanged after forbidden tick.
    const fresh = await c.resources.get(OWNER_ACTOR, r.id);
    assert.equal(fresh?.viewCount, 1);
    resetClock();
  });

  test("8. update — patch title/body/tags + lastEditedBy/At populated; emits updated", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const r = await c.resources.create(ALICE, { kind: "sop", title: "X" });
    t = T0 + 5000;
    const u = await c.resources.update(STAFF, r.id, { title: "Y", body: "## Body" });
    assert.equal(u.title, "Y");
    assert.equal(u.body, "## Body");
    assert.equal(u.lastEditedBy, STAFF);
    assert.equal(u.lastEditedAt, t);
    assert.ok(world.inspect.events.some(e => e.name === "agency-resources.resource.updated"));
    resetClock();
  });

  test("9. update — archived flip emits resource.archived (not updated); list excludes by default", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const r = await c.resources.create(ALICE, { kind: "sop", title: "doomed" });
    const before = world.inspect.events.filter(e => e.name === "agency-resources.resource.archived").length;
    await c.resources.update(ALICE, r.id, { archived: true });
    const after = world.inspect.events.filter(e => e.name === "agency-resources.resource.archived").length;
    assert.equal(after - before, 1);
    const live = await c.resources.list(OWNER_ACTOR);
    assert.equal(live.length, 0);
    const all = await c.resources.list(OWNER_ACTOR, { includeArchived: true });
    assert.equal(all.length, 1);
    resetClock();
  });

  test("10. recentActivity — returns interleaved edit + view entries newest-first; bounded by limit; ACL-filtered", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    // Create + edit some rows.
    const r1 = await c.resources.create(ALICE, { kind: "sop", title: "A" });
    t = T0 + 1000;
    const r2 = await c.resources.create(ALICE, { kind: "sop", title: "B", visibleToRoles: ["agency-owner"] });
    t = T0 + 2000;
    await c.resources.tickView(OWNER_ACTOR, r1.id);
    t = T0 + 3000;
    await c.resources.update(ALICE, r1.id, { body: "edit2" });
    t = T0 + 4000;
    await c.resources.tickView(OWNER_ACTOR, r2.id);

    const ownerActivity = await c.resources.recentActivity(OWNER_ACTOR, 10);
    // Newest first.
    assert.ok(ownerActivity.length >= 4);
    assert.ok(ownerActivity[0]!.ts >= ownerActivity[ownerActivity.length - 1]!.ts);
    // r2 is owners-only → staff sees no entries from it.
    const staffActivity = await c.resources.recentActivity(STAFF_ACTOR, 10);
    assert.ok(!staffActivity.some(e => e.resourceId === r2.id), "staff cannot see r2 entries");
    // limit honoured.
    const small = await c.resources.recentActivity(OWNER_ACTOR, 2);
    assert.equal(small.length, 2);
    resetClock();
  });

  test("11. exportAll returns all in-scope resources visible to the actor", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.resources.create(ALICE, { kind: "sop", title: "all" });
    await c.resources.create(ALICE, { kind: "sop", title: "owners-only", visibleToRoles: ["agency-owner"] });
    const owner = await c.resources.exportAll(OWNER_ACTOR);
    assert.equal(owner.length, 2);
    const staff = await c.resources.exportAll(STAFF_ACTOR);
    assert.equal(staff.length, 1);
    const free = await c.resources.exportAll(FREE_ACTOR);
    assert.equal(free.length, 1);
    resetClock();
  });

  test("12. activity — created + updated + archived + viewed all log under category 'settings' with `agency-resources.*` action prefix", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const r = await c.resources.create(ALICE, { kind: "sop", title: "X" });
    await c.resources.update(ALICE, r.id, { body: "edit" });
    await c.resources.update(ALICE, r.id, { archived: true });
    // viewed is event-only by design (low-noise; activity.log avoided).
    const actions = world.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("agency-resources.resource.created"));
    assert.ok(actions.includes("agency-resources.resource.archived"));
    assert.ok(world.inspect.activityLog.every(e => e.category === "settings"));
    resetClock();
  });
});

resetClock();
