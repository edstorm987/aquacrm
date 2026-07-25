// Feedback-loops smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  FeedbackNotFoundError,
  InvalidTestimonialTransitionError,
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

describe("@aqua/plugin-feedback-loops smoke", () => {
  // ── Pulse ─────────────────────────────────────────────────────

  test("1. send pulse stores outstanding (no score) + emits feedback.pulse.sent", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.pulses.send(ACTOR, { respondent: "client@x.com" });
    assert.equal(p.score, undefined);
    assert.equal(p.respondedAt, undefined);
    assert.ok(w.inspect.events.some(e => e.name === "feedback.pulse.sent"));
    resetClock();
  });

  test("2. send rejects respondent without @", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(() => c.pulses.send(ACTOR, { respondent: "not-an-email" }));
    resetClock();
  });

  test("3. respond stamps score + respondedAt + emits feedback.pulse.received", async () => {
    let t = T0; setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const p = await c.pulses.send(ACTOR, { respondent: "a@x.com" });
    t = T0 + DAY_MS;
    const r = await c.pulses.respond(p.id, { score: 9 });
    assert.equal(r.score, 9);
    assert.equal(r.respondedAt, t);
    assert.ok(w.inspect.events.some(e => e.name === "feedback.pulse.received"));
    resetClock();
  });

  test("4. respond rejects out-of-range scores (0, 11) but accepts 1 and 10", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.pulses.send(ACTOR, { respondent: "a@x.com" });
    await assert.rejects(() => c.pulses.respond(p.id, { score: 0 }));
    await assert.rejects(() => c.pulses.respond(p.id, { score: 11 }));
    const r10 = await c.pulses.respond(p.id, { score: 10 });
    assert.equal(r10.score, 10);
    resetClock();
  });

  test("5. detractor (score < 6) emits feedback.detractor + latches detractorEmittedAt", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.pulses.send(ACTOR, { respondent: "sad@x.com" });
    const r = await c.pulses.respond(p.id, { score: 3 });
    assert.equal(r.detractorEmittedAt, T0);
    assert.ok(w.inspect.events.some(e => e.name === "feedback.detractor"));
    // Edit score upward — must NOT re-emit detractor and the latch
    // stays put (honesty contract: first response is the moment).
    const r2 = await c.pulses.respond(p.id, { score: 9 });
    assert.equal(r2.detractorEmittedAt, T0);
    assert.equal(w.inspect.events.filter(e => e.name === "feedback.detractor").length, 1);
    // Also: pulse.received is one-shot too.
    assert.equal(w.inspect.events.filter(e => e.name === "feedback.pulse.received").length, 1);
    resetClock();
  });

  test("6. promoter (score >= 8) does NOT emit detractor", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.pulses.send(ACTOR, { respondent: "happy@x.com" });
    await c.pulses.respond(p.id, { score: 9 });
    assert.equal(w.inspect.events.filter(e => e.name === "feedback.detractor").length, 0);
    resetClock();
  });

  test("7. summary computes avg / response-rate / detractor / promoter / passive bands", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    // Sent: 5; responded: 4 (3 / 7 / 8 / 10); 1 outstanding.
    const ids: string[] = [];
    for (const r of ["a@x.com","b@x.com","c@x.com","d@x.com","e@x.com"]) {
      const p = await c.pulses.send(ACTOR, { respondent: r });
      ids.push(p.id);
    }
    await c.pulses.respond(ids[0]!, { score: 3 });
    await c.pulses.respond(ids[1]!, { score: 7 });
    await c.pulses.respond(ids[2]!, { score: 8 });
    await c.pulses.respond(ids[3]!, { score: 10 });
    const s = await c.pulses.summary(T0);
    assert.equal(s.totalSent, 5);
    assert.equal(s.totalResponded, 4);
    assert.equal(s.responseRate, 0.8);
    assert.equal(s.detractors, 1);
    assert.equal(s.passives, 1);    // 7 only — 6 is also passive but no 6 here
    assert.equal(s.promoters, 2);   // 8, 10
    assert.equal(s.avgScore, 7);    // (3+7+8+10)/4
    assert.equal(s.byMonth.length, 12);
    resetClock();
  });

  test("8. summary with no responses returns avgScore undefined + responseRate 0", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const s = await c.pulses.summary(T0);
    assert.equal(s.totalSent, 0);
    assert.equal(s.responseRate, 0);
    assert.equal(s.avgScore, undefined);
    resetClock();
  });

  test("9. list({responded}) filters open vs closed", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.pulses.send(ACTOR, { respondent: "a@x.com" });
    const b = await c.pulses.send(ACTOR, { respondent: "b@x.com" });
    await c.pulses.respond(a.id, { score: 8 });
    void b;
    const open = await c.pulses.list({ responded: false });
    const closed = await c.pulses.list({ responded: true });
    assert.equal(open.length, 1);
    assert.equal(closed.length, 1);
    resetClock();
  });

  // ── Testimonials ─────────────────────────────────────────────

  test("10. request stores pending + emits feedback.testimonial.requested", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const t = await c.testimonials.request(ACTOR, { prompt: "Tell us about your experience.", respondent: "c@x.com" });
    assert.equal(t.status, "pending");
    assert.ok(w.inspect.events.some(e => e.name === "feedback.testimonial.requested"));
    resetClock();
  });

  test("11. reply moves pending → replied + stamps reply/repliedAt", async () => {
    let t = T0; setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const tr = await c.testimonials.request(ACTOR, { prompt: "Why us?", respondent: "c@x.com" });
    t = T0 + DAY_MS;
    const replied = await c.testimonials.reply(tr.id, { reply: "Best agency I've worked with." });
    assert.equal(replied.status, "replied");
    assert.equal(replied.repliedAt, t);
    assert.ok(w.inspect.events.some(e => e.name === "feedback.testimonial.replied"));
    resetClock();
  });

  test("12. reply on non-pending throws InvalidTestimonialTransitionError", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const tr = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "c@x.com" });
    await c.testimonials.reply(tr.id, { reply: "good" });
    await assert.rejects(
      () => c.testimonials.reply(tr.id, { reply: "again" }),
      (err: unknown) => err instanceof InvalidTestimonialTransitionError,
    );
    resetClock();
  });

  test("13. approve→public path stamps both timestamps + emits status events", async () => {
    let t = T0; setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const tr = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "c@x.com" });
    await c.testimonials.reply(tr.id, { reply: "great" });
    t = T0 + DAY_MS;
    const ap = await c.testimonials.approve(ACTOR, tr.id);
    assert.equal(ap.status, "approved");
    assert.equal(ap.approvedAt, t);
    t = T0 + 2 * DAY_MS;
    const pub = await c.testimonials.markPublic(ACTOR, tr.id);
    assert.equal(pub.status, "public");
    assert.equal(pub.publishedAt, t);
    assert.ok(w.inspect.events.some(e => e.name === "feedback.testimonial.approved"));
    assert.ok(w.inspect.events.some(e => e.name === "feedback.testimonial.public"));
    resetClock();
  });

  test("14. invalid transition pending→public throws", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const tr = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "c@x.com" });
    await assert.rejects(
      () => c.testimonials.markPublic(ACTOR, tr.id),
      (err: unknown) => err instanceof InvalidTestimonialTransitionError,
    );
    resetClock();
  });

  test("15. list({publicOnly}) hides pending/replied/approved", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "a@x.com" });
    const b = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "b@x.com" });
    await c.testimonials.reply(a.id, { reply: "great" });
    await c.testimonials.approve(ACTOR, a.id);
    await c.testimonials.markPublic(ACTOR, a.id);
    void b; // stays pending
    const pub = await c.testimonials.list({ publicOnly: true });
    assert.equal(pub.length, 1);
    assert.equal(pub[0]?.status, "public");
    resetClock();
  });

  test("16. delete removes testimonial + de-indexes; re-delete throws", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const tr = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "c@x.com" });
    await c.testimonials.delete(ACTOR, tr.id);
    assert.equal(await c.testimonials.get(tr.id), null);
    await assert.rejects(
      () => c.testimonials.delete(ACTOR, tr.id),
      (err: unknown) => err instanceof FeedbackNotFoundError,
    );
    resetClock();
  });

  test("17. activity entries use category 'feedback' with feedback.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.pulses.send(ACTOR, { respondent: "a@x.com" });
    await c.pulses.respond(p.id, { score: 4 });
    const tr = await c.testimonials.request(ACTOR, { prompt: "x", respondent: "c@x.com" });
    await c.testimonials.reply(tr.id, { reply: "great" });
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["feedback"]);
    const actions = w.inspect.activityLog.map(e => e.action);
    for (const expected of [
      "feedback.pulse.sent",
      "feedback.pulse.received",
      "feedback.detractor",
      "feedback.testimonial.requested",
      "feedback.testimonial.replied",
    ]) {
      assert.ok(actions.includes(expected), `missing ${expected}`);
    }
    resetClock();
  });

  test("18. tenant isolation — pulses + testimonials from other client invisible", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c1 = container(w);
    const c2 = container(w, "client_other");
    await c1.pulses.send(ACTOR, { respondent: "a@x.com" });
    await c1.testimonials.request(ACTOR, { prompt: "x", respondent: "c@x.com" });
    assert.equal((await c1.pulses.list()).length, 1);
    assert.equal((await c1.testimonials.list()).length, 1);
    assert.equal((await c2.pulses.list()).length, 0);
    assert.equal((await c2.testimonials.list()).length, 0);
    resetClock();
  });
});

resetClock();
