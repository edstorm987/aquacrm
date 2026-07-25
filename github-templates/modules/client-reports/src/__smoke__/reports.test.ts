// Client-reports smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  InvalidReportTransitionError,
  ReportNotFoundError,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT: ClientId = "client_felicia";
const ACTOR: UserId = "user_admin";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);
const DAY_MS = 86_400_000;

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

function container(world: World, clientId: ClientId = CLIENT) {
  return containerWithDeps({
    agencyId: AGENCY, clientId, storage: world.storage,
    activity: world.activity, events: world.events,
  });
}

describe("@aqua/plugin-client-reports smoke", () => {
  test("1. create stores draft + emits reports.report.created", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "phase_intro", title: "Epic Intro report" });
    assert.equal(r.status, "draft");
    assert.equal(r.phaseId, "phase_intro");
    assert.ok(w.inspect.events.some(e => e.name === "reports.report.created"));
    resetClock();
  });

  test("2. create rejects empty title + missing phaseId", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(() => c.reports.create(ACTOR, { phaseId: "p1", title: "  " }));
    await assert.rejects(() => c.reports.create(ACTOR, { phaseId: "", title: "x" }));
    resetClock();
  });

  test("3. publish stamps publishedAt + emits reports.report.published", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x" });
    const pub = await c.reports.publish(ACTOR, r.id);
    assert.equal(pub.status, "published");
    assert.equal(pub.publishedAt, T0);
    assert.ok(w.inspect.events.some(e => e.name === "reports.report.published"));
    resetClock();
  });

  test("4. invalid transition draft→sent throws InvalidReportTransitionError", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x" });
    await assert.rejects(
      () => c.reports.markSent(ACTOR, r.id),
      (err: unknown) => err instanceof InvalidReportTransitionError,
    );
    resetClock();
  });

  test("5. published→sent records sentAt + emits reports.report.sent", async () => {
    let t = T0; setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x" });
    await c.reports.publish(ACTOR, r.id);
    t = T0 + DAY_MS;
    const sent = await c.reports.markSent(ACTOR, r.id);
    assert.equal(sent.status, "sent");
    assert.equal(sent.sentAt, t);
    assert.ok(w.inspect.events.some(e => e.name === "reports.report.sent"));
    resetClock();
  });

  test("6. published→draft (unpublish) is allowed by REPORT_TRANSITIONS", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x" });
    await c.reports.publish(ACTOR, r.id);
    const back = await c.reports.transition(ACTOR, r.id, "draft");
    assert.equal(back.status, "draft");
    resetClock();
  });

  test("7. createDraftFromPhase pre-fills the 5 standard sections + connector placeholders", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.createDraftFromPhase(ACTOR, {
      phaseId: "phase_intro",
      phaseLabel: "Epic Intro",
      deliverables: ["Welcome call", "Brand questionnaire"],
      metricsConnectors: ["ga4", "stripe"],
    });
    const kinds = r.sections.map(s => s.kind);
    // Expected: summary, metrics(ga4), metrics(stripe), wins, deliverables, next-steps
    assert.deepEqual(kinds, ["summary", "metrics", "metrics", "wins", "deliverables", "next-steps"]);
    const ga4 = r.sections.find(s => s.kind === "metrics" && s.data?.connector === "ga4");
    assert.ok(ga4, "ga4 metrics section present");
    assert.equal(ga4?.data?.rows.length, 0);
    assert.match(ga4?.data?.placeholder ?? "", /Connect ga4/);
    const deliverables = r.sections.find(s => s.kind === "deliverables");
    assert.match(deliverables?.body ?? "", /Welcome call/);
    assert.ok(w.inspect.events.some(e => e.name === "reports.draft.from_phase"));
    resetClock();
  });

  test("8. createDraftFromPhase with no connector emits a single placeholder metrics block", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.createDraftFromPhase(ACTOR, { phaseId: "p1" });
    const metrics = r.sections.filter(s => s.kind === "metrics");
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0]?.data?.connector, undefined);
    resetClock();
  });

  test("9. createDraftFromPhase is idempotent — second call returns existing draft", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r1 = await c.reports.createDraftFromPhase(ACTOR, { phaseId: "p1", phaseLabel: "P1" });
    const r2 = await c.reports.createDraftFromPhase(ACTOR, { phaseId: "p1", phaseLabel: "P1" });
    assert.equal(r1.id, r2.id);
    const all = await c.reports.list({ phaseId: "p1" });
    assert.equal(all.length, 1);
    resetClock();
  });

  test("10. onPhaseAdvanced subscriber drafts for fromPhaseId (the just-completed phase)", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.onPhaseAdvanced({
      fromPhaseId: "phase_intro",
      toPhaseId: "phase_blueprint",
      fromPhaseLabel: "Epic Intro",
      toPhaseLabel: "Blueprint",
      deliverables: ["X", "Y"],
    });
    assert.equal(r.phaseId, "phase_intro");
    assert.match(r.title, /Epic Intro/);
    resetClock();
  });

  test("11. update full-replaces sections + renormalises ordering", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x", sections: [
      { kind: "summary", title: "S", body: "s" },
      { kind: "wins", title: "W", body: "w" },
    ] });
    const updated = await c.reports.update(ACTOR, r.id, {
      sections: [
        { ...r.sections[1]!, ordering: 99 },
        { ...r.sections[0]!, ordering: 99 },
      ],
    });
    assert.deepEqual(updated.sections.map(s => s.title), ["W", "S"]);
    assert.deepEqual(updated.sections.map(s => s.ordering), [0, 1]);
    resetClock();
  });

  test("12. list({sharedOnly}) hides drafts AND non-shared published reports", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.reports.create(ACTOR, { phaseId: "p1", title: "shared-pub" });
    await c.reports.update(ACTOR, a.id, { sharedWithCustomer: true });
    await c.reports.publish(ACTOR, a.id);
    const b = await c.reports.create(ACTOR, { phaseId: "p2", title: "private-pub" });
    await c.reports.publish(ACTOR, b.id);
    await c.reports.create(ACTOR, { phaseId: "p3", title: "shared-draft" });
    const shared = await c.reports.list({ sharedOnly: true });
    assert.equal(shared.length, 1);
    assert.equal(shared[0]?.title, "shared-pub");
    resetClock();
  });

  test("13. delete removes report + de-indexes both global + per-phase indexes", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x" });
    await c.reports.delete(ACTOR, r.id);
    assert.equal(await c.reports.get(r.id), null);
    assert.equal((await c.reports.list({ phaseId: "p1" })).length, 0);
    await assert.rejects(
      () => c.reports.delete(ACTOR, r.id),
      (err: unknown) => err instanceof ReportNotFoundError,
    );
    resetClock();
  });

  test("14. activity entries use category 'reports' with reports.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.reports.create(ACTOR, { phaseId: "p1", title: "x" });
    await c.reports.publish(ACTOR, r.id);
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["reports"]);
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("reports.report.created"));
    assert.ok(actions.includes("reports.report.published"));
    resetClock();
  });

  test("15. tenant isolation — reports from other client invisible", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c1 = container(w);
    const c2 = container(w, "client_other");
    await c1.reports.create(ACTOR, { phaseId: "p1", title: "felicia-only" });
    assert.equal((await c1.reports.list()).length, 1);
    assert.equal((await c2.reports.list()).length, 0);
    resetClock();
  });
});

resetClock();
