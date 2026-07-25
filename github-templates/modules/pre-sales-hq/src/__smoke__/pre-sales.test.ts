// Pre-sales-hq smoke. node:test via tsx --test.

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
  InvalidProposalTransitionError,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
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

function container(world: World, cadenceDays = 14) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
    cadenceDays,
  });
}

describe("@aqua/plugin-pre-sales-hq smoke", () => {
  test("1. DiscoveryCall.schedule stores call as 'scheduled' + emits pre-sales.call.scheduled", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const call = await c.calls.schedule(ACTOR, { leadId: "lead_1", scheduledAt: T0 + DAY_MS });
    assert.equal(call.outcome, "scheduled");
    assert.ok(world.inspect.events.some(e => e.name === "pre-sales.call.scheduled"));
    resetClock();
  });

  test("2. DiscoveryCall.update — flipping outcome to 'completed' emits pre-sales.call.completed once", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const call = await c.calls.schedule(ACTOR, { leadId: "lead_1", scheduledAt: T0 + DAY_MS });
    await c.calls.update(ACTOR, call.id, { outcome: "completed", completedAt: T0 + DAY_MS + 60_000 });
    const completedEvents = world.inspect.events.filter(e => e.name === "pre-sales.call.completed").length;
    assert.equal(completedEvents, 1);
    // Re-update — same outcome → no re-emit.
    await c.calls.update(ACTOR, call.id, { outcome: "completed" });
    assert.equal(world.inspect.events.filter(e => e.name === "pre-sales.call.completed").length, 1);
    resetClock();
  });

  test("3. DiscoveryCall.schedule rejects empty leadId and zero scheduledAt", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.calls.schedule(ACTOR, { leadId: "", scheduledAt: T0 }));
    await assert.rejects(() => c.calls.schedule(ACTOR, { leadId: "lead_1", scheduledAt: 0 }));
    resetClock();
  });

  test("4. Proposal.create stores 'draft'; transition draft→sent emits pre-sales.proposal-sent + sets sentAt", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const p = await c.proposals.create(ACTOR, { leadId: "lead_1", amountCents: 50_000 });
    assert.equal(p.status, "draft");
    const sent = await c.proposals.transition(ACTOR, p.id, "sent");
    assert.equal(sent.status, "sent");
    assert.equal(sent.sentAt, T0);
    assert.ok(world.inspect.events.some(e => e.name === "pre-sales.proposal-sent"));
    resetClock();
  });

  test("5. Proposal — invalid transition (draft → accepted) throws InvalidProposalTransitionError", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const p = await c.proposals.create(ACTOR, { leadId: "lead_1", amountCents: 50_000 });
    await assert.rejects(
      () => c.proposals.transition(ACTOR, p.id, "accepted"),
      (err: unknown) => err instanceof InvalidProposalTransitionError,
    );
    resetClock();
  });

  test("6. Proposal — sent→accepted records decidedAt + emits pre-sales.proposal-decided", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const p = await c.proposals.create(ACTOR, { leadId: "lead_1", amountCents: 50_000 });
    await c.proposals.transition(ACTOR, p.id, "sent");
    t = T0 + 5 * DAY_MS;
    const accepted = await c.proposals.transition(ACTOR, p.id, "accepted");
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.decidedAt, t);
    assert.ok(world.inspect.events.some(e => e.name === "pre-sales.proposal-decided"));
    resetClock();
  });

  test("7. Proposal — rejected→sent re-pitch path is allowed by PROPOSAL_TRANSITIONS", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const p = await c.proposals.create(ACTOR, { leadId: "lead_1", amountCents: 50_000 });
    await c.proposals.transition(ACTOR, p.id, "sent");
    await c.proposals.transition(ACTOR, p.id, "rejected");
    const repitch = await c.proposals.transition(ACTOR, p.id, "sent");
    assert.equal(repitch.status, "sent");
    resetClock();
  });

  test("8. NurtureService.record stores touch + emits pre-sales.nurture.touched", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const tp = await c.nurture.record(ACTOR, { leadId: "lead_1", type: "email", response: "no-response" });
    assert.equal(tp.type, "email");
    assert.ok(world.inspect.events.some(e => e.name === "pre-sales.nurture.touched"));
    resetClock();
  });

  test("9. NurtureService.overdue returns leads past cadence; recent reply excludes; never-touched returns sentinel", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world, 14);
    // lead_old: touched 20 days ago, no reply → overdue.
    t = T0 - 20 * DAY_MS;
    await c.nurture.record(ACTOR, { leadId: "lead_old", type: "email", response: "no-response" });
    // lead_recent: touched 5 days ago, no reply → not overdue.
    t = T0 - 5 * DAY_MS;
    await c.nurture.record(ACTOR, { leadId: "lead_recent", type: "email", response: "no-response" });
    // lead_replied: touched 30 days ago but REPLIED → excluded entirely.
    t = T0 - 30 * DAY_MS;
    await c.nurture.record(ACTOR, { leadId: "lead_replied", type: "email", response: "replied" });
    t = T0;

    const overdue = await c.nurture.overdue(["lead_old", "lead_recent", "lead_replied", "lead_unknown"], T0);
    const ids = overdue.map(o => o.leadId);
    assert.ok(ids.includes("lead_old"));
    assert.ok(ids.includes("lead_unknown"));
    assert.ok(!ids.includes("lead_recent"));
    assert.ok(!ids.includes("lead_replied"));
    const unknown = overdue.find(o => o.leadId === "lead_unknown");
    assert.equal(unknown?.daysSinceLastTouch, Number.MAX_SAFE_INTEGER);
    // Sort: never-touched first, then by descending days.
    assert.equal(overdue[0]?.leadId, "lead_unknown");
    resetClock();
  });

  test("10. NurtureService.onCrmLeadStatusChanged subscriber records 'other' touch with metadata source", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const tp = await c.nurture.onCrmLeadStatusChanged({ leadId: "lead_x", fromStatus: "new", toStatus: "qualified" });
    assert.equal(tp.type, "other");
    assert.match(tp.notes ?? "", /Lead status: new → qualified/);
    resetClock();
  });

  test("11. Custom cadenceDays — overdue threshold respects the override", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world, 7); // tighter 7-day cadence
    t = T0 - 8 * DAY_MS;
    await c.nurture.record(ACTOR, { leadId: "lead_a", type: "email", response: "no-response" });
    t = T0;
    const overdue = await c.nurture.overdue(["lead_a"], T0);
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0]?.daysSinceLastTouch, 8);
    resetClock();
  });

  test("12. Activity events — call.scheduled/proposal.transition(sent)/nurture.touched all log under 'settings' with `pre-sales.*` prefix", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.calls.schedule(ACTOR, { leadId: "lead_1", scheduledAt: T0 + DAY_MS });
    const p = await c.proposals.create(ACTOR, { leadId: "lead_1", amountCents: 50_000 });
    await c.proposals.transition(ACTOR, p.id, "sent");
    await c.nurture.record(ACTOR, { leadId: "lead_1", type: "email" });
    const actions = world.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("pre-sales.call.scheduled"));
    assert.ok(actions.includes("pre-sales.proposal-sent"));
    assert.ok(actions.includes("pre-sales.nurture.touched"));
    assert.ok(world.inspect.activityLog.every(e => e.category === "settings"));
    resetClock();
  });
});

resetClock();
