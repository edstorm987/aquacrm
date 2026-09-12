// Public-funnel smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, LeadUserPort, PendingCapturePromotionPort,
} from "../server/ports";
import {
  clearFunnelFoundation,
  containerWithDeps,
  FunnelInputError,
  registerFunnelFoundation,
} from "../server/index";
import { ROUTES } from "../api/routes";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_milesy_master";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  leadUsers: LeadUserPort;
  promotions: PendingCapturePromotionPort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    pendingLeadCreations: string[];
    promotionCalls: Array<{ captureId: string; email: string; agencyId: string }>;
  };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const pendingLeadCreations: string[] = [];
  const promotionCalls: Array<{ captureId: string; email: string; agencyId: string }> = [];
  let pendingSeq = 1;
  let identityTail = Promise.resolve();
  const locks = new Map<string, Promise<void>>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async setIfAbsent<T = unknown>(key: string, value: T): Promise<boolean> {
      if (data.has(key)) return false;
      data.set(key, value);
      return true;
    },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
    async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const previous = locks.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      locks.set(key, previous.then(() => gate));
      await previous;
      try { return await operation(); }
      finally { release(); }
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
    async withPendingLeadByEmail(email, operation) {
      const previous = identityTail;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      identityTail = previous.then(() => gate);
      await previous;
      const k = email.toLowerCase();
      try {
        let pending: { id: string } | null = null;
        const createPendingLead = () => {
          if (pending) return pending;
          pending = { id: `pending_lead_${String(pendingSeq++).padStart(4, "0")}` };
          return pending;
        };
        const value = await operation(createPendingLead);
        assert.ok(pending, "capture operation must allocate the pending lead before returning");
        pendingLeadCreations.push(k);
        return { value, created: true as const };
      } finally {
        release();
      }
    },
    async eraseCaptureArtifacts({ agencyId, captureIds }) {
      const wanted = new Set(captureIds);
      let recordsErased = 0;
      for (let index = activityLog.length - 1; index >= 0; index -= 1) {
        const entry = activityLog[index]!;
        const captureId = (entry.metadata as { captureId?: string } | undefined)?.captureId;
        if (entry.agencyId !== agencyId || !captureId || !wanted.has(captureId)) continue;
        activityLog.splice(index, 1);
        recordsErased += 1;
      }
      return { recordsErased };
    },
    async eraseIfUnreferenced({ userId }) {
      return { status: "missing", recordsErased: 0 };
    },
  };
  const promotions: PendingCapturePromotionPort = {
    async promote(input) {
      promotionCalls.push({ captureId: input.captureId, email: input.email, agencyId: input.agencyId });
      return {
        leadId: `lead_for_${input.captureId}`,
        personId: `person_for_${input.captureId}`,
        prospectId: `prospect_for_${input.captureId}`,
        pipelineCardId: `card_for_${input.captureId}`,
      };
    },
  };
  return {
    storage, activity, events: eventBus, leadUsers, promotions,
    inspect: {
      activityLog,
      events,
      pendingLeadCreations,
      promotionCalls,
    },
  };
}

function container(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
    leadUsers: world.leadUsers,
    promotions: world.promotions,
  });
}

describe("@aqua/plugin-public-funnel smoke", () => {
  test("1. captureHcCompletion creates a pending capture outside authentication", async () => {
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
    assert.equal("session" in r, false);
    assert.equal(w.inspect.pendingLeadCreations.length, 1);
    assert.equal(r.capture.pendingLeadId, r.pendingLeadId);
    assert.match(r.pendingLeadId, /^pending_lead_/);
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

  test("3. canonical email reuse fails closed instead of attaching to an existing lead", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 2 } });
    await assert.rejects(
      () => c.funnel.captureHcCompletion({ email: "ED@Example.com", slot: { slot: 5 } }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "identity_unavailable",
    );
    assert.equal(w.inspect.pendingLeadCreations.length, 1);
    assert.equal((await c.funnel.list()).length, 1);
    resetClock();
  });

  test("4. emits only a non-PII pending summary on first capture", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const result = await c.funnel.captureHcCompletion({ email: "a@x.com", slot: { slot: 3 } });
    await assert.rejects(() => c.funnel.captureHcCompletion({ email: "a@x.com", slot: { slot: 4 } }));
    const captured = w.inspect.events.filter(e => e.name === "public-funnel.capture.pending");
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0]?.payload, {
      captureId: result.capture.id,
      source: "hc",
      bucket: "growing",
    });
    assert.equal(JSON.stringify(captured).includes("a@x.com"), false);
    assert.equal(JSON.stringify(captured).includes("pending_lead_"), false);
    resetClock();
  });

  test("5. pending summaries carry only the Health Check score bucket", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "a@x.com", slot: { slot: 1 } });
    await c.funnel.captureHcCompletion({ email: "b@x.com", slot: { slot: 3 } });
    await c.funnel.captureHcCompletion({ email: "c@x.com", slot: { slot: 5 } });
    const evs = w.inspect.events.filter(e => e.name === "public-funnel.capture.pending");
    assert.equal(evs.length, 3);
    const buckets = evs.map(e => (e.payload as { bucket: string }).bucket);
    assert.deepEqual(buckets, ["early", "growing", "scaling"]);
    resetClock();
  });

  test("6. captureToolCompletion stores tool source + emits a safe pending summary", async () => {
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
    assert.deepEqual(w.inspect.events.find(e => e.name === "public-funnel.capture.pending")?.payload, {
      captureId: r.capture.id,
      source: "tool",
      toolId: "rank-my-website",
    });
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
    await c.funnel.captureHcCompletion({ email: "Other@example.com", slot: { slot: 4 } });
    const ed = await c.funnel.listByEmail("ED@Example.COM");
    assert.equal(ed.length, 1);
    const other = await c.funnel.listByEmail("other@example.com");
    assert.equal(other.length, 1);
    resetClock();
  });

  test("9. pending captures are not me-context identities; legacy promoted rows still resolve", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 2 } });
    assert.equal(await c.funnel.meContext(a.pendingLeadId), null);
    await w.storage.set(`captures/by-id/${a.capture.id}`, {
      ...a.capture,
      leadUserId: "user_mailbox_proven",
    });
    const ctx = await c.funnel.meContext("user_mailbox_proven");
    assert.ok(ctx);
    assert.equal(ctx?.captures.length, 1);
    assert.equal(ctx?.hcSlot?.slot, 2);
    assert.equal(ctx?.captures[0]?.capturedAt, T0);
    resetClock();
  });

  test("10. meContext returns null for an unknown lead user id", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    assert.equal(await c.funnel.meContext("user_nonexistent"), null);
    resetClock();
  });

  test("11. invalid or oversized Health Check slots fail before identity creation", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(
      () => c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 99 } }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "invalid_hc_slot",
    );
    await assert.rejects(
      () => c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 3, blob: "x".repeat(70_000) } }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "invalid_hc_slot",
    );
    assert.equal(w.inspect.pendingLeadCreations.length, 0);
    resetClock();
  });

  test("12. activity entries use category 'public-funnel' with public-funnel.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({ email: "ed@example.com", slot: { slot: 3 } });
    await c.funnel.captureToolCompletion({ email: "tool@example.com", toolId: "rmw" });
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["public-funnel"]);
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("public-funnel.capture.pending"));
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

  test("14. retrying one completion id is refused without returning the prior identity", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const input = {
      email: "ed@example.com",
      completionId: "hc_result_0001",
      slot: { slot: 3, summary: { headline: "Stored once" } },
    };
    await c.funnel.captureHcCompletion(input);
    await assert.rejects(
      () => c.funnel.captureHcCompletion(input),
      (error: unknown) => error instanceof FunnelInputError && error.message === "completion_id_replayed",
    );
    assert.equal((await c.funnel.list()).length, 1);
    assert.equal(w.inspect.events.filter(e => e.name === "public-funnel.capture.pending").length, 1);
    resetClock();
  });

  test("15. an existing identity is rejected before a capture is persisted", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const original = w.leadUsers.withPendingLeadByEmail;
    w.leadUsers.withPendingLeadByEmail = async () => ({ created: false });
    const c = container(w);
    const input = {
      email: "existing@example.com",
      completionId: "hc_result_resume",
      slot: { slot: 2 },
    };
    await assert.rejects(
      () => c.funnel.captureHcCompletion(input),
      (error: unknown) => error instanceof FunnelInputError && error.message === "identity_unavailable",
    );
    assert.equal((await c.funnel.list()).length, 0);
    assert.equal(w.inspect.events.length, 0);
    w.leadUsers.withPendingLeadByEmail = original;
    resetClock();
  });

  test("16. concurrent retries produce one capture and one replay refusal", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const input = {
      email: "race@example.com",
      completionId: "hc_result_race_01",
      slot: { slot: 4 },
    };
    const settled = await Promise.allSettled([
      c.funnel.captureHcCompletion(input),
      c.funnel.captureHcCompletion(input),
    ]);
    assert.equal(settled.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(settled.filter(result => result.status === "rejected").length, 1);
    assert.equal((await c.funnel.list()).length, 1);
    assert.equal(w.inspect.events.filter(e => e.name === "public-funnel.capture.pending").length, 1);
    resetClock();
  });

  test("17. reads derive from capture rows rather than the legacy unlocked indexes", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await c.funnel.captureHcCompletion({
      email: "truth@example.com",
      completionId: "hc_result_truth_01",
      slot: { slot: 5 },
    });
    await w.storage.set("captures/index", []);
    await w.storage.set("captures/by-email/truth@example.com", []);
    assert.equal((await c.funnel.list()).length, 1);
    assert.equal((await c.funnel.listByEmail("truth@example.com")).length, 1);
    resetClock();
  });

  test("18. query-scoped anonymous capture routes are retired", () => {
    assert.deepEqual(ROUTES.map(route => route.path), ["me-context"]);
    assert.equal(ROUTES.some(route => route.public === true), false);
  });

  test("19. exact pending-capture erasure cleans indexes and preserves a shared pending row", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const captured = await c.funnel.captureHcCompletion({
      email: "shared-erasure@example.com",
      completionId: "hc_shared_erasure_01",
      slot: { slot: 3 },
    });
    const exactKey = `captures/by-id/${captured.capture.id}`;
    await w.storage.set(exactKey, { ...captured.capture, clientId: "client-a" });
    await w.storage.set("captures/by-id/lc_hc_shared_erasure_b", {
      ...captured.capture,
      id: "lc_hc_shared_erasure_b",
      clientId: "client-b",
    });
    await w.storage.set("captures/index", [captured.capture.id, "lc_hc_shared_erasure_b"]);
    await w.storage.set("captures/by-email/shared-erasure@example.com", [captured.capture.id, "lc_hc_shared_erasure_b"]);

    const subject = {
      clientId: "client-a",
      personShared: true,
      emails: ["shared-erasure@example.com"],
      sharedEmails: ["shared-erasure@example.com"],
    };
    const first = await c.funnel.eraseForClient(subject);
    const retry = await c.funnel.eraseForClient(subject);

    assert.equal(first.erased, 1);
    assert.equal(retry.erased, 0);
    assert.equal(await w.storage.get(exactKey), undefined);
    assert.ok(await w.storage.get("captures/by-id/lc_hc_shared_erasure_b"));
    assert.deepEqual(await w.storage.get("captures/index"), ["lc_hc_shared_erasure_b"]);
    assert.ok(await w.storage.get("captures/by-email/shared-erasure@example.com"),
      "shared address pointer was deleted while a capture remains");
    assert.equal(first.reviewRequired.sharedIdentity, 1,
      "the preserved capture must remain review work");
    assert.equal((await w.storage.get<{ pendingLeadId?: string }>("captures/by-id/lc_hc_shared_erasure_b"))?.pendingLeadId,
      captured.pendingLeadId, "the surviving capture's pending id was altered");
    resetClock();
  });

  test("20. concurrent canonical spellings create only one pending capture", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const settled = await Promise.allSettled([
      c.funnel.captureHcCompletion({
        email: "canonical-race@example.com",
        completionId: "canonical_race_first",
        slot: { slot: 2 },
      }),
      c.funnel.captureHcCompletion({
        email: "  CANONICAL-RACE@EXAMPLE.COM ",
        completionId: "canonical_race_second",
        slot: { slot: 4 },
      }),
    ]);
    assert.equal(settled.filter(result => result.status === "fulfilled").length, 1);
    const refusal = settled.find(result => result.status === "rejected");
    assert.ok(refusal?.status === "rejected");
    assert.ok(refusal.reason instanceof FunnelInputError);
    assert.equal(refusal.reason.message, "identity_unavailable");
    assert.equal((await c.funnel.listByEmail("canonical-race@example.com")).length, 1);
    assert.equal(w.inspect.pendingLeadCreations.length, 1);
    resetClock();
  });

  test("21. promotion requires exact authority and replays one linked conversion", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const captured = await c.funnel.captureHcCompletion({
      email: "proof-owner@example.com",
      completionId: "promotion_capture_01",
      slot: { slot: 4 },
    });

    await assert.rejects(
      () => c.funnel.promotePendingCapture({
        captureId: captured.capture.id,
        authority: {
          kind: "mailbox-proof",
          verifiedEmail: "attacker@example.com",
          verificationId: "verify-proof-001",
        },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "mailbox_proof_mismatch",
    );
    assert.equal(w.inspect.promotionCalls.length, 0);

    const command = {
      captureId: captured.capture.id,
      authority: {
        kind: "mailbox-proof" as const,
        verifiedEmail: " PROOF-OWNER@EXAMPLE.COM ",
        verificationId: "verify-proof-001",
      },
    };
    const promoted = await c.funnel.promotePendingCapture(command);
    const replay = await c.funnel.promotePendingCapture(command);
    assert.equal(promoted.promoted, true);
    assert.equal(replay.promoted, false);
    assert.deepEqual(replay.promotion, promoted.promotion);
    assert.equal(w.inspect.promotionCalls.length, 1);
    assert.equal(promoted.capture.pendingLeadId, undefined);
    assert.equal(promoted.capture.personId, promoted.promotion.personId);
    assert.equal(promoted.promotion.leadId, `lead_for_${captured.capture.id}`);

    await assert.rejects(
      () => c.funnel.promotePendingCapture({
        ...command,
        authority: { ...command.authority, verificationId: "verify-proof-002" },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "capture_already_promoted",
    );
    const event = w.inspect.events.find(e => e.name === "public-funnel.capture.promoted");
    assert.ok(event);
    assert.equal(JSON.stringify(event).includes("proof-owner@example.com"), false);
    assert.equal(JSON.stringify(event).includes("pending_lead_"), false);
    resetClock();
  });

  test("22. an authenticated operator can explicitly promote a pending capture", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const captured = await c.funnel.captureToolCompletion({
      email: "operator-promoted@example.com",
      completionId: "operator_promotion_01",
      toolId: "rank-my-website",
    });
    const promoted = await c.funnel.promotePendingCapture({
      captureId: captured.capture.id,
      authority: {
        kind: "authenticated",
        actorUserId: "agency_owner_001",
        operationId: "operator-command-001",
      },
    });
    assert.equal(promoted.promoted, true);
    assert.equal(promoted.promotion.authorityKind, "authenticated");
    resetClock();
  });
});

resetClock();
