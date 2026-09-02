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
    assert.equal(releaseCalls, 0, "an expired holder must not release ownership it no longer has");
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
    assert.equal(releaseCalls, 0, "a holder refused by renewal must not issue release");
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
