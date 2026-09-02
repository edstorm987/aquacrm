import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { RemoteOperationError } from "../src/lib/server/remoteOperation";
import { applyStoragePatch, diffStorageValue, type StoragePatchOperation } from "../src/server/storagePatch";

test("the first record initializes a new remote collection", () => {
  const operations = diffStorageValue(
    { dashboardDayPlans: {} },
    { dashboardDayPlans: { day_1: { id: "day_1", date: "2026-08-10" } } },
  );

  assert.deepEqual(operations, [{
    op: "merge_object",
    path: ["dashboardDayPlans"],
    value: { day_1: { id: "day_1", date: "2026-08-10" } },
  }]);
});

test("concurrent first children merge while explicit whole-value sets still replace", () => {
  const empty = { pluginData: {} };
  const first = diffStorageValue(empty, {
    pluginData: { shared_install: { "rows/a": { id: "a" } } },
  });
  const second = diffStorageValue(empty, {
    pluginData: { shared_install: { "rows/b": { id: "b" } } },
  });

  assert.equal(first[0]?.op, "merge_object");
  assert.equal(second[0]?.op, "merge_object");
  const remoteAfterBoth = applyStoragePatch(applyStoragePatch(empty, first), second);
  assert.deepEqual(remoteAfterBoth, {
    pluginData: {
      shared_install: {
        "rows/a": { id: "a" },
        "rows/b": { id: "b" },
      },
    },
  });

  assert.deepEqual(applyStoragePatch(remoteAfterBoth, [{
    op: "set",
    path: ["pluginData"],
    value: { replacement: { kept: true } },
  }]), {
    pluginData: { replacement: { kept: true } },
  }, "an explicit set remains an intentional whole-value replacement");
});

test("merge_object recurses through objects while legacy patch operations keep their semantics", () => {
  const merged = applyStoragePatch({
    pluginData: {
      shared_install: {
        "rows/a": { id: "a", left: true, tags: ["old"] },
      },
    },
    ordered: ["first"],
    removable: { retained: true },
  }, [
    {
      op: "merge_object",
      path: ["pluginData"],
      value: {
        shared_install: {
          "rows/a": { right: true, tags: ["replacement"] },
          "rows/b": { id: "b" },
        },
      },
    },
    { op: "append_unique", path: ["ordered"], value: "second" },
    { op: "append_unique", path: ["ordered"], value: "second" },
    { op: "set", path: ["explicit"], value: { exact: true } },
    { op: "delete", path: ["removable"] },
  ]);

  assert.deepEqual(merged, {
    pluginData: {
      shared_install: {
        "rows/a": { id: "a", left: true, right: true, tags: ["replacement"] },
        "rows/b": { id: "b" },
      },
    },
    ordered: ["first", "second"],
    explicit: { exact: true },
  });
});

test("the Supabase patch RPC implements row-locked merge_object", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260902090000_merge_app_datastore_patch_objects.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /operation_name = 'merge_object'/);
  assert.match(migration, /public\.aqua_jsonb_deep_merge\([\s\S]{0,250}?operation->'value'/);
  assert.match(migration, /IF claimed IS NOT TRUE THEN/);
  assert.doesNotMatch(migration, /IF NOT claimed THEN/);
  assert.match(migration, /app_datastore_patch_receipts_created_idx[\s\S]{0,100}?\(created_at\)/);
  assert.match(migration, /created_at < NOW\(\) - INTERVAL '30 days'/);
  assert.doesNotMatch(migration, /WHERE app_key = p_app_key AND created_at/);
});

test("product workspace renewal cannot reacquire an expired or transferred lease", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260902091000_product_workspace_lease_renewal_fencing.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /renew_product_workspace_lease/);
  assert.match(migration, /holder_id = p_holder_id/);
  assert.match(migration, /lease_expires_at > NOW\(\)/);
  assert.doesNotMatch(migration, /INSERT INTO public\.product_workspace_leases/);
});

test("owned sidecars and main use one receipt-deduplicated database transaction", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260902092000_owned_sidecar_compare_and_swap.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /apply_app_datastore_patch_with_sidecars/);
  assert.match(migration, /p_operation_id UUID/);
  assert.match(migration, /app_datastore_patch_receipts/);
  assert.match(migration, /existing_payload IS DISTINCT FROM request_payload/);
  assert.match(migration, /IF claimed IS NOT TRUE THEN/);
  assert.doesNotMatch(migration, /IF NOT claimed THEN/);
  assert.match(migration, /created_at < NOW\(\) - INTERVAL '30 days'/);
  assert.match(migration, /SELECT JSONB_BUILD_OBJECT\([\s\S]{0,700}?JSONB_OBJECT_AGG\(/,
    "duplicate receipt reads must return main and every sidecar from one statement snapshot");
  assert.match(migration, /ORDER BY app_key FOR UPDATE/);
  assert.match(migration, /current_sidecar := public\.aqua_apply_jsonb_patch/);
  assert.match(migration, /current_main := JSONB_SET\(current_main, ARRAY\[collection_key\], '\{\}'::JSONB, TRUE\)/);
  assert.match(migration, /'operationId', p_operation_id::TEXT[\s\S]{0,150}?'main', current_main[\s\S]{0,100}?'sidecars', saved_sidecars/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.match(migration, /load_app_datastore_with_sidecars/);
  assert.match(migration, /JSONB_TYPEOF\(datastore\.data->\(requested\.spec->>'key'\)\) = 'object'/);
  assert.match(migration, /datastore\.data->>'__aquaSidecarAuthoritative'[\s\S]{0,80}?THEN datastore\.data/);
});

test("high-volume Radar writes compact within one agency branch", () => {
  const unchangedAgency = { issues: { retained: { severity: "watch" } } };
  const before = {
    radarMemory: {
      "agency-a": { issues: {} },
      "agency-b": unchangedAgency,
    },
  };
  const after = {
    radarMemory: {
      "agency-a": {
        issues: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
          `issue-${index}`,
          { id: `issue-${index}`, severity: index % 2 ? "warning" : "critical" },
        ])),
      },
      "agency-b": unchangedAgency,
    },
  };

  const operations = diffStorageValue(before, after);
  assert.deepEqual(operations.map(operation => operation.path), [["radarMemory", "agency-a", "issues"]]);
  assert.deepEqual(applyStoragePatch(before, operations), after);
});

test("remote portal storage flushes writes and refreshes warm-process state", async () => {
  const originalFetch = globalThis.fetch;
  const originalBackend = process.env.PORTAL_BACKEND;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalStateKey = process.env.PORTAL_STATE_KEY;
  let remoteData: Record<string, unknown> | null = null;

  process.env.PORTAL_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage-smoke.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-smoke";
  process.env.PORTAL_STATE_KEY = "remote-storage-smoke";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const method = init?.method ?? "GET";
    if (method === "POST" && url.includes("/rpc/load_app_datastore_with_sidecars")) {
      const body = JSON.parse(String(init?.body)) as { p_sidecar_specs: Array<{ slug: string; key: string }> };
      return Response.json({
        main: structuredClone(remoteData ?? {}),
        sidecars: Object.fromEntries(body.p_sidecar_specs.map(spec => [spec.slug, { [spec.key]: {} }])),
      });
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      const body = JSON.parse(String(init?.body)) as { p_operation_id: string; p_operations: StoragePatchOperation[] };
      remoteData = applyStoragePatch(remoteData ?? {}, body.p_operations);
      return Response.json({ operationId: body.p_operation_id, main: structuredClone(remoteData) });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as { data: Record<string, unknown> };
      remoteData = structuredClone(body.data);
      return new Response(null, { status: 204 });
    }
    return Response.json(remoteData ? [{ data: structuredClone(remoteData) }] : []);
  };

  try {
    const storageModule = await import("../src/server/storage");
    const storage = "default" in storageModule
      ? storageModule.default as typeof storageModule
      : storageModule;

    await storage.ensureHydrated({ fresh: true });
    storage.mutate(state => {
      state.assistant = { ...state.assistant, storageSmoke: { version: 1 } };
    });
    await storage.flushPendingWrites();
    assert.deepEqual(
      (remoteData?.assistant as Record<string, unknown>)?.storageSmoke,
      { version: 1 },
      "flushPendingWrites must persist before the mutation request completes",
    );

    remoteData = {
      ...remoteData,
      pluginData: {
        finance: {
          "expenses/by-id/exp_remote": {
            id: "exp_remote",
            vendor: "Remote expense",
            amountCents: 2_500,
          },
        },
      },
    };
    storage.mutate(state => {
      state.assistant = { ...state.assistant, localWarmWrite: { kept: true } };
    });
    await storage.flushPendingWrites();
    assert.deepEqual(
      ((remoteData?.pluginData as Record<string, Record<string, unknown>>)?.finance)?.["expenses/by-id/exp_remote"],
      { id: "exp_remote", vendor: "Remote expense", amountCents: 2_500 },
      "a stale warm process must not erase fields written by another process",
    );
    assert.deepEqual(
      storage.getState().assistant.localWarmWrite,
      { kept: true },
      "the local cache must retain the mutation after rebasing onto remote state",
    );

    remoteData = {
      ...remoteData,
      assistant: {
        ...(remoteData?.assistant as Record<string, unknown>),
        storageSmoke: { version: 2 },
      },
    };
    await storage.ensureHydrated({ fresh: true });
    assert.deepEqual(
      storage.getState().assistant.storageSmoke,
      { version: 2 },
      "a warm process must reload changes committed by another process",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.PORTAL_BACKEND = originalBackend;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    process.env.PORTAL_STATE_KEY = originalStateKey;
  }
});

test("Supabase reads and full-state writes exit stalled adapters with typed recovery", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage-timeout.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-timeout";
  let lastSignal: AbortSignal | null = null;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    lastSignal = init?.signal as AbortSignal;
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  try {
    const storage = await import("../src/server/storageSupabase");
    const readError = await rejectionOf(storage.loadBlob({ timeoutMs: 5 }));
    assert.ok(readError instanceof RemoteOperationError);
    assert.equal(readError.retry, "safe");
    assert.equal(readError.outcomeUnknown, false);
    assert.equal(lastSignal?.aborted, true);

    const writeError = await rejectionOf(storage.saveBlob("{}", { timeoutMs: 5 }));
    assert.ok(writeError instanceof RemoteOperationError);
    assert.equal(writeError.retry, "reconcile-first");
    assert.equal(writeError.outcomeUnknown, true);
    assert.equal(lastSignal?.aborted, true);

    const patchError = await rejectionOf(storage.applyPatch([
      { op: "set", path: ["assistant", "deadline"], value: true },
    ], { timeoutMs: 5 }));
    assert.ok(patchError instanceof RemoteOperationError);
    assert.equal(patchError.retry, "same-operation-key");
    assert.equal(patchError.outcomeUnknown, true);
    assert.equal(lastSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  }
});

test("Supabase preserves unknown write outcome for gateway and malformed success responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage-uncertain.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-uncertain";

  try {
    const storage = await import("../src/server/storageSupabase");
    const operation: StoragePatchOperation = {
      op: "set",
      path: ["assistant", "uncertain-response"],
      value: true,
    };

    globalThis.fetch = async () => new Response("gateway timed out after commit", { status: 504 });
    const gatewayError = await rejectionOf(storage.applyPatch([operation]));
    assert.ok(gatewayError instanceof RemoteOperationError);
    assert.equal(gatewayError.outcomeUnknown, true);
    assert.equal(gatewayError.retry, "same-operation-key");

    globalThis.fetch = async () => new Response('{"truncated"', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const malformedError = await rejectionOf(storage.applyPatch([operation]));
    assert.ok(malformedError instanceof RemoteOperationError);
    assert.equal(malformedError.outcomeUnknown, true);
    assert.equal(malformedError.retry, "same-operation-key");

    globalThis.fetch = async () => Response.json({});
    const emptyEnvelopeError = await rejectionOf(storage.applyPatch([operation], { operationId: "11111111-1111-4111-8111-111111111111" }));
    assert.ok(emptyEnvelopeError instanceof RemoteOperationError);
    assert.equal(emptyEnvelopeError.outcomeUnknown, true);

    globalThis.fetch = async () => Response.json({
      operationId: "22222222-2222-4222-8222-222222222222",
      main: {},
    });
    const wrongReceiptError = await rejectionOf(storage.applyPatch([operation], { operationId: "11111111-1111-4111-8111-111111111111" }));
    assert.ok(wrongReceiptError instanceof RemoteOperationError);
    assert.equal(wrongReceiptError.outcomeUnknown, true);

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { p_operation_id: string };
      return Response.json({
        operationId: body.p_operation_id,
        main: {},
        sidecars: { "client-portal-templates": { clientPortalTemplates: "corrupt" } },
      });
    };
    const corruptCollectionError = await rejectionOf(storage.applyPatchWithSidecars(
      [],
      [{ slug: "client-portal-templates", key: "clientPortalTemplates", operations: [] }],
    ));
    assert.ok(corruptCollectionError instanceof RemoteOperationError);
    assert.equal(corruptCollectionError.outcomeUnknown, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  }
});

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("Expected the promise to reject.");
}
