// Public-funnel smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId, UserId, UserProfile } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, LeadUserPort, SessionPort,
} from "../server/ports";
import { containerWithDeps, FunnelInputError } from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_milesy_master";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  leadUsers: LeadUserPort;
  sessions: SessionPort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    sessionsIssued: string[];
    leadCreations: string[];   // emails of newly created leads (vs reused)
  };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const sessionsIssued: string[] = [];
  const leadCreations: string[] = [];
  const leadStore = new Map<string, UserProfile>();
  let userSeq = 1;
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
  const leadUsers: LeadUserPort = {
    upsertLeadByEmail(email) {
      const k = email.toLowerCase();
      const existing = leadStore.get(k);
      if (existing) return { user: existing, created: false };
      const user: UserProfile = {
        id: `user_lead_${String(userSeq++).padStart(4, "0")}`,
        email: k,
        agencyId: "lead-tenant",      // T1's LEAD_AGENCY_ID sentinel
      };
      leadStore.set(k, user);
      leadCreations.push(k);
      return { user, created: true };
    },
  };
  const sessions: SessionPort = {
    issueSession(userId) {
      const tok = `sess_${userId}_${Date.now()}`;
      sessionsIssued.push(tok);
      return tok;
    },
  };
  return {
    storage, activity, events: eventBus, leadUsers, sessions,
    inspect: { activityLog, events, sessionsIssued, leadCreations },
  };
}

function container(world: World, withSessions = true) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
    leadUsers: world.leadUsers,
    ...(withSessions ? { sessions: world.sessions } : {}),
  });
}

describe("@aqua/plugin-public-funnel smoke", () => {
  test("1. captureHcCompletion creates lead + capture + issues session + returns redirect-ready result", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.funnel.captureHcCompletion({
      email: "ed@example.com",
      slot: { slot: 3, scores: { brand: 70 }, hcSchemaVersion: "v1" },
    });
    assert.equal(r.created, true);
    assert.equal(r.capture.source, "hc");
    assert.equal(r.capture.email, "ed@example.com");
    assert.equal(r.capture.hcSlot?.slot, 3);
    assert.ok(r.session?.startsWith("sess_"));
    assert.equal(w.inspect.leadCreations.length, 1);
    resetClock();
  });

  test("2. invalid email shapes are rejected with FunnelInputError", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(
      () => c.funnel.captureHcCompletion({ email: "nope", slot: {} }),
      (err: unknown) => err instanceof FunnelInputError,
    );
    await assert.rejects(
      () => c.funnel.captureHcCompletion({ email: "x@y", slot: {} }),
      (err: unknown) => err instanceof FunnelInputError,
    );
    await assert.rejects(
      () => c.funnel.captureHcCompletion({ email: "@example.com", slot: {} }),
      (err: unknown) => err instanceof FunnelInputError,
    );
    resetClock();
  });

  test("3. idempotent on canonical email — second HC submit reuses lead, doesn't recreate", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 2 } });
    const b = await c.funnel.captureHcCompletion({ email: "ED@Example.com", slot: { slot: 5 } });
    assert.equal(a.leadUserId, b.leadUserId);
    assert.equal(b.created, false);
    assert.equal(w.inspect.leadCreations.length, 1);
    // Two captures persisted (we keep the journey, not just the latest).
    const all = await c.funnel.list();
    assert.equal(all.length, 2);
    resetClock();
  });

  test("4. emits public-funnel.lead.captured ONLY on first capture for a given email", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "a@x.com", slot: { slot: 3 } });
    await c.funnel.captureHcCompletion({ email: "a@x.com", slot: { slot: 4 } });
    const captured = w.inspect.events.filter(e => e.name === "public-funnel.lead.captured");
    assert.equal(captured.length, 1);
    resetClock();
  });

  test("5. emits public-funnel.hc.completed every time AND carries the score bucket", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "a@x.com", slot: { slot: 1 } });
    await c.funnel.captureHcCompletion({ email: "b@x.com", slot: { slot: 3 } });
    await c.funnel.captureHcCompletion({ email: "c@x.com", slot: { slot: 5 } });
    const evs = w.inspect.events.filter(e => e.name === "public-funnel.hc.completed");
    assert.equal(evs.length, 3);
    const buckets = evs.map(e => (e.payload as { bucket: string }).bucket);
    assert.deepEqual(buckets, ["early", "growing", "scaling"]);
    resetClock();
  });

  test("6. captureToolCompletion stores tool source + emits public-funnel.tool.completed", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.funnel.captureToolCompletion({
      email: "ed@example.com",
      toolId: "rank-my-website",
      input: { url: "https://example.com" },
      output: { score: 72 },
    });
    assert.equal(r.capture.source, "tool");
    assert.equal((r.capture.sourceMeta as { toolId: string }).toolId, "rank-my-website");
    assert.ok(w.inspect.events.some(e => e.name === "public-funnel.tool.completed"));
    resetClock();
  });

  test("7. tool capture rejects empty toolId", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(
      () => c.funnel.captureToolCompletion({ email: "ed@example.com", toolId: "" }),
      (err: unknown) => err instanceof FunnelInputError,
    );
    resetClock();
  });

  test("8. listByEmail returns captures for canonical email only", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 3 } });
    await c.funnel.captureToolCompletion({ email: "ed@example.com", toolId: "rank-my-website" });
    await c.funnel.captureHcCompletion({ email: "Other@example.com", slot: { slot: 4 } });
    const ed = await c.funnel.listByEmail("ED@Example.COM");
    assert.equal(ed.length, 2);
    const other = await c.funnel.listByEmail("other@example.com");
    assert.equal(other.length, 1);
    resetClock();
  });

  test("9. meContext returns most-recent HC slot + ALL captures newest-first", async () => {
    let t = T0; setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const a = await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 2 } });
    t = T0 + 1000;
    await c.funnel.captureToolCompletion({ email: "ed@example.com", toolId: "rmw" });
    t = T0 + 2000;
    await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 5 } });
    const ctx = await c.funnel.meContext(a.leadUserId);
    assert.ok(ctx);
    assert.equal(ctx?.captures.length, 3);
    assert.equal(ctx?.hcSlot?.slot, 5);            // most-recent HC capture wins
    assert.equal(ctx?.captures[0]?.capturedAt, T0 + 2000);
    resetClock();
  });

  test("10. meContext returns null for an unknown lead user id", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    assert.equal(await c.funnel.meContext("user_nonexistent"), null);
    resetClock();
  });

  test("11. without SessionPort, capture still succeeds — session field undefined", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w, false);
    const r = await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 3 } });
    assert.equal(r.session, undefined);
    assert.equal(r.created, true);
    assert.equal(w.inspect.sessionsIssued.length, 0);
    resetClock();
  });

  test("12. activity entries use category 'public-funnel' with public-funnel.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 3 } });
    await c.funnel.captureToolCompletion({ email: "ed@example.com", toolId: "rmw" });
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["public-funnel"]);
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("public-funnel.lead.captured"));
    assert.ok(actions.includes("public-funnel.hc.completed"));
    resetClock();
  });

  test("13. canonical email keys are case-insensitive AND trimmed", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "  ED@Example.com  ", slot: { slot: 3 } });
    const all = await c.funnel.list();
    assert.equal(all[0]?.email, "ed@example.com");
    resetClock();
  });
});

resetClock();
