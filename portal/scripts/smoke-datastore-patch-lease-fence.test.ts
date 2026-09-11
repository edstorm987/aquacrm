// The authoritative datastore write must be lease-fenced IN the write
// transaction — the correction for the TOCTOU an independent acceptance flagged
// NO-GO: the product-workspace lease was validated only by a separate app-layer
// renewal RPC, so a writer whose lease was taken over between that renewal and
// the write could still commit a stale mutation.
//
// This drives the REAL coordinator + storage layer through a mocked Supabase RPC
// surface that MODELS the migration's in-transaction fence (reject the write
// when a carried fence no longer names an unexpired, still-owned lease). It
// proves two things locally:
//   1. THREADING — a coordinated write actually carries the held lease
//      {workspaceKey, holderId} to the patch RPC as `p_lease_fences`.
//   2. FENCE SEMANTICS — when a successor takes the lease over in the window
//      between the app-layer renewal and the write, the fenced write is rejected
//      and NOTHING is persisted (the exact stale-writer commit that was possible
//      before).
//
// The plpgsql fence itself runs only on a live database; that end-to-end
// enforcement is REQUIRES-STAGING (like the RLS/CAPTCHA proofs), and the
// migration is verified there. Here the RPC model mirrors the migration's check.

import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "supabase";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://patch-fence.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "patch-fence-service-role";
process.env.PORTAL_STATE_KEY = "patch-fence-state";
// A long refresh window: a fresh 60s lease has ~60s remaining at commit (> the
// 30s sync-renew threshold), so no renewal fires mid-transaction and the fence
// check sees exactly the claimed lease.
process.env.AQUA_PRODUCT_WORKSPACE_LEASE_REFRESH_MS = "10000";

interface ModelLease { holderId: string; expiresAt: number }

test("the datastore patch is lease-fenced: it carries the held lease, and a stale writer is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  console.warn = () => undefined;

  const { applyStoragePatch } = await import("../src/server/storagePatch");

  const leases = new Map<string, ModelLease>(); // workspace_key -> live lease
  const claimedEver = new Map<string, ModelLease>(); // every claim, never deleted (for assertions)
  let remoteData: Record<string, unknown> = {};
  let lastPatchFences: unknown = undefined;
  let patchAttempts = 0;
  // Runs inside the patch RPC, BEFORE the modeled fence check — the window a
  // successor can steal the lease in. Null except for the stale-writer case.
  let successorTakeoverBeforeWrite: (() => void) | null = null;

  const readBody = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (method === "POST" && url.includes("/rpc/read_aqua_write_admission")) {
      const body = readBody(init);
      const now = new Date().toISOString();
      return Response.json({
        appKey: "aquacrm-portal-state",
        global: { scope: "global", scopeId: "global", frozen: false, revision: 1, reason: null, actor: null, changedAt: now },
        tenant: body.p_tenant_id
          ? { scope: "tenant", scopeId: body.p_tenant_id, frozen: false, revision: 1, reason: null, actor: null, changedAt: now }
          : null,
        pendingQuarantines: 0,
        frozenTenants: 0,
      });
    }
    if (method === "POST" && url.includes("/rpc/load_app_datastore_with_sidecars")) {
      const body = readBody(init) as { p_sidecar_specs?: Array<{ slug: string; key: string }> };
      return Response.json({
        main: structuredClone(remoteData),
        sidecars: Object.fromEntries((body.p_sidecar_specs ?? []).map(spec => [spec.slug, { [spec.key]: {} }])),
      });
    }
    if (method === "POST" && url.includes("/rpc/claim_product_workspace_lease")) {
      const body = readBody(init) as { p_workspace_key: string; p_holder_id: string; p_lease_ms: number };
      const expiresAt = Date.now() + Math.min(body.p_lease_ms ?? 60000, 60000);
      leases.set(body.p_workspace_key, { holderId: body.p_holder_id, expiresAt });
      claimedEver.set(body.p_workspace_key, { holderId: body.p_holder_id, expiresAt });
      return Response.json({ state: "claimed", leaseExpiresAt: expiresAt });
    }
    if (method === "POST" && url.includes("/rpc/renew_product_workspace_lease")) {
      const body = readBody(init) as { p_workspace_key: string; p_holder_id: string; p_lease_ms: number };
      const lease = leases.get(body.p_workspace_key);
      // Renewal is holder-fenced (like the migration): only the current unexpired
      // owner may renew.
      if (lease && lease.holderId === body.p_holder_id && lease.expiresAt > Date.now()) {
        lease.expiresAt = Date.now() + Math.min(body.p_lease_ms ?? 60000, 60000);
        return Response.json({ state: "claimed", leaseExpiresAt: lease.expiresAt });
      }
      return Response.json({ state: "held", leaseExpiresAt: lease?.expiresAt ?? Date.now() });
    }
    if (method === "POST" && url.includes("/rpc/release_product_workspace_lease")) {
      const body = readBody(init) as { p_workspace_key: string; p_holder_id: string };
      const lease = leases.get(body.p_workspace_key);
      if (lease && lease.holderId === body.p_holder_id) leases.delete(body.p_workspace_key);
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      patchAttempts += 1;
      const body = readBody(init) as {
        p_operation_id: string;
        p_operations?: unknown;
        p_main_operations?: unknown;
        p_lease_fences?: Array<{ workspaceKey?: string; holderId?: string }>;
      };
      lastPatchFences = body.p_lease_fences;

      // The window: a successor may steal the lease between the app-layer
      // renewal and this write.
      successorTakeoverBeforeWrite?.();

      // Model the migration's in-transaction fence check: every carried fence
      // must still name an unexpired, still-owned lease, or the write RAISEs.
      for (const fence of body.p_lease_fences ?? []) {
        const lease = fence.workspaceKey ? leases.get(fence.workspaceKey) : undefined;
        if (!lease || lease.holderId !== fence.holderId || lease.expiresAt <= Date.now()) {
          return new Response(
            JSON.stringify({ code: "AQ409", message: "product_workspace_lease_lost" }),
            { status: 409, headers: { "content-type": "application/json" } },
          );
        }
      }

      const isSidecar = url.includes("apply_app_datastore_patch_with_sidecars");
      const ops = (isSidecar ? body.p_main_operations : body.p_operations) as Parameters<typeof applyStoragePatch>[1];
      remoteData = applyStoragePatch(remoteData, ops) as Record<string, unknown>;
      return Response.json(
        isSidecar
          ? { operationId: body.p_operation_id, main: structuredClone(remoteData), sidecars: {} }
          : { operationId: body.p_operation_id, main: structuredClone(remoteData) },
      );
    }
    if (method === "POST") {
      const body = readBody(init) as { data?: Record<string, unknown> };
      if (body.data) remoteData = structuredClone(body.data);
      return new Response(null, { status: 204 });
    }
    return Response.json([{ data: structuredClone(remoteData) }]);
  }) as typeof fetch;

  try {
    const { withProductWorkspaceTransaction } = await import("../src/server/productWorkspaceCoordinator");
    const storage = await import("../src/server/storage");

    // ── 1. Threading + a valid fence commits ─────────────────────────────
    await withProductWorkspaceTransaction({ agencyId: "ag_fence", clientId: "cl_fence", productId: "prod_ok" }, () => {
      storage.mutate(state => { state.assistant.fencedWrite = { persisted: true }; });
    });

    assert.ok(Array.isArray(lastPatchFences), "the coordinated write must carry a p_lease_fences array");
    const fences = lastPatchFences as Array<{ workspaceKey?: string; holderId?: string }>;
    assert.equal(fences.length, 1, "exactly the one held product-workspace lease is fenced");
    assert.ok(fences[0]?.workspaceKey && fences[0]?.holderId, "the fence carries workspaceKey and holderId");
    // The fence names a lease the mock recorded at claim time — proving it is the
    // real held lease, not a fabricated token. (The live lease was released when
    // the transaction ended, so this checks the persistent claim record.)
    const claimed = claimedEver.get(fences[0]!.workspaceKey!);
    assert.ok(claimed, "the fenced workspaceKey matches a lease that was actually claimed");
    assert.equal(claimed!.holderId, fences[0]!.holderId, "the fenced holderId matches the claimed lease holder");
    assert.deepEqual(storage.getState().assistant.fencedWrite, { persisted: true }, "a valid fence lets the write commit");
    assert.deepEqual((remoteData.assistant as Record<string, unknown>)?.fencedWrite, { persisted: true }, "the committed write reached the datastore");

    // ── 2. A successor takeover between renewal and write is rejected ─────
    patchAttempts = 0;
    successorTakeoverBeforeWrite = () => {
      // Simulate a successor acquiring every workspace lease (new holder) in the
      // window after this holder's renewal but before its fenced write lands.
      for (const [workspaceKey] of leases) {
        leases.set(workspaceKey, { holderId: "successor-holder", expiresAt: Date.now() + 60_000 });
      }
    };

    await assert.rejects(
      withProductWorkspaceTransaction({ agencyId: "ag_fence", clientId: "cl_fence", productId: "prod_stale" }, () => {
        storage.mutate(state => { state.assistant.staleWrite = { persisted: false }; });
      }),
      (error: unknown) => {
        assert.ok(
          storage.isProductWorkspaceLeaseLostError(error)
            || /product_workspace_lease_lost|lease/i.test(error instanceof Error ? error.message : String(error)),
          `expected a lease-lost rejection, got ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      },
    );
    assert.ok(patchAttempts >= 1, "the fenced write must have been attempted (and rejected in-transaction)");
    assert.equal(storage.getState().assistant.staleWrite, undefined, "a stale-writer's mutation must not survive in cache");
    assert.equal(
      (remoteData.assistant as Record<string, unknown>)?.staleWrite, undefined,
      "the stale write must never reach the datastore — the in-transaction fence rejected it",
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
