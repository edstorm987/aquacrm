// GA4 connector smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId, UserId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, Ga4Port, RunReportResult, VaultPort,
} from "../server/ports";
import { Ga4ApiError } from "../server/ports";
import {
  containerWithDeps,
  parseServiceAccountJson,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_milesy";
const ACTOR: UserId = "user_admin";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

const SA_JSON = JSON.stringify({
  type: "service_account",
  client_email: "ga4@aqua.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n",
  project_id: "aqua-prod",
});

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  vault: VaultPort & { _stored: { json: string | null } };
  ga4: Ga4Port & { _calls: number };
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(opts: {
  responder?: (args: { propertyId: string; days: number }) => RunReportResult | Promise<RunReportResult>;
  initialJson?: string | null;
} = {}): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  let actSeq = 1;
  const storage: PluginStorage = {
    async get<T = unknown>(k: string): Promise<T | undefined> { return data.get(k) as T | undefined; },
    async set<T = unknown>(k: string, v: T): Promise<void> { data.set(k, v); },
    async del(k: string): Promise<void> { data.delete(k); },
    async list(p?: string): Promise<string[]> { const ks = [...data.keys()]; return p ? ks.filter(k => k.startsWith(p)) : ks; },
  };
  const activity: ActivityLogPort = {
    logActivity(input) {
      const e: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`, ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(e);
      return e;
    },
  };
  const eventBus: EventBusPort = { emit(_s, name, payload) { events.push({ name, payload }); } };

  const vault = {
    _stored: { json: opts.initialJson ?? null },
    getServiceAccountJson() { return this._stored.json; },
    setServiceAccountJson(_scope: { agencyId: AgencyId }, jsonString: string) { this._stored.json = jsonString; },
  } as VaultPort & { _stored: { json: string | null } };

  const ga4 = {
    _calls: 0,
    async runReport(args: { propertyId: string; days: number }) {
      this._calls++;
      if (opts.responder) return await Promise.resolve(opts.responder({ propertyId: args.propertyId, days: args.days }));
      return {
        rows: [{ date: "20260507", sessions: 100, conversions: 5 }],
        total: { sessions: 100, conversions: 5 },
      };
    },
  } as Ga4Port & { _calls: number };

  return { storage, activity, events: eventBus, vault, ga4, inspect: { activityLog, events } };
}

function container(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
    ga4: world.ga4, vault: world.vault,
  });
}

describe("@aqua/plugin-ga4 smoke", () => {
  // ── Pure helpers ──────────────────────────────────────────

  test("1. parseServiceAccountJson accepts a well-formed JSON; rejects malformed and missing fields", () => {
    assert.ok(parseServiceAccountJson(SA_JSON));
    assert.equal(parseServiceAccountJson("{}"), null);
    assert.equal(parseServiceAccountJson("not json"), null);
    assert.equal(parseServiceAccountJson(JSON.stringify({ client_email: "x" })), null);
  });

  // ── Config ────────────────────────────────────────────────

  test("2. updateConfig strips `properties/` prefix, persists defaults, emits config.updated", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const cfg = await c.ga4.updateConfig({ propertyId: "properties/123456789", defaultDays: 14 }, ACTOR);
    assert.equal(cfg.propertyId, "123456789");
    assert.equal(cfg.defaultDays, 14);
    assert.ok(w.inspect.events.some(e => e.name === "ga4.config.updated"));
    resetClock();
  });

  test("3. setServiceAccountJson writes to vault + flips serviceAccountPresent; rejects malformed JSON", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const bad = await c.ga4.setServiceAccountJson("nope", ACTOR);
    assert.equal(bad.ok, false);
    const ok = await c.ga4.setServiceAccountJson(SA_JSON, ACTOR);
    assert.equal(ok.ok, true);
    const cfg = await c.ga4.getConfig();
    assert.equal(cfg.serviceAccountPresent, true);
    assert.equal(w.vault._stored.json, SA_JSON);
    resetClock();
  });

  // ── Touchpoints — provisional path ────────────────────────

  test("4. getTouchpoints w/o propertyId returns provisional report (no GA4 call)", async () => {
    setClock(() => T0);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    const r = await c.ga4.getTouchpoints(undefined);
    assert.equal(r.provisional, true);
    assert.match(r.error ?? "", /not configured/);
    assert.equal(r.rows.length, 0);
    assert.equal(w.ga4._calls, 0);
    resetClock();
  });

  test("5. getTouchpoints w/o service account returns provisional report (no GA4 call)", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    const r = await c.ga4.getTouchpoints(7);
    assert.equal(r.provisional, true);
    assert.match(r.error ?? "", /service account/i);
    assert.equal(w.ga4._calls, 0);
    resetClock();
  });

  // ── Touchpoints — happy path + cache ──────────────────────

  test("6. getTouchpoints happy path dials GA4 once, persists cache, emits report.fetched", async () => {
    setClock(() => T0);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    const r = await c.ga4.getTouchpoints(7);
    assert.equal(r.fromCache, false);
    assert.equal(r.total.sessions, 100);
    assert.equal(r.rows.length, 1);
    assert.equal(w.ga4._calls, 1);
    assert.ok(w.inspect.events.some(e => e.name === "ga4.report.fetched"));
    resetClock();
  });

  test("7. second call within TTL serves cache (no re-dial) and flips fromCache:true", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    const a = await c.ga4.getTouchpoints(7);
    t = T0 + 5 * 60_000; // 5min later, well within 15min TTL
    const b = await c.ga4.getTouchpoints(7);
    assert.equal(a.fromCache, false);
    assert.equal(b.fromCache, true);
    assert.equal(w.ga4._calls, 1);
    assert.ok(w.inspect.events.some(e => e.name === "ga4.report.cached_hit"));
    resetClock();
  });

  test("8. after TTL expires we re-dial GA4 + fromCache:false", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    await c.ga4.getTouchpoints(7);
    t = T0 + 16 * 60_000; // past 15min TTL
    const r = await c.ga4.getTouchpoints(7);
    assert.equal(r.fromCache, false);
    assert.equal(w.ga4._calls, 2);
    resetClock();
  });

  test("9. concurrent dial guard — even with TTL=0 we never re-dial within MIN_FETCH_GAP_MS (30s)", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345", cacheTtlMs: 0 }, ACTOR);
    await c.ga4.getTouchpoints(7);
    t = T0 + 5_000; // 5s later — still inside 30s gap
    const r = await c.ga4.getTouchpoints(7);
    assert.equal(r.fromCache, true);
    assert.equal(w.ga4._calls, 1);
    resetClock();
  });

  // ── Touchpoints — fetch error fallback ────────────────────

  test("10. fetch error returns prior cache when present (with `error` field) — no fabrication", async () => {
    let t = T0;
    setClock(() => t);
    let mode: "ok" | "err" = "ok";
    const w = buildWorld({
      initialJson: SA_JSON,
      responder: () => {
        if (mode === "err") throw new Ga4ApiError("rate_limit", "quota exceeded");
        return {
          rows: [{ date: "20260507", sessions: 50, conversions: 2 }],
          total: { sessions: 50, conversions: 2 },
        };
      },
    });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    await c.ga4.getTouchpoints(7);
    t = T0 + 16 * 60_000; mode = "err";
    const r = await c.ga4.getTouchpoints(7);
    assert.equal(r.fromCache, true);
    assert.equal(r.total.sessions, 50);
    assert.match(r.error ?? "", /quota/);
    assert.ok(w.inspect.events.some(e => e.name === "ga4.report.fetch_error"));
    resetClock();
  });

  test("11. fetch error w/o prior cache returns provisional report (chapter #68 — no fabrication)", async () => {
    setClock(() => T0);
    const w = buildWorld({
      initialJson: SA_JSON,
      responder: () => { throw new Ga4ApiError("auth", "PERMISSION_DENIED"); },
    });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    const r = await c.ga4.getTouchpoints(7);
    assert.equal(r.provisional, true);
    assert.match(r.error ?? "", /PERMISSION_DENIED/);
    assert.equal(r.rows.length, 0);
    resetClock();
  });

  // ── Test connection ───────────────────────────────────────

  test("12. testConnection ok path stamps lastTestedAt + emits connection.tested", async () => {
    setClock(() => T0);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    const r = await c.ga4.testConnection(ACTOR);
    assert.equal(r.ok, true);
    const cfg = await c.ga4.getConfig();
    assert.equal(cfg.lastTestedAt, T0);
    assert.ok(w.inspect.events.some(e => e.name === "ga4.connection.tested"));
    resetClock();
  });

  test("13. testConnection w/o property returns ok:false (no GA4 dial)", async () => {
    setClock(() => T0);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    const r = await c.ga4.testConnection(ACTOR);
    assert.equal(r.ok, false);
    assert.equal(w.ga4._calls, 0);
    resetClock();
  });

  // ── Activity grammar + isolation ──────────────────────────

  test("14. activity entries use category 'ga4' with ga4.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld({ initialJson: SA_JSON });
    const c = container(w);
    await c.ga4.updateConfig({ propertyId: "12345" }, ACTOR);
    await c.ga4.getTouchpoints(7);
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["ga4"]);
    const acts = w.inspect.activityLog.map(e => e.action);
    assert.ok(acts.includes("ga4.config.updated"));
    assert.ok(acts.includes("ga4.report.fetched"));
    resetClock();
  });

  test("15. getConfig with no row returns an empty default scoped to the container's agencyId", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c2 = containerWithDeps({
      agencyId: "agency_other", storage: w.storage,
      activity: w.activity, events: w.events,
      ga4: w.ga4, vault: w.vault,
    });
    // Plugin storage is per-INSTALL in production; on shared in-memory
    // storage we just verify the empty-default returns the requested
    // agencyId field — a regression guard for the default constructor.
    const cfg2 = await c2.ga4.getConfig();
    assert.equal(cfg2.agencyId, "agency_other");
    assert.equal(cfg2.propertyId, undefined);
    assert.equal(cfg2.serviceAccountPresent, false);
    resetClock();
  });
});

resetClock();
