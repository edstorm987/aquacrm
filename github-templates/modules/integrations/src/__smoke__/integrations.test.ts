// Integrations smoke. node:test via tsx --test.

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
  IntegrationNotFoundError,
  INTEGRATION_KINDS,
  KIND_CONFIG_SHAPES,
  MAX_LOG_ENTRIES,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT: ClientId = "client_x";
const ALICE: UserId = "user_alice";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown; scope: { agencyId: AgencyId; clientId?: ClientId } }[] };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown; scope: { agencyId: AgencyId; clientId?: ClientId } }[] = [];
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
    emit(scope, name, payload) { events.push({ name, payload, scope }); },
  };
  return { storage, activity, events: eventBus, inspect: { activityLog, events } };
}

function agencyContainer(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
  });
}

function clientContainer(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, clientId: CLIENT, storage: world.storage,
    activity: world.activity, events: world.events,
  });
}

describe("@aqua/plugin-integrations smoke", () => {
  test("1. KIND_CONFIG_SHAPES exposes config field metadata for all 7 kinds; all have ≥1 field", () => {
    assert.equal(INTEGRATION_KINDS.length, 7);
    for (const k of INTEGRATION_KINDS) {
      const fields = KIND_CONFIG_SHAPES[k];
      assert.ok(Array.isArray(fields));
      assert.ok(fields.length >= 1, `kind ${k} has no fields`);
    }
  });

  test("2. create stores integration; status='intended' by default; emits integrations.integration.created; rejects invalid kind + empty label", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, { kind: "stripe", label: "Stripe live" });
    assert.equal(r.status, "intended");
    assert.equal(r.kind, "stripe");
    assert.equal(r.credentialsRef, undefined);
    assert.ok(w.inspect.events.some(e => e.name === "integrations.integration.created"));
    await assert.rejects(() => c.integrations.create(ALICE, { kind: "bogus" as never, label: "x" }));
    await assert.rejects(() => c.integrations.create(ALICE, { kind: "slack", label: "" }));
    resetClock();
  });

  test("3. create with credentialsRef auto-promotes status='configured' + emits configured event", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, {
      kind: "slack", label: "Aqua slack",
      credentialsRef: "vault_abc",
    });
    assert.equal(r.status, "configured");
    assert.ok(w.inspect.events.some(e => e.name === "integrations.integration.configured"));
    resetClock();
  });

  test("4. update — setting credentialsRef on intended row promotes to configured; clearing demotes back to intended", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, { kind: "mailchimp", label: "MC" });
    assert.equal(r.status, "intended");
    const u1 = await c.integrations.update(ALICE, r.id, { credentialsRef: "vault_v1" });
    assert.equal(u1.status, "configured");
    const u2 = await c.integrations.update(ALICE, r.id, { credentialsRef: null });
    assert.equal(u2.status, "intended");
    assert.equal(u2.credentialsRef, undefined);
    resetClock();
  });

  test("5. verify(ok:true) sets status=verified + lastVerifiedAt + clears lastError + emits verified", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, { kind: "stripe", label: "S", credentialsRef: "v1" });
    // First fail to seed lastError, then verify ok and check it cleared.
    t = T0 + 1000;
    const failed = await c.integrations.verify(ALICE, r.id, { ok: false, message: "auth refused" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "auth refused");
    t = T0 + 2000;
    const ok = await c.integrations.verify(ALICE, r.id, { ok: true });
    assert.equal(ok.status, "verified");
    assert.equal(ok.lastVerifiedAt, t);
    assert.equal(ok.lastError, undefined);
    assert.ok(w.inspect.events.some(e => e.name === "integrations.integration.verified"));
    assert.ok(w.inspect.events.some(e => e.name === "integrations.integration.failed"));
    resetClock();
  });

  test("6. delete removes from list+index + emits deleted; not-found throws IntegrationNotFoundError", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, { kind: "zapier", label: "Z" });
    await c.integrations.delete(ALICE, r.id);
    assert.equal((await c.integrations.list()).length, 0);
    assert.ok(w.inspect.events.some(e => e.name === "integrations.integration.deleted"));
    await assert.rejects(
      () => c.integrations.delete(ALICE, "int_missing"),
      (err: unknown) => err instanceof IntegrationNotFoundError,
    );
    resetClock();
  });

  test("7. list filters by kind + status independently", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const a = await c.integrations.create(ALICE, { kind: "stripe", label: "S1" });
    await c.integrations.create(ALICE, { kind: "slack",  label: "Sl" });
    const c2 = await c.integrations.create(ALICE, { kind: "stripe", label: "S2", credentialsRef: "v" });
    await c.integrations.verify(ALICE, c2.id, { ok: true });

    const stripes = await c.integrations.list({ kind: "stripe" });
    assert.equal(stripes.length, 2);
    const verified = await c.integrations.list({ status: "verified" });
    assert.equal(verified.length, 1);
    assert.equal(verified[0]!.id, c2.id);
    const intended = await c.integrations.list({ status: "intended" });
    assert.equal(intended.length, 2);
    assert.ok(intended.some(i => i.id === a.id));
    resetClock();
  });

  test("8. ping records outgoing webhook log entry + emits integrations.webhook.outgoing + activity action", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, { kind: "custom-webhook", label: "Hook", credentialsRef: "v" });
    const row = await c.webhooks.ping(ALICE, r.id, { url: "https://example.test/in" });
    assert.equal(row.direction, "outgoing");
    assert.equal(row.ok, true);
    assert.equal(row.url, "https://example.test/in");
    const log = await c.webhooks.list({ direction: "outgoing" });
    assert.equal(log.length, 1);
    assert.equal(log[0]!.id, row.id);
    assert.ok(w.inspect.events.some(e => e.name === "integrations.webhook.outgoing"));
    assert.ok(w.inspect.activityLog.some(e => e.action === "integrations.webhook.outgoing"));
    resetClock();
  });

  test("9. webhook log filters by integrationId + direction", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const a = await c.integrations.create(ALICE, { kind: "slack",   label: "A", credentialsRef: "v" });
    const b = await c.integrations.create(ALICE, { kind: "stripe",  label: "B", credentialsRef: "v" });
    await c.webhooks.ping(ALICE, a.id);
    await c.webhooks.ping(ALICE, a.id);
    await c.webhooks.ping(ALICE, b.id);
    await c.webhooks.append({ integrationId: a.id, direction: "incoming", ok: true, bodyPreview: "{}" });

    const aOnly = await c.webhooks.list({ integrationId: a.id });
    assert.equal(aOnly.length, 3);
    const inc = await c.webhooks.list({ direction: "incoming" });
    assert.equal(inc.length, 1);
    const aIn = await c.webhooks.list({ integrationId: a.id, direction: "incoming" });
    assert.equal(aIn.length, 1);
    resetClock();
  });

  test("10. webhook log is bounded to MAX_LOG_ENTRIES per scope (ring-buffer drops oldest on append)", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) {
      await c.webhooks.append({ direction: "outgoing", ok: true, bodyPreview: `n=${i}` });
    }
    const all = await c.webhooks.list();
    assert.equal(all.length, MAX_LOG_ENTRIES, "log capped at MAX_LOG_ENTRIES");
    // The 5 oldest were dropped — `n=0`..`n=4` no longer present.
    const previews = all.map(e => e.bodyPreview);
    assert.ok(!previews.includes("n=0"));
    assert.ok(!previews.includes("n=4"));
    assert.ok(previews.includes("n=5"));
    resetClock();
  });

  test("11. scopePolicy='either' — agency-scope and client-scope installs are isolated", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const agency = agencyContainer(w);
    const client = clientContainer(w);
    const aRow = await agency.integrations.create(ALICE, { kind: "stripe", label: "agency-stripe" });
    const cRow = await client.integrations.create(ALICE, { kind: "stripe", label: "client-stripe" });

    const agencyList = await agency.integrations.list();
    const clientList = await client.integrations.list();
    assert.equal(agencyList.length, 1);
    assert.equal(clientList.length, 1);
    assert.equal(agencyList[0]!.id, aRow.id);
    assert.equal(clientList[0]!.id, cRow.id);

    // Cross-scope get returns null.
    assert.equal(await agency.integrations.get(cRow.id), null, "agency cannot see client row");
    assert.equal(await client.integrations.get(aRow.id), null, "client cannot see agency row");

    // Webhook log is scope-isolated too.
    await agency.webhooks.append({ direction: "incoming", ok: true });
    await client.webhooks.append({ direction: "incoming", ok: true });
    assert.equal((await agency.webhooks.list()).length, 1);
    assert.equal((await client.webhooks.list()).length, 1);
    resetClock();
  });

  test("12. activity — created + verified + failed + deleted + ping all log under category 'settings' with `integrations.*` action prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = agencyContainer(w);
    const r = await c.integrations.create(ALICE, { kind: "google", label: "G", credentialsRef: "v" });
    await c.integrations.verify(ALICE, r.id, { ok: true });
    await c.integrations.verify(ALICE, r.id, { ok: false, message: "boom" });
    await c.webhooks.ping(ALICE, r.id);
    await c.integrations.delete(ALICE, r.id);
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("integrations.integration.created"));
    assert.ok(actions.includes("integrations.integration.verified"));
    assert.ok(actions.includes("integrations.integration.failed"));
    assert.ok(actions.includes("integrations.integration.deleted"));
    assert.ok(actions.includes("integrations.webhook.outgoing"));
    assert.ok(w.inspect.activityLog.every(e => e.category === "settings"));
    assert.ok(w.inspect.activityLog.every(e => e.action.startsWith("integrations.")));
    resetClock();
  });
});

resetClock();
