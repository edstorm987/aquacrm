// Agency-domains skeleton smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  DomainAttachConflictError,
  InvalidStatusTransitionError,
  defaultNsRecords,
  isValidHostname,
  normaliseHostname,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT: ClientId = "client_felicia";
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
    agencyId: AGENCY, clientId: CLIENT,
    storage: world.storage, activity: world.activity, events: world.events,
  });
}

describe("@aqua/plugin-agency-domains skeleton smoke", () => {
  test("1. normaliseHostname strips scheme, lowercases, drops trailing path", () => {
    assert.equal(normaliseHostname("https://Felicia.Example.com/welcome"), "felicia.example.com");
    assert.equal(normaliseHostname("  Foo.Bar  "), "foo.bar");
  });

  test("2. isValidHostname accepts FQDNs, rejects junk", () => {
    assert.equal(isValidHostname("felicia.example.com"), true);
    assert.equal(isValidHostname("a.co"), true);
    assert.equal(isValidHostname("not_a_host"), false);
    assert.equal(isValidHostname(""), false);
    assert.equal(isValidHostname("-leading.hyphen.com"), false);
    assert.equal(isValidHostname("trailing-.com"), false);
  });

  test("3. defaultNsRecords returns 3 records (A + CNAME + TXT) with a TXT carrying the hostname", () => {
    const recs = defaultNsRecords("felicia.example.com");
    assert.equal(recs.length, 3);
    assert.deepEqual(recs.map(r => r.type), ["A", "CNAME", "TXT"]);
    const txt = recs.find(r => r.type === "TXT");
    assert.ok(txt);
    assert.match(txt!.value, /felicia\.example\.com/);
  });

  test("4. create stores attach starting in `pending`; default NS records populated; emits attach.created", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "Felicia.Example.com" });
    assert.equal(a.hostname, "felicia.example.com");
    assert.equal(a.status, "pending");
    assert.equal(a.nsRecords.length, 3);
    assert.ok(world.inspect.events.some(e => e.name === "agency-domains.attach.created"));
    resetClock();
  });

  test("5. create rejects duplicate hostname (case-insensitive) with DomainAttachConflictError", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.domains.create(ACTOR, { hostname: "felicia.example.com" });
    await assert.rejects(
      () => c.domains.create(ACTOR, { hostname: "Felicia.Example.com" }),
      (err: unknown) => err instanceof DomainAttachConflictError,
    );
    resetClock();
  });

  test("6. create rejects invalid hostname", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.domains.create(ACTOR, { hostname: "not_a_host" }));
    resetClock();
  });

  test("7. transition follows STATUS_TRANSITIONS — pending→verifying→active sets verifiedAt; pending→active rejects", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "felicia.example.com" });

    await assert.rejects(
      () => c.domains.transition(ACTOR, a.id, "active"),
      (err: unknown) => err instanceof InvalidStatusTransitionError,
    );

    const verifying = await c.domains.transition(ACTOR, a.id, "verifying");
    assert.equal(verifying.status, "verifying");
    assert.equal(verifying.verifiedAt, undefined);

    t = T0 + 5000;
    const active = await c.domains.transition(ACTOR, a.id, "active");
    assert.equal(active.status, "active");
    assert.equal(active.verifiedAt, t);
    resetClock();
  });

  test("8. transition to failed records lastError; retry path failed→verifying clears no error but leaves history", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "felicia.example.com" });
    await c.domains.transition(ACTOR, a.id, "verifying");
    const failed = await c.domains.transition(ACTOR, a.id, "failed", "TXT not found");
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "TXT not found");
    const retry = await c.domains.transition(ACTOR, a.id, "verifying");
    assert.equal(retry.status, "verifying");
    // lastError carries through verifying → only cleared on success.
    assert.equal(retry.lastError, "TXT not found");
    const ok = await c.domains.transition(ACTOR, a.id, "active");
    assert.equal(ok.lastError, undefined, "lastError cleared on active");
    resetClock();
  });

  test("9. update hostname rotates the by-host reverse index; conflicting update rejects", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "old.example.com" });
    const b = await c.domains.create(ACTOR, { hostname: "other.example.com" });
    void b;
    const renamed = await c.domains.update(ACTOR, a.id, { hostname: "new.example.com" });
    assert.equal(renamed.hostname, "new.example.com");
    assert.equal(await c.domains.getByHost("old.example.com"), null);
    assert.equal((await c.domains.getByHost("new.example.com"))?.id, a.id);
    await assert.rejects(
      () => c.domains.update(ACTOR, a.id, { hostname: "other.example.com" }),
      (err: unknown) => err instanceof DomainAttachConflictError,
    );
    resetClock();
  });

  test("10. delete removes attach + reverse index; emits deleted; second delete fires NotFound", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "felicia.example.com" });
    await c.domains.delete(ACTOR, a.id);
    assert.equal(await c.domains.get(a.id), null);
    assert.equal(await c.domains.getByHost("felicia.example.com"), null);
    assert.ok(world.inspect.events.some(e => e.name === "agency-domains.attach.deleted"));
    await assert.rejects(() => c.domains.delete(ACTOR, a.id));
    resetClock();
  });

  test("11. verify() is a stub — returns { stub: true } and does NOT change status (T6 will wire real DNS)", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "felicia.example.com" });
    const result = await c.domains.verify(a.id);
    assert.equal(result.stub, true);
    assert.match(result.message, /T6/);
    const after = await c.domains.get(a.id);
    assert.equal(after?.status, "pending", "stub does not flip status");
    resetClock();
  });

  test("12. activity events — created/transitioned/deleted log under category 'settings' with action prefix agency-domains.*", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const a = await c.domains.create(ACTOR, { hostname: "felicia.example.com" });
    await c.domains.transition(ACTOR, a.id, "verifying");
    await c.domains.delete(ACTOR, a.id);
    const actions = world.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("agency-domains.attach.created"));
    assert.ok(actions.includes("agency-domains.attach.verifying"));
    assert.ok(actions.includes("agency-domains.attach.deleted"));
    assert.ok(world.inspect.activityLog.every(e => e.category === "settings"));
    resetClock();
  });
});

resetClock();
