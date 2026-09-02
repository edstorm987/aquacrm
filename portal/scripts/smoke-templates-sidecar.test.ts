import assert from "node:assert/strict";
import { test } from "node:test";
import { applyStoragePatch, type StoragePatchOperation } from "../src/server/storagePatch";

const MAIN = "tpl-atomic-smoke";
const TPL = `${MAIN}:client-portal-templates`;
type Reply = "ok" | "reject-409" | "commit-504" | "commit-missing-sidecar";

function keyFromUrl(url: string): string {
  const match = /app_key=eq\.([^&]+)/.exec(url);
  return match ? decodeURIComponent(match[1]!) : "";
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("main and owned template sidecar commit through one receipt-deduplicated transaction", async () => {
  const originalFetch = globalThis.fetch;
  const originalBackend = process.env.PORTAL_BACKEND;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalStateKey = process.env.PORTAL_STATE_KEY;
  process.env.PORTAL_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://tpl-atomic.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.PORTAL_STATE_KEY = MAIN;

  const rows: Record<string, Record<string, unknown>> = {};
  const receipts = new Map<string, string>();
  const replies: Reply[] = [];
  const operationIds: string[] = [];
  let afterAtomicCommit: (() => void) | null = null;
  let atomicCalls = 0;
  let fullMainPosts = 0;
  let legacyOwnedReads = 0;

  const currentAtomicResult = (operationId: string, patches: Array<{ slug: string }>) => ({
    operationId,
    main: structuredClone(rows[MAIN] ?? {}),
    sidecars: Object.fromEntries(patches.map(patch => [
      patch.slug,
      structuredClone(rows[`${MAIN}:${patch.slug}`] ?? {}),
    ])),
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    if (method === "POST" && url.includes("/rpc/load_app_datastore_with_sidecars")) {
      const body = JSON.parse(String(init?.body)) as { p_sidecar_specs: Array<{ slug: string; key: string }> };
      return Response.json({
        main: structuredClone(rows[MAIN] ?? {}),
        sidecars: Object.fromEntries(body.p_sidecar_specs.map(spec => {
          const stored = structuredClone(rows[`${MAIN}:${spec.slug}`] ?? {});
          const collection = stored[spec.key];
          const authoritative = stored.__aquaSidecarAuthoritative === true;
          if (!authoritative && (!collection || typeof collection !== "object" || Array.isArray(collection))) {
            stored[spec.key] = {};
          }
          return [spec.slug, stored];
        })),
      });
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch_with_sidecars")) {
      atomicCalls += 1;
      const body = JSON.parse(String(init?.body)) as {
        p_operation_id: string;
        p_main_operations: StoragePatchOperation[];
        p_sidecar_patches: Array<{ slug: string; key: string; operations: StoragePatchOperation[] }>;
      };
      operationIds.push(body.p_operation_id);
      const payload = JSON.stringify({ main: body.p_main_operations, sidecars: body.p_sidecar_patches });
      const existing = receipts.get(body.p_operation_id);
      if (existing && existing !== payload) return new Response("operation id payload mismatch", { status: 409 });
      const reply = replies.shift() ?? "ok";
      if (reply === "reject-409") return new Response("definitive transaction rejection", { status: 409 });

      if (!existing) {
        let main = structuredClone(rows[MAIN] ?? {});
        const committedSidecars: Record<string, Record<string, unknown>> = {};
        for (const sidecar of body.p_sidecar_patches) {
          const rowKey = `${MAIN}:${sidecar.slug}`;
          let document = structuredClone(rows[rowKey] ?? {});
          const held = document[sidecar.key];
          const authoritative = document.__aquaSidecarAuthoritative === true
            || Boolean(held && typeof held === "object" && Object.keys(held as object).length > 0);
          if (!authoritative) {
            document[sidecar.key] = structuredClone(main[sidecar.key] ?? {});
          }
          document = applyStoragePatch(document, sidecar.operations) as Record<string, unknown>;
          document.__aquaSidecarAuthoritative = true;
          committedSidecars[rowKey] = document;
          main[sidecar.key] = {};
        }
        main = applyStoragePatch(main, body.p_main_operations) as Record<string, unknown>;
        rows[MAIN] = main;
        Object.assign(rows, committedSidecars);
        receipts.set(body.p_operation_id, payload);
        afterAtomicCommit?.();
        afterAtomicCommit = null;
      }

      if (reply === "commit-504") return new Response("gateway timeout after commit", { status: 504 });
      if (reply === "commit-missing-sidecar") {
        return Response.json({ operationId: body.p_operation_id, main: structuredClone(rows[MAIN]), sidecars: {} });
      }
      return Response.json(currentAtomicResult(body.p_operation_id, body.p_sidecar_patches));
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      const body = JSON.parse(String(init?.body)) as {
        p_operation_id: string;
        p_operations: StoragePatchOperation[];
      };
      operationIds.push(body.p_operation_id);
      if (!receipts.has(body.p_operation_id)) {
        rows[MAIN] = applyStoragePatch(rows[MAIN] ?? {}, body.p_operations) as Record<string, unknown>;
        receipts.set(body.p_operation_id, JSON.stringify(body.p_operations));
        afterAtomicCommit?.();
        afterAtomicCommit = null;
      }
      const reply = replies.shift() ?? "ok";
      if (reply === "commit-504") return new Response("gateway timeout after commit", { status: 504 });
      return Response.json({ operationId: body.p_operation_id, main: structuredClone(rows[MAIN]) });
    }
    if (method === "POST") {
      fullMainPosts += 1;
      const body = JSON.parse(String(init?.body)) as { app_key?: string; data: Record<string, unknown> };
      rows[body.app_key ?? MAIN] = structuredClone(body.data);
      return new Response(null, { status: 204 });
    }
    const key = keyFromUrl(url);
    if (key === MAIN || key === TPL) legacyOwnedReads += 1;
    return Response.json(Object.hasOwn(rows, key) ? [{ data: structuredClone(rows[key]!) }] : []);
  };

  try {
    const storage = await import("../src/server/storage");
    const load = async (main: Record<string, unknown>, sidecar?: Record<string, unknown>) => {
      rows[MAIN] = structuredClone(main);
      if (sidecar) rows[TPL] = structuredClone(sidecar);
      else delete rows[TPL];
      replies.length = 0;
      afterAtomicCommit = null;
      await storage.ensureHydrated({ fresh: true });
    };
    const transact = (suffix: string) => storage.withAtomicPortalStateMutation(() => {
      storage.mutate(state => {
        state.agencyProducts[`product_${suffix}`] = { id: `product_${suffix}`, name: suffix } as never;
        state.clientPortalTemplates[`tpl_${suffix}`] = { id: `tpl_${suffix}`, name: suffix } as never;
      });
    });

    const legacyMain = () => ({
      assistant: { keep: true },
      clientPortalTemplates: { tpl_legacy: { id: "tpl_legacy", name: "Legacy" } },
    });

    // All pre-marker forms remain non-authoritative fallback candidates. The
    // snapshot RPC normalizes their response shape but must not invent authority.
    await load(legacyMain());
    assert.ok(storage.getState().clientPortalTemplates.tpl_legacy, "missing row did not fall back to main");
    await load(legacyMain(), {});
    assert.ok(storage.getState().clientPortalTemplates.tpl_legacy, "legacy empty document did not fall back to main");
    await load(legacyMain(), { clientPortalTemplates: {} });
    assert.ok(storage.getState().clientPortalTemplates.tpl_legacy, "legacy empty collection did not fall back to main");
    await load(legacyMain(), { clientPortalTemplates: {}, __aquaSidecarAuthoritative: true });
    assert.deepEqual(storage.getState().clientPortalTemplates, {}, "authoritative empty collection lost authority");

    // Main-only delayed reconciliation retires the confirmed operation but
    // retains a concurrently appended local operation. It must not replay the
    // original same-path set over a durable successor with a new receipt.
    await load({ assistant: { target: "before" } });
    replies.push("commit-504", "commit-504");
    afterAtomicCommit = () => {
      (rows[MAIN]!.assistant as Record<string, unknown>).target = "durable-successor";
      storage.mutate(state => { state.assistant.retained_main_op = true; });
    };
    storage.mutate(state => { state.assistant.target = "uncertain-writer"; });
    await assert.rejects(storage.flushPendingWrites(), /reconciliation retry also failed/);
    await storage.ensureHydrated({ fresh: true });
    assert.equal(storage.getState().assistant.target, "durable-successor");
    assert.equal((rows[MAIN]!.assistant as Record<string, unknown>).retained_main_op, true);

    // A definitive database rejection rolls back both rows because neither was
    // ever visible outside the single SQL transaction.
    await load(legacyMain());
    replies.push("reject-409");
    await assert.rejects(transact("rejected"), /transaction rejection/);
    assert.equal(rows[TPL], undefined);
    assert.equal(rows[MAIN]!.agencyProducts, undefined);
    assert.ok(storage.getState().clientPortalTemplates.tpl_legacy);

    // First seed copies the locked main fallback, applies the exact template
    // patch and clears main in that same commit.
    await transact("seeded");
    assert.deepEqual(rows[MAIN]!.clientPortalTemplates, {});
    assert.deepEqual(
      Object.keys(rows[TPL]!.clientPortalTemplates as Record<string, unknown>).sort(),
      ["tpl_legacy", "tpl_seeded"],
    );
    assert.equal(rows[TPL]!.__aquaSidecarAuthoritative, true);

    // A gateway response after commit retries the same receipt. A same-path
    // successor between responses must win; the logical set is not re-applied.
    const idsBefore = operationIds.length;
    replies.push("commit-504", "ok");
    afterAtomicCommit = () => {
      const products = (rows[MAIN]!.agencyProducts ?? {}) as Record<string, unknown>;
      products.product_gateway = { id: "product_gateway", name: "Successor" };
      rows[MAIN]!.agencyProducts = products;
    };
    await transact("gateway");
    assert.equal(operationIds[idsBefore], operationIds[idsBefore + 1], "retry used a different durable operation id");
    assert.deepEqual(
      (rows[MAIN]!.agencyProducts as Record<string, unknown>).product_gateway,
      { id: "product_gateway", name: "Successor" },
      "receipt retry reapplied a stale set over the successor",
    );

    // A malformed but valid 2xx missing a requested sidecar is unknown inside
    // the adapter boundary; exact receipt retry recovers the committed result.
    replies.push("commit-missing-sidecar", "ok");
    await transact("missing_response");
    assert.ok(storage.getState().clientPortalTemplates.tpl_missing_response);
    assert.ok((rows[MAIN]!.agencyProducts as Record<string, unknown>).product_missing_response);

    // A successor already in the sidecar is patched under the same row lock;
    // no warm whole-collection replacement can erase it.
    (rows[TPL]!.clientPortalTemplates as Record<string, unknown>).tpl_successor = {
      id: "tpl_successor",
      name: "Successor",
    };
    await transact("after_successor");
    assert.ok((rows[TPL]!.clientPortalTemplates as Record<string, unknown>).tpl_successor);
    assert.ok((rows[TPL]!.clientPortalTemplates as Record<string, unknown>).tpl_after_successor);

    // Two unknown responses keep a sidecar-only operation fenced with the same
    // receipt. Reconciliation must not replay it over a later durable successor.
    await load(
      { assistant: { keep: true }, clientPortalTemplates: {} },
      { clientPortalTemplates: { uncertain: { id: "uncertain" } }, __aquaSidecarAuthoritative: true },
    );
    replies.push("commit-504", "commit-504");
    afterAtomicCommit = () => {
      (rows[TPL]!.clientPortalTemplates as Record<string, unknown>).successor_after_unknown = {
        id: "successor_after_unknown",
      };
      storage.mutate(state => { state.assistant.retained_concurrent_op = true; });
    };
    storage.mutate(state => { state.clientPortalTemplates = {}; });
    await assert.rejects(storage.flushPendingWrites(), /reconciliation retry also failed/);
    assert.throws(() => storage.mutate(state => { state.assistant.blocked = true; }), /reconciliation retry/);
    await storage.ensureHydrated({ fresh: true });
    assert.ok(storage.getState().clientPortalTemplates.successor_after_unknown);
    assert.equal((rows[MAIN]!.assistant as Record<string, unknown>).retained_concurrent_op, true);

    // Sidecar-only deletion still uses the atomic RPC, never a full main POST.
    await load(
      { assistant: { keep: true }, clientPortalTemplates: { stale_main: { id: "stale_main" } } },
      { clientPortalTemplates: { only: { id: "only", name: "Only" } }, __aquaSidecarAuthoritative: true },
    );
    const postsBeforeDelete = fullMainPosts;
    storage.mutate(state => { state.clientPortalTemplates = {}; });
    await storage.flushPendingWrites();
    assert.equal(fullMainPosts, postsBeforeDelete, "sidecar-only flush used full main saveBlob");
    assert.deepEqual(rows[TPL]!.clientPortalTemplates, {});
    assert.deepEqual(rows[MAIN]!.clientPortalTemplates, {});

    // Even if an old main copy appears, the authoritative empty sidecar wins
    // hydration and cannot resurrect deleted templates.
    rows[MAIN]!.clientPortalTemplates = { stale_main: { id: "stale_main" } };
    await storage.ensureHydrated({ fresh: true });
    assert.deepEqual(storage.getState().clientPortalTemplates, {});
    assert.ok(atomicCalls >= 5);
    assert.equal(legacyOwnedReads, 0, "Supabase hydration split main and owned-sidecar reads instead of using one snapshot RPC");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("PORTAL_BACKEND", originalBackend);
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalKey);
    restoreEnv("PORTAL_STATE_KEY", originalStateKey);
  }
});
