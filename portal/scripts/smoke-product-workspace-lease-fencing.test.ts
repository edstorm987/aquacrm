import assert from "node:assert/strict";
import { test } from "node:test";

import { applyStoragePatch, type StoragePatchOperation } from "../src/server/storagePatch";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "supabase";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lease-fence.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "lease-fence-service-role";
process.env.PORTAL_STATE_KEY = "lease-fence-state";
process.env.AQUA_PRODUCT_WORKSPACE_LEASE_REFRESH_MS = "10";

type ClaimMode =
  | "heartbeat-failures"
  | "held-at-commit"
  | "boundary-interleave"
  | "patch-fail-interleave"
  | "healthy";

test("remote lease loss and expiry fence state commit, effects and release", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let remoteData: Record<string, unknown> = {};
  let mode: ClaimMode = "heartbeat-failures";
  let claimCalls = 0;
  let renewCalls = 0;
  let patchCalls = 0;
  let releaseCalls = 0;
  let boundaryMutation: (() => void) | null = null;
  let failedPatchMutation: (() => void) | null = null;
  let tentativeWriteObservedDuringPatch: unknown;

  console.warn = () => undefined;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    if (method === "POST" && url.includes("/rpc/read_aqua_write_admission")) {
      const admissionBody = JSON.parse(String(init?.body)) as { p_tenant_id?: string | null };
      const admissionNow = new Date().toISOString();
      return Response.json({
        appKey: "aquacrm-portal-state",
        global: { scope: "global", scopeId: "global", frozen: false, revision: 1, reason: null, actor: null, changedAt: admissionNow },
        tenant: admissionBody.p_tenant_id
          ? { scope: "tenant", scopeId: admissionBody.p_tenant_id, frozen: false, revision: 1, reason: null, actor: null, changedAt: admissionNow }
          : null,
        pendingQuarantines: 0,
        frozenTenants: 0,
      });
    }
    if (method === "POST" && url.includes("/rpc/load_app_datastore_with_sidecars")) {
      const body = JSON.parse(String(init?.body)) as { p_sidecar_specs: Array<{ slug: string; key: string }> };
      return Response.json({
        main: structuredClone(remoteData),
        sidecars: Object.fromEntries(body.p_sidecar_specs.map(spec => [spec.slug, { [spec.key]: {} }])),
      });
    }

    if (method === "POST" && url.includes("/rpc/claim_product_workspace_lease")) {
      claimCalls += 1;
      return Response.json({
        state: "claimed",
        leaseExpiresAt: Date.now() + (
          mode === "healthy" || mode === "patch-fail-interleave"
            ? 60_000
            : mode === "held-at-commit" || mode === "boundary-interleave"
              ? 1_000
              : 55
        ),
      });
    }
    if (method === "POST" && url.includes("/rpc/renew_product_workspace_lease")) {
      renewCalls += 1;
      if (mode === "heartbeat-failures") {
        return new Response("heartbeat unavailable", { status: 503 });
      }
      if (mode === "held-at-commit") {
        return Response.json({ state: "held", leaseExpiresAt: Date.now() + 60_000 });
      }
      if (mode === "boundary-interleave") boundaryMutation?.();
      return Response.json({ state: "claimed", leaseExpiresAt: Date.now() + 60_000 });
    }
    if (method === "POST" && url.includes("/rpc/release_product_workspace_lease")) {
      releaseCalls += 1;
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      patchCalls += 1;
      if (mode === "patch-fail-interleave") {
        failedPatchMutation?.();
        // A 409 is a definitive database rejection. Gateway/server failures
        // are outcome-unknown and are intentionally reconciled by replaying
        // the exact idempotent patch, so they cannot prove rollback semantics.
        return new Response("injected patch failure", { status: 409 });
      }
      const body = JSON.parse(String(init?.body)) as { p_operation_id: string; p_operations: StoragePatchOperation[] };
      remoteData = applyStoragePatch(remoteData, body.p_operations);
      return Response.json({ operationId: body.p_operation_id, main: structuredClone(remoteData) });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as { data?: Record<string, unknown> };
      if (body.data) remoteData = structuredClone(body.data);
      return new Response(null, { status: 204 });
    }
    return Response.json([{ data: structuredClone(remoteData) }]);
  };

  try {
    const [{ withPortalStateTransaction, ProductWorkspaceLeaseLostError }, storage] = await Promise.all([
      import("../src/server/productWorkspaceCoordinator"),
      import("../src/server/storage"),
    ]);

    let expiredEffectCalls = 0;
    await assert.rejects(
      withPortalStateTransaction("expired-after-heartbeats", async () => {
        storage.mutate(state => { state.assistant.leaseExpiredWrite = { persisted: false }; });
        const { deferUntilPortalStateCommit } = await import("../src/server/productWorkspaceCoordinator");
        assert.equal(deferUntilPortalStateCommit(() => { expiredEffectCalls += 1; }), true);
        await new Promise(resolve => setTimeout(resolve, 95));
      }),
      ProductWorkspaceLeaseLostError,
    );
    assert.equal(claimCalls, 1, "heartbeats must never reacquire through the initial claim RPC");
    assert.ok(renewCalls >= 2, "repeated fenced renewal failures must be observed until the lease expires");
    assert.equal(patchCalls, 0, "expired ownership must be fenced before the state patch");
    // After local expiry the holder issues exactly ONE best-effort, holder-checked
    // release. The database is authoritative: release_product_workspace_lease
    // DELETEs only a row whose holder_id still matches, so a successor's row is
    // untouched and a stale row this holder still owns is cleaned up rather than
    // stranded to TTL. See the property tests below for the behavioural proof.
    assert.equal(releaseCalls, 1, "an expired holder issues exactly one best-effort holder-checked release");
    assert.equal(expiredEffectCalls, 0, "post-commit effects must not run after a fenced commit");
    assert.equal(storage.getState().assistant.leaseExpiredWrite, undefined);

    mode = "held-at-commit";
    claimCalls = 0;
    renewCalls = 0;
    patchCalls = 0;
    releaseCalls = 0;
    let heldEffectCalls = 0;
    await assert.rejects(
      withPortalStateTransaction("held-at-commit", async () => {
        storage.mutate(state => { state.assistant.leaseHeldWrite = { persisted: false }; });
        const { deferUntilPortalStateCommit } = await import("../src/server/productWorkspaceCoordinator");
        assert.equal(deferUntilPortalStateCommit(() => { heldEffectCalls += 1; }), true);
      }),
      ProductWorkspaceLeaseLostError,
    );
    assert.equal(claimCalls, 1, "a held renewal must never fall back to reacquiring the lease");
    assert.equal(renewCalls, 1, "a nearly-expired lease must be synchronously renewed before commit");
    assert.equal(patchCalls, 0);
    // After renewal reports ownership lost, the holder issues exactly ONE
    // best-effort holder-checked release; the DB no-ops it if a successor already
    // owns the row (property tests below).
    assert.equal(releaseCalls, 1, "a holder refused by renewal issues exactly one best-effort holder-checked release");
    assert.equal(heldEffectCalls, 0);
    assert.equal(storage.getState().assistant.leaseHeldWrite, undefined);

    mode = "healthy";
    claimCalls = 0;
    renewCalls = 0;
    patchCalls = 0;
    releaseCalls = 0;
    let healthyEffectCalls = 0;
    const healthyStartedAt = Date.now();
    await withPortalStateTransaction("healthy-lease", async () => {
      storage.mutate(state => { state.assistant.healthyLeaseWrite = { persisted: true }; });
      const { deferUntilPortalStateCommit } = await import("../src/server/productWorkspaceCoordinator");
      assert.equal(deferUntilPortalStateCommit(() => { healthyEffectCalls += 1; }), true);
    });
    const healthyElapsedMs = Date.now() - healthyStartedAt;
    assert.equal(claimCalls, 1, "a fresh lease does not need an unnecessary second claim");
    // This file pins the refresh window at 10ms (see the env at the top). On a
    // loaded machine the transaction itself can take longer than that, and then
    // the periodic refresh legitimately renews once — that is the coordinator
    // doing its job, not an unnecessary renewal. Only a transaction that finished
    // inside the window can prove "no renewal"; a slower one is bounded instead,
    // so CPU contention (a parallel production build, 2026-09-02) cannot turn this
    // pin into a false regression.
    if (healthyElapsedMs < 10) {
      assert.equal(renewCalls, 0, "a fresh lease does not need an unnecessary renewal");
    } else {
      assert.ok(renewCalls <= 1, `a fresh lease may refresh at most once when the transaction outlives the 10ms window (took ${healthyElapsedMs}ms, renewed ${renewCalls}×)`);
    }
    assert.equal(patchCalls, 1);
    assert.equal(releaseCalls, 1);
    assert.equal(healthyEffectCalls, 1);
    assert.deepEqual(storage.getState().assistant.healthyLeaseWrite, { persisted: true });

    mode = "boundary-interleave";
    claimCalls = 0;
    renewCalls = 0;
    patchCalls = 0;
    releaseCalls = 0;
    boundaryMutation = () => {
      storage.mutate(state => {
        state.assistant.boundaryConcurrentWrite = { persisted: true };
      });
    };
    await withPortalStateTransaction("boundary-interleave", async () => {
      storage.mutate(state => {
        state.assistant.boundaryTransactionWrite = { persisted: true };
      });
    });
    boundaryMutation = null;
    assert.equal(claimCalls, 1);
    assert.equal(renewCalls, 1);
    assert.deepEqual(storage.getState().assistant.boundaryConcurrentWrite, { persisted: true });
    assert.deepEqual(storage.getState().assistant.boundaryTransactionWrite, { persisted: true });
    assert.deepEqual(
      (remoteData.assistant as Record<string, unknown>).boundaryConcurrentWrite,
      { persisted: true },
      "a writer interleaved during lease renewal must survive the transaction merge",
    );

    mode = "patch-fail-interleave";
    claimCalls = 0;
    renewCalls = 0;
    patchCalls = 0;
    releaseCalls = 0;
    failedPatchMutation = () => {
      tentativeWriteObservedDuringPatch = storage.getState().assistant.failedTransactionWrite;
      storage.mutate(state => {
        state.assistant.concurrentDuringFailedPatch = { persisted: true };
      });
    };
    await assert.rejects(
      withPortalStateTransaction("failed-patch-interleave", async () => {
        storage.mutate(state => {
          state.assistant.failedTransactionWrite = { persisted: false };
        });
      }),
      /patch failed/,
    );
    failedPatchMutation = null;
    assert.equal(
      tentativeWriteObservedDuringPatch,
      undefined,
      "ordinary readers must not observe transaction state before the backend commit succeeds",
    );
    assert.deepEqual(
      storage.getState().assistant.concurrentDuringFailedPatch,
      { persisted: true },
      "rollback must preserve a concurrent writer that arrived during the failed flush",
    );
    assert.equal(storage.getState().assistant.failedTransactionWrite, undefined);

    mode = "healthy";
    await storage.flushPendingWrites();
    assert.deepEqual(
      (remoteData.assistant as Record<string, unknown>).concurrentDuringFailedPatch,
      { persisted: true },
    );
    assert.equal(
      (remoteData.assistant as Record<string, unknown>).failedTransactionWrite,
      undefined,
      "a rejected transaction must not leak through a later retry flush",
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Behavioural proof of the holder-checked release contract (owner directive,
// 2026-09-11). "The database is authoritative." release_product_workspace_lease
// DELETEs ONLY a row whose (app_key, workspace_key, holder_id) still match
// (supabase/migrations/20260825130000_product_workspace_leases.sql), so an
// unconditional best-effort release after local expiry/loss is safe: it can only
// delete this holder's own row, never a successor's. Local Date.now()/lostError
// is a hint, never the fence; each acquisition takes a fresh, never-reused
// holder_id (productWorkspaceCoordinator.holderId()). These tests model that SQL
// contract faithfully and drive the REAL storage/coordinator code through it.
// ═══════════════════════════════════════════════════════════════════════════

// stateKeyForRealm("live") per backend — they legitimately differ (Supabase reads
// PORTAL_STATE_KEY; Postgres hardcodes __portal_state__) and each is internally
// consistent across claim/renew/release, which is all release parity requires.
const SUPABASE_APP_KEY = "lease-fence-state"; // == PORTAL_STATE_KEY set at the top
const POSTGRES_APP_KEY = "__portal_state__";
const WS_KEY = "product-workspace-fence-ws";

interface LeaseRow { holderId: string; leaseExpiresAt: number }

/**
 * Faithful in-memory model of claim/renew/release_product_workspace_lease,
 * mirroring the migration including the holder-checked DELETE. Both backend
 * clients route here so the two implementations exercise one authoritative
 * contract.
 */
function makeLeaseSqlModel(clock: { now: () => number } = { now: () => Date.now() }) {
  const rows = new Map<string, LeaseRow>();
  const rk = (appKey: string, wsKey: string) => `${appKey} ${wsKey}`;
  const clamp = (ms: unknown) => Math.max(1000, Math.min(Number(ms) || 60000, 60000));
  return {
    rows,
    seed(appKey: string, wsKey: string, row: LeaseRow) { rows.set(rk(appKey, wsKey), { ...row }); },
    peek(appKey: string, wsKey: string): LeaseRow | null { return rows.get(rk(appKey, wsKey)) ?? null; },
    claim(appKey: string, wsKey: string, holderId: string, leaseMs?: unknown) {
      if (!String(appKey ?? "").trim() || !String(wsKey ?? "").trim() || !String(holderId ?? "").trim()) {
        throw new Error("app key, workspace key and holder id are required");
      }
      const existing = rows.get(rk(appKey, wsKey));
      if (existing && existing.holderId !== holderId && existing.leaseExpiresAt > clock.now()) {
        return { state: "held", leaseExpiresAt: existing.leaseExpiresAt };
      }
      const leaseExpiresAt = clock.now() + clamp(leaseMs);
      rows.set(rk(appKey, wsKey), { holderId, leaseExpiresAt });
      return { state: "claimed", leaseExpiresAt };
    },
    renew(appKey: string, wsKey: string, holderId: string, leaseMs?: unknown) {
      const existing = rows.get(rk(appKey, wsKey));
      if (existing && existing.holderId === holderId && existing.leaseExpiresAt > clock.now()) {
        const leaseExpiresAt = clock.now() + clamp(leaseMs);
        rows.set(rk(appKey, wsKey), { holderId, leaseExpiresAt });
        return { state: "claimed", leaseExpiresAt };
      }
      return { state: "held", leaseExpiresAt: existing?.leaseExpiresAt ?? clock.now() };
    },
    release(appKey: string, wsKey: string, holderId: string) {
      const existing = rows.get(rk(appKey, wsKey));
      if (existing && existing.holderId === holderId) rows.delete(rk(appKey, wsKey));
    },
  };
}
type LeaseSqlModel = ReturnType<typeof makeLeaseSqlModel>;

/** Route Supabase REST lease/datastore RPCs (+ a controllable write-admission) to the model. */
function installLeaseFetch(model: LeaseSqlModel, opts: {
  admission?: () => { globalFrozen?: boolean; tenantFrozen?: boolean };
  releaseStatus?: () => number;
  remote?: { data: Record<string, unknown> };
} = {}) {
  const original = globalThis.fetch;
  const rec = { claim: 0, renew: 0, release: 0, patch: 0, releaseBodies: [] as Array<Record<string, any>> };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, any> : {};
    if (method === "POST" && url.includes("/rpc/read_aqua_write_admission")) {
      const a = opts.admission?.() ?? {};
      const iso = new Date().toISOString();
      return Response.json({
        appKey: "aquacrm-portal-state",
        global: { scope: "global", scopeId: "global", frozen: !!a.globalFrozen, reason: a.globalFrozen ? "drill" : null, revision: 1, actor: a.globalFrozen ? "ops" : null, changedAt: iso },
        tenant: body.p_tenant_id ? { scope: "tenant", scopeId: body.p_tenant_id, frozen: !!a.tenantFrozen, reason: a.tenantFrozen ? "drill" : null, revision: 1, actor: a.tenantFrozen ? "ops" : null, changedAt: iso } : null,
        pendingQuarantines: 0, frozenTenants: a.tenantFrozen ? 1 : 0,
      });
    }
    if (method === "POST" && url.includes("/rpc/claim_product_workspace_lease")) { rec.claim += 1; return Response.json(model.claim(body.p_app_key, body.p_workspace_key, body.p_holder_id, body.p_lease_ms)); }
    if (method === "POST" && url.includes("/rpc/renew_product_workspace_lease")) { rec.renew += 1; return Response.json(model.renew(body.p_app_key, body.p_workspace_key, body.p_holder_id, body.p_lease_ms)); }
    if (method === "POST" && url.includes("/rpc/release_product_workspace_lease")) {
      rec.release += 1; rec.releaseBodies.push(body);
      const status = opts.releaseStatus?.() ?? 204;
      if (status < 300) model.release(body.p_app_key, body.p_workspace_key, body.p_holder_id);
      return new Response(status < 300 ? null : "release failed", { status });
    }
    if (method === "POST" && url.includes("/rpc/load_app_datastore_with_sidecars")) {
      return Response.json({ main: structuredClone(opts.remote?.data ?? {}), sidecars: Object.fromEntries((body.p_sidecar_specs ?? []).map((s: any) => [s.slug, { [s.key]: {} }])) });
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      rec.patch += 1;
      if (opts.remote) opts.remote.data = applyStoragePatch(opts.remote.data, body.p_operations);
      return Response.json({ operationId: body.p_operation_id, main: structuredClone(opts.remote?.data ?? {}) });
    }
    if (method === "POST") return new Response(null, { status: 204 });
    return Response.json([{ data: structuredClone(opts.remote?.data ?? {}) }]);
  }) as typeof fetch;
  return { rec, restore: () => { globalThis.fetch = original; } };
}

test("holder-checked release — a stale holder cannot delete or disrupt a successor; wrong-holder and repeated releases are safe no-ops (properties 1 & 3)", async () => {
  let clock = 1_000_000;
  const model = makeLeaseSqlModel({ now: () => clock });
  const { rec, restore } = installLeaseFetch(model);
  const warn = console.warn; console.warn = () => undefined;
  try {
    const { releaseProductWorkspaceLease } = await import("../src/server/storageSupabase");
    // A owns the row; A's lease expires and successor B steals it (row -> B).
    model.seed(SUPABASE_APP_KEY, WS_KEY, { holderId: "holder-A", leaseExpiresAt: clock + 60_000 });
    clock += 61_000;
    const b = model.claim(SUPABASE_APP_KEY, WS_KEY, "holder-B", 60_000);
    assert.equal(b.state, "claimed");
    assert.equal(model.peek(SUPABASE_APP_KEY, WS_KEY)?.holderId, "holder-B");
    // Property 1: A's delayed best-effort release runs through the REAL storage
    // function; the DB no-ops it (holder mismatch); B is completely undisturbed.
    await releaseProductWorkspaceLease(WS_KEY, "holder-A", {}, "live");
    assert.equal(rec.releaseBodies.at(-1)?.p_holder_id, "holder-A");
    assert.equal(rec.releaseBodies.at(-1)?.p_app_key, SUPABASE_APP_KEY, "release targets the realm app_key");
    const afterStale = model.peek(SUPABASE_APP_KEY, WS_KEY);
    assert.equal(afterStale?.holderId, "holder-B", "the successor's row survives the stale holder's release");
    assert.equal(afterStale?.leaseExpiresAt, b.leaseExpiresAt, "the successor's lease is undisturbed");
    // Property 3: a holder that never owned the row cannot delete it.
    await releaseProductWorkspaceLease(WS_KEY, "holder-never-owned", {}, "live");
    assert.equal(model.peek(SUPABASE_APP_KEY, WS_KEY)?.holderId, "holder-B", "a wrong-holder release changes nothing");
    // Property 3: repeated release is a safe no-op.
    await releaseProductWorkspaceLease(WS_KEY, "holder-B", {}, "live");
    assert.equal(model.peek(SUPABASE_APP_KEY, WS_KEY), null, "B's own release deletes B's row");
    await releaseProductWorkspaceLease(WS_KEY, "holder-B", {}, "live");
    assert.equal(model.peek(SUPABASE_APP_KEY, WS_KEY), null, "a repeated release after the row is gone is a safe no-op");
    assert.equal(rec.release, 4, "every release attempt reached the holder-checked DB function");
  } finally { restore(); console.warn = warn; }
});

test("release before a successor claims frees the slot; and release cleans up A's OWN row under a wrong local expiry belief (properties 1 & 2)", async () => {
  let clock = 2_000_000;
  const model = makeLeaseSqlModel({ now: () => clock });
  const { restore } = installLeaseFetch(model);
  const warn = console.warn; console.warn = () => undefined;
  try {
    const { releaseProductWorkspaceLease } = await import("../src/server/storageSupabase");
    // Property 1: A releases before B claims -> slot free -> B claims normally.
    model.seed(SUPABASE_APP_KEY, WS_KEY, { holderId: "holder-A", leaseExpiresAt: clock + 60_000 });
    await releaseProductWorkspaceLease(WS_KEY, "holder-A", {}, "live");
    assert.equal(model.peek(SUPABASE_APP_KEY, WS_KEY), null, "A's release removed A's own row");
    assert.equal(model.claim(SUPABASE_APP_KEY, WS_KEY, "holder-B", 60_000).state, "claimed", "B claims the freed slot normally");
    // Property 2: the DB row is still A's and unexpired, but the APPLICATION clock
    // wrongly believes it expired. A's best-effort release deletes A's OWN row
    // (holder match) rather than stranding it until TTL — the correction's intent.
    model.rows.clear();
    model.seed(SUPABASE_APP_KEY, WS_KEY, { holderId: "holder-A", leaseExpiresAt: clock + 60_000 });
    assert.ok((model.peek(SUPABASE_APP_KEY, WS_KEY)?.leaseExpiresAt ?? 0) > clock, "the authoritative row is still live and owned by A");
    await releaseProductWorkspaceLease(WS_KEY, "holder-A", {}, "live");
    assert.equal(model.peek(SUPABASE_APP_KEY, WS_KEY), null, "A cleans up its own row even under a wrong local expiry belief (anti-stranding)");
  } finally { restore(); console.warn = warn; }
});

test("containment (write-admission frozen) blocks a fresh claim before any lease RPC (property 4a)", async () => {
  const model = makeLeaseSqlModel();
  const { rec, restore } = installLeaseFetch(model, { admission: () => ({ globalFrozen: true }), remote: { data: {} } });
  const warn = console.warn; console.warn = () => undefined;
  try {
    const { withPortalStateTransaction } = await import("../src/server/productWorkspaceCoordinator");
    const { isWriteAdmissionDenied } = await import("../src/lib/server/security/writeAdmission");
    const storage = await import("../src/server/storage");
    let caught: unknown;
    await withPortalStateTransaction("containment-blocks-claim", async () => {
      storage.mutate(state => { state.assistant.containmentBlockedWrite = { persisted: false }; });
    }).catch((e: unknown) => { caught = e; });
    assert.ok(caught, "a frozen write-admission must reject the transaction");
    assert.ok(isWriteAdmissionDenied(caught), "containment blocks the claim via write-admission");
    assert.equal(rec.claim, 0, "the claim RPC is never reached while containment is active");
    assert.equal(rec.release, 0, "nothing was acquired, so nothing is released");
    assert.equal(storage.getState().assistant.containmentBlockedWrite, undefined, "no state is written under containment");
  } finally { restore(); console.warn = warn; }
});

test("containment fences an in-flight transaction's renewal yet still permits the holder-checked cleanup release (property 4b)", async () => {
  const model = makeLeaseSqlModel();
  let frozen = false;
  const { rec, restore } = installLeaseFetch(model, { admission: () => ({ globalFrozen: frozen }), remote: { data: {} } });
  const warn = console.warn; console.warn = () => undefined;
  try {
    const { withPortalStateTransaction, ProductWorkspaceLeaseLostError } = await import("../src/server/productWorkspaceCoordinator");
    const storage = await import("../src/server/storage");
    await assert.rejects(
      withPortalStateTransaction("containment-permits-release", async () => {
        storage.mutate(state => { state.assistant.containmentReleaseWrite = { persisted: false }; });
        frozen = true; // containment activates mid-transaction
        await new Promise(resolve => setTimeout(resolve, 60)); // let a fenced renewal fire (refresh window is 10ms)
      }),
      ProductWorkspaceLeaseLostError,
    );
    assert.ok(rec.claim >= 1, "the initial claim happened before containment");
    assert.equal(rec.patch, 0, "the fenced transaction never applied its datastore patch");
    assert.equal(rec.release, 1, "a holder-checked cleanup release IS issued during containment");
    assert.equal(storage.getState().assistant.containmentReleaseWrite, undefined, "the fenced write did not persist");
  } finally { restore(); console.warn = warn; }
});

test("a failed release never fails the already-committed transaction; the lease falls back to TTL expiry (property 5)", async () => {
  const model = makeLeaseSqlModel();
  const remote = { data: {} as Record<string, unknown> };
  const { rec, restore } = installLeaseFetch(model, { releaseStatus: () => 503, remote });
  const warn = console.warn; console.warn = () => undefined;
  try {
    const { withPortalStateTransaction } = await import("../src/server/productWorkspaceCoordinator");
    const storage = await import("../src/server/storage");
    // The commit succeeds; the finally's release fails (503) and is swallowed.
    await withPortalStateTransaction("release-failure-ttl", async () => {
      storage.mutate(state => { state.assistant.releaseFallbackWrite = { persisted: true }; });
    });
    assert.equal(rec.patch, 1, "the transaction committed its patch");
    assert.equal(rec.release, 1, "exactly one best-effort release was attempted");
    assert.deepEqual(storage.getState().assistant.releaseFallbackWrite, { persisted: true }, "the commit succeeded despite the failed release");
    assert.ok(model.rows.size >= 1, "a failed release leaves the row to self-expire at TTL, never a hard failure");
  } finally { restore(); console.warn = warn; }
});

test("Supabase and Postgres release implementations have equivalent holder-checked semantics (property 7)", async () => {
  const model = makeLeaseSqlModel();
  const captured: Array<{ backend: string; appKey: unknown; wsKey: unknown; holderId: unknown; noOped: boolean }> = [];

  // ── Supabase path: real storageSupabase.release routed to the model ──
  {
    const { restore } = installLeaseFetch(model);
    const warn = console.warn; console.warn = () => undefined;
    try {
      const { releaseProductWorkspaceLease } = await import("../src/server/storageSupabase");
      model.rows.clear();
      model.seed(SUPABASE_APP_KEY, WS_KEY, { holderId: "holder-B", leaseExpiresAt: Date.now() + 60_000 });
      await releaseProductWorkspaceLease(WS_KEY, "holder-A", {}, "live"); // stale holder
      captured.push({ backend: "supabase", appKey: SUPABASE_APP_KEY, wsKey: WS_KEY, holderId: "holder-A", noOped: model.peek(SUPABASE_APP_KEY, WS_KEY)?.holderId === "holder-B" });
    } finally { restore(); console.warn = warn; }
  }

  // ── Postgres path: real storagePostgres.release with `pg` stubbed to the model ──
  {
    const { createRequire } = await import("node:module");
    const require_ = createRequire(import.meta.url);
    const pgId = require_.resolve("pg");
    const originalPgEntry = require_.cache[pgId];
    const pgQueries: Array<{ sql: string; params: unknown[] }> = [];
    class MockPool {
      async query(sql: string, params: unknown[] = []) {
        pgQueries.push({ sql, params });
        if (sql.includes("release_product_workspace_lease")) {
          const [appKey, wsKey, holderId] = params as string[];
          model.release(appKey, wsKey, holderId);
        }
        return { rows: [], rowCount: 1 };
      }
      async connect() { return { query: (s: string, p: unknown[]) => this.query(s, p), release() { /* pool client release */ } }; }
      async end() { /* noop */ }
    }
    require_.cache[pgId] = { id: pgId, filename: pgId, loaded: true, paths: [], children: [], exports: { Pool: MockPool } } as never;
    const prevDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://lease-fence.test/db";
    try {
      const pg = await import("../src/server/storagePostgres");
      await pg.closePool().catch(() => undefined);
      model.rows.clear();
      model.seed(POSTGRES_APP_KEY, WS_KEY, { holderId: "holder-B", leaseExpiresAt: Date.now() + 60_000 });
      await pg.releaseProductWorkspaceLease(WS_KEY, "holder-A", "live"); // stale holder
      const q = pgQueries.at(-1)!;
      assert.match(q.sql, /release_product_workspace_lease/, "postgres release calls the identical holder-checked function");
      captured.push({ backend: "postgres", appKey: q.params[0], wsKey: q.params[1], holderId: q.params[2], noOped: model.peek(POSTGRES_APP_KEY, WS_KEY)?.holderId === "holder-B" });
      await pg.closePool().catch(() => undefined);
    } finally {
      if (originalPgEntry) require_.cache[pgId] = originalPgEntry; else delete require_.cache[pgId];
      if (prevDbUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prevDbUrl;
    }
  }

  // Equivalence: both backends delegated a stale-holder release to the identical
  // holder-checked SQL function, passing (app_key, workspace_key, holder_id), and
  // BOTH no-oped it — the successor's row survived in both.
  assert.equal(captured.length, 2);
  for (const c of captured) {
    assert.equal(c.wsKey, WS_KEY, `${c.backend}: release targets the workspace key`);
    assert.equal(c.holderId, "holder-A", `${c.backend}: release carries the caller's holder_id`);
    assert.ok(String(c.appKey).length > 0, `${c.backend}: release carries a realm app_key`);
    assert.equal(c.noOped, true, `${c.backend}: a stale-holder release is a no-op; the successor survives`);
  }
});
