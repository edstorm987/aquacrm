// stripe-events smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, VaultPort } from "../server/ports";
import {
  containerWithDeps,
  computeStripeHmacHex,
  parseStripeSignature,
  summarise,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_milesy";
const SECRET = "whsec_test_supersecret";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);
const T0_S = Math.floor(T0 / 1000);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  vault: VaultPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(secret: string | null = SECRET): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  let actSeq = 1;
  const storage: PluginStorage = {
    async get<T = unknown>(k: string): Promise<T | undefined> { return data.get(k) as T | undefined; },
    async set<T = unknown>(k: string, v: T): Promise<void> { data.set(k, v); },
    async del(k: string): Promise<void> { data.delete(k); },
    async list(p?: string): Promise<string[]> {
      const ks = [...data.keys()];
      return p ? ks.filter(k => k.startsWith(p)) : ks;
    },
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
  const vault: VaultPort = { getWebhookSecret() { return secret; } };
  return { storage, activity, events: eventBus, vault, inspect: { activityLog, events } };
}

function container(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
    vault: world.vault,
  });
}

async function signedRequest(rawBody: string, opts: { timestamp?: number; secret?: string; extraV1?: string } = {}): Promise<{ rawBody: string; signatureHeader: string }> {
  const t = opts.timestamp ?? T0_S;
  const secret = opts.secret ?? SECRET;
  const sig = await computeStripeHmacHex(secret, `${t}.${rawBody}`);
  const parts = [`t=${t}`, `v1=${sig}`];
  if (opts.extraV1) parts.push(`v1=${opts.extraV1}`);
  return { rawBody, signatureHeader: parts.join(",") };
}

function subEvent(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.created",
    livemode: false,
    created: T0_S,
    data: {
      object: {
        id: "sub_123",
        customer: "cus_42",
        status: "active",
        current_period_end: T0_S + 30 * 86400,
        items: { data: [{ price: { id: "price_pro" } }] },
        ...over,
      },
    },
  });
}

describe("@aqua/plugin-stripe-events smoke", () => {
  // ── Pure helpers ──────────────────────────────────────────

  test("1. parseStripeSignature parses t + v1 entries; rejects malformed", () => {
    const ok = parseStripeSignature("t=1234,v1=abc123");
    assert.equal(ok?.timestamp, 1234);
    assert.deepEqual(ok?.v1, ["abc123"]);
    const multi = parseStripeSignature("t=1234,v1=aaa,v1=bbb");
    assert.deepEqual(multi?.v1, ["aaa", "bbb"]);
    assert.equal(parseStripeSignature(""), null);
    assert.equal(parseStripeSignature("not-stripe"), null);
    // timestamp present but no v1 → null
    assert.equal(parseStripeSignature("t=1234"), null);
  });

  test("2. summarise extracts subscription id + customer + status from a sub event", () => {
    const evt = JSON.parse(subEvent()) as { type: string; data: { object: Record<string, unknown> } } & { type: string };
    const s = summarise(evt as Parameters<typeof summarise>[0]);
    assert.equal(s.subscriptionId, "sub_123");
    assert.equal(s.customerId, "cus_42");
    assert.equal(s.status, "active");
  });

  // ── Webhook verification ─────────────────────────────────

  test("3. ingest happy path with valid signature stores event + emits stripe.event.received + projects subscription", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const { rawBody, signatureHeader } = await signedRequest(subEvent());
    const r = await c.stripe.ingest({ rawBody, signatureHeader, nowS: T0_S });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.eventId, "evt_1");
      assert.equal(r.deduped, false);
      assert.equal(r.applied?.kind, "subscription.upsert");
      assert.equal(r.applied?.subscriptionId, "sub_123");
    }
    const sub = await c.stripe.getSubscription("sub_123");
    assert.equal(sub?.status, "active");
    assert.equal(sub?.priceId, "price_pro");
    assert.ok(w.inspect.events.some(e => e.name === "stripe.event.received"));
    assert.ok(w.inspect.events.some(e => e.name === "stripe.subscription.upserted"));
    resetClock();
  });

  test("4. invalid signature → reject with signature_mismatch + no row stored", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const tampered = `t=${T0_S},v1=00deadbeef`;
    const r = await c.stripe.ingest({ rawBody: subEvent(), signatureHeader: tampered, nowS: T0_S });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "signature_mismatch");
    const events = await c.stripe.listEvents();
    assert.equal(events.length, 0);
    resetClock();
  });

  test("5. timestamp outside tolerance → reject timestamp_too_old", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const oldT = T0_S - 600;
    const { rawBody, signatureHeader } = await signedRequest(subEvent(), { timestamp: oldT });
    const r = await c.stripe.ingest({ rawBody, signatureHeader, nowS: T0_S });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "timestamp_too_old");
    resetClock();
  });

  test("6. missing signature header → reject missing_signature", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r = await c.stripe.ingest({ rawBody: subEvent(), signatureHeader: "", nowS: T0_S });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing_signature");
    resetClock();
  });

  test("7. missing webhook secret in vault → reject missing_secret", async () => {
    setClock(() => T0);
    const w = buildWorld(null);
    const c = container(w);
    const { rawBody, signatureHeader } = await signedRequest(subEvent());
    const r = await c.stripe.ingest({ rawBody, signatureHeader, nowS: T0_S });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing_secret");
    resetClock();
  });

  test("8. multiple v1 sigs (key rotation) — accepts when ANY matches", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const { rawBody, signatureHeader } = await signedRequest(subEvent(), { extraV1: "deadbeef" });
    const r = await c.stripe.ingest({ rawBody, signatureHeader, nowS: T0_S });
    assert.equal(r.ok, true);
    resetClock();
  });

  // ── Idempotency ──────────────────────────────────────────

  test("9. second arrival of same event.id returns deduped:true + does NOT re-emit", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const req = await signedRequest(subEvent());
    const a = await c.stripe.ingest({ ...req, nowS: T0_S });
    const b = await c.stripe.ingest({ ...req, nowS: T0_S });
    assert.equal(a.ok && b.ok, true);
    if (b.ok) assert.equal(b.deduped, true);
    const received = w.inspect.events.filter(e => e.name === "stripe.event.received").length;
    assert.equal(received, 1);
    const deduped = w.inspect.events.filter(e => e.name === "stripe.event.deduped").length;
    assert.equal(deduped, 1);
    resetClock();
  });

  // ── Subscription mirror ──────────────────────────────────

  test("10. customer.subscription.updated patches the existing row + bumps lastEventId", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const r1 = await signedRequest(subEvent());
    await c.stripe.ingest({ ...r1, nowS: T0_S });
    const updated = JSON.stringify({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_123", customer: "cus_42", status: "past_due", items: { data: [{ price: { id: "price_pro_v2" } }] } } },
    });
    const r2 = await signedRequest(updated);
    await c.stripe.ingest({ ...r2, nowS: T0_S });
    const sub = await c.stripe.getSubscription("sub_123");
    assert.equal(sub?.status, "past_due");
    assert.equal(sub?.priceId, "price_pro_v2");
    assert.equal(sub?.lastEventId, "evt_2");
    resetClock();
  });

  test("11. customer.subscription.deleted flips status to canceled (preserving prior fields) + emits subscription.deleted", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.stripe.ingest({ ...(await signedRequest(subEvent())), nowS: T0_S });
    const del = JSON.stringify({
      id: "evt_del", type: "customer.subscription.deleted",
      data: { object: { id: "sub_123", customer: "cus_42" } },
    });
    await c.stripe.ingest({ ...(await signedRequest(del)), nowS: T0_S });
    const sub = await c.stripe.getSubscription("sub_123");
    assert.equal(sub?.status, "canceled");
    // priceId preserved from the prior upsert.
    assert.equal(sub?.priceId, "price_pro");
    assert.ok(w.inspect.events.some(e => e.name === "stripe.subscription.deleted"));
    resetClock();
  });

  test("12. non-subscription event (e.g. payment_intent.succeeded) is logged but NOT projected", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const pi = JSON.stringify({
      id: "evt_pi", type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", customer: "cus_42", amount: 5000, currency: "usd" } },
    });
    const r = await c.stripe.ingest({ ...(await signedRequest(pi)), nowS: T0_S });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.applied?.kind, "noop");
    const subs = await c.stripe.listSubscriptions();
    assert.equal(subs.length, 0);
    const events = await c.stripe.listEvents();
    assert.equal(events.length, 1);
    resetClock();
  });

  test("13. activity log entries use category 'stripe' with stripe.event.<type> action", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.stripe.ingest({ ...(await signedRequest(subEvent())), nowS: T0_S });
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["stripe"]);
    const acts = w.inspect.activityLog.map(e => e.action);
    assert.ok(acts.includes("stripe.event.customer.subscription.created"));
    resetClock();
  });

  test("14. listEvents returns most-recent first + honours limit + type filter", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.stripe.ingest({ ...(await signedRequest(subEvent({ id: "sub_a" }))), nowS: T0_S });
    const evt2 = JSON.stringify({
      id: "evt_2", type: "customer.subscription.updated",
      data: { object: { id: "sub_a", customer: "c", status: "active" } },
    });
    await c.stripe.ingest({ ...(await signedRequest(evt2)), nowS: T0_S });
    const all = await c.stripe.listEvents({ limit: 10 });
    assert.equal(all.length, 2);
    assert.equal(all[0]?.id, "evt_2"); // most-recent at head
    const typed = await c.stripe.listEvents({ type: "customer.subscription.created" });
    assert.equal(typed.length, 1);
    resetClock();
  });

  test("15. tampered body but valid HMAC of original → reject (HMAC of new body doesn't match)", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const original = subEvent();
    const tampered = original.replace("\"sub_123\"", "\"sub_attacker\"");
    const { signatureHeader } = await signedRequest(original);  // sig is over original
    const r = await c.stripe.ingest({ rawBody: tampered, signatureHeader, nowS: T0_S });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "signature_mismatch");
    resetClock();
  });

  test("16. tenant isolation — events from another agencyId on shared storage are invisible", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c1 = container(w);
    const c2 = containerWithDeps({
      agencyId: "agency_other", storage: w.storage,
      activity: w.activity, events: w.events,
      vault: w.vault,
    });
    await c1.stripe.ingest({ ...(await signedRequest(subEvent())), nowS: T0_S });
    assert.equal((await c1.stripe.listEvents()).length, 1);
    assert.equal((await c2.stripe.listEvents()).length, 0);
    assert.equal((await c1.stripe.listSubscriptions()).length, 1);
    assert.equal((await c2.stripe.listSubscriptions()).length, 0);
    resetClock();
  });
});

resetClock();
