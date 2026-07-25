// Support-desk smoke. node:test via tsx --test.

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
  buildSupportDeskContainer,
  HONEYPOT_FIELD,
  InvalidStatusTransitionError,
  STATUS_TRANSITIONS,
  TICKET_STATUSES,
  TicketNotFoundError,
  looksLikeBot,
  nextRef,
} from "../server/index";
import type { AutoAssignRule } from "../lib/domain";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT_A: ClientId = "client_a";
const CLIENT_B: ClientId = "client_b";
const ALICE: UserId = "user_alice";
const BILLING_USER: UserId = "user_billing";
const TECH_USER: UserId = "user_tech";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort & { fire: (name: string, scope: { agencyId: AgencyId; clientId?: ClientId }, payload: unknown) => Promise<void> };
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const subscribers = new Map<string, ((scope: { agencyId: AgencyId; clientId?: ClientId }, payload: unknown) => void | Promise<void>)[]>();
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
  const eventBus: EventBusPort & { fire: (name: string, scope: { agencyId: AgencyId; clientId?: ClientId }, payload: unknown) => Promise<void> } = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
    on(name, handler) {
      const arr = subscribers.get(name) ?? [];
      arr.push(handler as never);
      subscribers.set(name, arr);
      return () => {
        const cur = subscribers.get(name) ?? [];
        subscribers.set(name, cur.filter(h => h !== handler));
      };
    },
    async fire(name, scope, payload) {
      const arr = subscribers.get(name) ?? [];
      for (const h of arr) await h(scope, payload);
    },
  };
  return { storage, activity, events: eventBus, inspect: { activityLog, events } };
}

function container(world: World, clientId = CLIENT_A, rules?: AutoAssignRule[]) {
  return buildSupportDeskContainer({
    agencyId: AGENCY, clientId, storage: world.storage,
    activity: world.activity, events: world.events,
    autoAssignRules: rules,
  });
}

describe("@aqua/plugin-support-desk smoke", () => {
  test("1. nextRef + looksLikeBot helpers", () => {
    assert.equal(nextRef(1), "T-0001");
    assert.equal(nextRef(42), "T-0042");
    assert.equal(nextRef(10000), "T-10000");
    assert.equal(HONEYPOT_FIELD, "website_url");
    assert.equal(looksLikeBot({ subject: "x" }), false);
    assert.equal(looksLikeBot({ [HONEYPOT_FIELD]: "" }), false);
    assert.equal(looksLikeBot({ [HONEYPOT_FIELD]: "  " }), false);
    assert.equal(looksLikeBot({ [HONEYPOT_FIELD]: "http://spam.test" }), true);
  });

  test("2. create stores ticket with monotonic ref + initial customer message + emits ticket.opened; rejects empty subject/body/email", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.tickets.create({ subject: "Help", body: "Broken", customerEmail: "a@example.com" });
    const b = await c.tickets.create({ subject: "Help2", body: "Also broken", customerEmail: "b@example.com" });
    assert.equal(a.ref, "T-0001");
    assert.equal(b.ref, "T-0002");
    assert.equal(a.status, "new");
    assert.equal(a.priority, "normal");
    assert.equal(a.messages.length, 1);
    assert.equal(a.messages[0]!.fromKind, "customer");
    assert.equal(a.messages[0]!.body, "Broken");
    assert.ok(w.inspect.events.some(e => e.name === "support.ticket.opened"));
    await assert.rejects(() => c.tickets.create({ subject: "", body: "x", customerEmail: "x@x.com" }));
    await assert.rejects(() => c.tickets.create({ subject: "x", body: "", customerEmail: "x@x.com" }));
    await assert.rejects(() => c.tickets.create({ subject: "x", body: "y", customerEmail: "" }));
    resetClock();
  });

  test("3. list filters by status + priority + tag + unassigned + query", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.tickets.create({ subject: "Stripe failure", body: "card declined", customerEmail: "a@x.com", priority: "high", tags: ["billing"] });
    const b = await c.tickets.create({ subject: "How do I export", body: "plain", customerEmail: "b@x.com", tags: ["howto"] });
    await c.tickets.update(ALICE, b.id, { status: "in-progress" });

    const high = await c.tickets.list({ priority: "high" });
    assert.equal(high.length, 1);
    assert.equal(high[0]!.id, a.id);

    const inProgress = await c.tickets.list({ status: "in-progress" });
    assert.equal(inProgress.length, 1);
    assert.equal(inProgress[0]!.id, b.id);

    const billing = await c.tickets.list({ tag: "billing" });
    assert.equal(billing.length, 1);

    const search = await c.tickets.list({ query: "stripe" });
    assert.equal(search.length, 1);
    assert.equal(search[0]!.id, a.id);

    const unassigned = await c.tickets.list({ unassigned: true });
    assert.equal(unassigned.length, 2);
    resetClock();
  });

  test("4. update — invalid status transition rejects; valid transition emits status-changed + resolved/closed/reopened events", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const t = await c.tickets.create({ subject: "x", body: "y", customerEmail: "a@x.com" });

    // new → resolved is allowed; new → waiting-customer also allowed.
    // resolved → new is NOT in STATUS_TRANSITIONS.resolved.
    await assert.rejects(
      async () => {
        await c.tickets.update(ALICE, t.id, { status: "resolved" });
        await c.tickets.update(ALICE, t.id, { status: "new" });
      },
      (err: unknown) => err instanceof InvalidStatusTransitionError,
    );

    // Re-open path: closed → in-progress is allowed.
    const w2 = buildWorld();
    const c2 = container(w2);
    const t2 = await c2.tickets.create({ subject: "x", body: "y", customerEmail: "a@x.com" });
    await c2.tickets.update(ALICE, t2.id, { status: "in-progress" });
    await c2.tickets.update(ALICE, t2.id, { status: "resolved" });
    await c2.tickets.update(ALICE, t2.id, { status: "closed" });
    await c2.tickets.update(ALICE, t2.id, { status: "in-progress" });
    const eventNames = w2.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("support.ticket.resolved"));
    assert.ok(eventNames.includes("support.ticket.closed"));
    assert.ok(eventNames.includes("support.ticket.reopened"));
    resetClock();
  });

  test("5. resolved/closed timestamps stamped on transition", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const tk = await c.tickets.create({ subject: "x", body: "y", customerEmail: "a@x.com" });
    t = T0 + 1000;
    const r1 = await c.tickets.update(ALICE, tk.id, { status: "resolved" });
    assert.equal(r1.resolvedAt, t);
    assert.equal(r1.closedAt, undefined);
    t = T0 + 2000;
    const r2 = await c.tickets.update(ALICE, tk.id, { status: "closed" });
    assert.equal(r2.closedAt, t);
    // resolvedAt sticky from the first transition.
    assert.equal(r2.resolvedAt, T0 + 1000);
    resetClock();
  });

  test("6. reply — agent reply on 'new' auto-flips to 'in-progress'; customer reply on 'waiting-customer' auto-flips back to 'in-progress'", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const tk = await c.tickets.create({ subject: "x", body: "y", customerEmail: "a@x.com" });
    assert.equal(tk.status, "new");
    t = T0 + 1000;
    const after = await c.tickets.reply({ fromKind: "agent", userId: ALICE }, tk.id, "On it.");
    assert.equal(after.status, "in-progress");
    assert.equal(after.messages.length, 2);

    t = T0 + 2000;
    await c.tickets.update(ALICE, tk.id, { status: "waiting-customer" });
    t = T0 + 3000;
    const flipped = await c.tickets.reply({ fromKind: "customer", email: "a@x.com" }, tk.id, "Tried that.");
    assert.equal(flipped.status, "in-progress");
    resetClock();
  });

  test("7. auto-assign by tag — first matching rule wires assignedTo at create-time + emits assigned event with auto:true", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const rules: AutoAssignRule[] = [
      { tag: "billing", userId: BILLING_USER },
      { tag: "tech",    userId: TECH_USER },
    ];
    const c = container(w, CLIENT_A, rules);
    const billing = await c.tickets.create({ subject: "Card", body: "declined", customerEmail: "x@x.com", tags: ["billing"] });
    const tech    = await c.tickets.create({ subject: "Bug",  body: "crash",    customerEmail: "x@x.com", tags: ["tech"] });
    const both    = await c.tickets.create({ subject: "Both", body: "x",        customerEmail: "x@x.com", tags: ["tech", "billing"] });
    const none    = await c.tickets.create({ subject: "None", body: "x",        customerEmail: "x@x.com", tags: ["other"] });
    assert.equal(billing.assignedTo, BILLING_USER);
    assert.equal(tech.assignedTo,    TECH_USER);
    // First-match wins (rules order: billing before tech in constructor;
    // tags array order doesn't matter — rules iteration does).
    assert.equal(both.assignedTo, BILLING_USER);
    assert.equal(none.assignedTo, undefined);
    const autoEvents = w.inspect.events.filter(e => e.name === "support.ticket.assigned" && (e.payload as { auto?: boolean }).auto === true);
    assert.equal(autoEvents.length, 3, "assigned event fires once per auto-assignment");
    resetClock();
  });

  test("8. update assignedTo — emits assigned with auto:false; null clears; no-op assignment doesn't re-emit", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const tk = await c.tickets.create({ subject: "x", body: "y", customerEmail: "a@x.com" });
    const before = w.inspect.events.filter(e => e.name === "support.ticket.assigned").length;

    await c.tickets.update(ALICE, tk.id, { assignedTo: ALICE });
    const after1 = w.inspect.events.filter(e => e.name === "support.ticket.assigned").length;
    assert.equal(after1 - before, 1);

    // No-op — already assigned to ALICE.
    await c.tickets.update(ALICE, tk.id, { assignedTo: ALICE });
    const after2 = w.inspect.events.filter(e => e.name === "support.ticket.assigned").length;
    assert.equal(after2 - after1, 0, "no re-emit on no-op assignment");

    // Unassign.
    const cleared = await c.tickets.update(ALICE, tk.id, { assignedTo: null });
    assert.equal(cleared.assignedTo, undefined);
    const after3 = w.inspect.events.filter(e => e.name === "support.ticket.assigned").length;
    assert.equal(after3 - after2, 1);
    resetClock();
  });

  test("9. STATUS_TRANSITIONS graph — every status has at least one transition; no self-loops", () => {
    for (const s of TICKET_STATUSES) {
      const out = STATUS_TRANSITIONS[s];
      assert.ok(out.length >= 1, `${s} has no outgoing transitions`);
      assert.ok(!out.includes(s), `${s} has a self-loop`);
    }
  });

  test("10. scopePolicy='client' — tickets cannot leak across clients of the same agency", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const cA = container(w, CLIENT_A);
    const cB = container(w, CLIENT_B);
    const a = await cA.tickets.create({ subject: "A", body: "y", customerEmail: "a@x.com" });
    const b = await cB.tickets.create({ subject: "B", body: "y", customerEmail: "b@x.com" });
    assert.equal((await cA.tickets.list()).length, 1);
    assert.equal((await cB.tickets.list()).length, 1);
    assert.equal(await cA.tickets.get(b.id), null, "client A cannot see B's ticket");
    assert.equal(await cB.tickets.get(a.id), null, "client B cannot see A's ticket");
    await assert.rejects(
      () => cA.tickets.update(ALICE, b.id, { status: "in-progress" }),
      (err: unknown) => err instanceof TicketNotFoundError,
    );
    resetClock();
  });

  test("11. ecommerce.order.shipped subscriber posts follow-up agent message on every open ticket from same email; skips resolved/closed", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const open1 = await c.tickets.create({ subject: "Q1", body: "y", customerEmail: "buyer@x.com" });
    await c.tickets.create({ subject: "Q2", body: "y", customerEmail: "buyer@x.com" });
    const resolvedOne = await c.tickets.create({ subject: "Q3", body: "y", customerEmail: "buyer@x.com" });
    await c.tickets.update(ALICE, resolvedOne.id, { status: "resolved" });
    await c.tickets.create({ subject: "Q4", body: "y", customerEmail: "other@x.com" });

    await w.events.fire(
      "ecommerce.order.shipped",
      { agencyId: AGENCY, clientId: CLIENT_A },
      { customerEmail: "BUYER@X.com", ref: "ORD-123" },
    );

    const refreshedOpen1 = await c.tickets.get(open1.id);
    assert.equal(refreshedOpen1?.messages.length, 2, "open ticket got follow-up message");
    const refreshedResolved = await c.tickets.get(resolvedOne.id);
    assert.equal(refreshedResolved?.messages.length, 1, "resolved ticket NOT touched");
    // Other email's ticket also untouched.
    const otherList = await c.tickets.list({ query: "Q4" });
    assert.equal(otherList[0]!.messages.length, 1);
    resetClock();
  });

  test("12. activity — ticket.opened + replied + assigned + status-changed all log under category 'settings' with `support.*` action prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const tk = await c.tickets.create({ subject: "x", body: "y", customerEmail: "a@x.com" });
    await c.tickets.update(ALICE, tk.id, { assignedTo: ALICE });
    await c.tickets.reply({ fromKind: "agent", userId: ALICE }, tk.id, "Hi.");
    await c.tickets.update(ALICE, tk.id, { status: "resolved" });
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("support.ticket.opened"));
    assert.ok(actions.includes("support.ticket.assigned"));
    assert.ok(actions.includes("support.ticket.replied"));
    assert.ok(actions.includes("support.ticket.status-changed"));
    assert.ok(w.inspect.activityLog.every(e => e.category === "settings"));
    assert.ok(w.inspect.activityLog.every(e => e.action.startsWith("support.")));
    resetClock();
  });
});

resetClock();
