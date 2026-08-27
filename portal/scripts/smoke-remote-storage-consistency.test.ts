import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RemoteOperationError } from "../src/lib/server/remoteOperation";
import { applyStoragePatch, diffStorageValue, type StoragePatchOperation } from "../src/server/storagePatch";

test("the first record initializes a new remote collection", () => {
  const operations = diffStorageValue(
    { dashboardDayPlans: {} },
    { dashboardDayPlans: { day_1: { id: "day_1", date: "2026-08-10" } } },
  );

  assert.deepEqual(operations, [{
    op: "set",
    path: ["dashboardDayPlans"],
    value: { day_1: { id: "day_1", date: "2026-08-10" } },
  }]);
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
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      const body = JSON.parse(String(init?.body)) as { p_operations: StoragePatchOperation[] };
      remoteData = applyStoragePatch(remoteData ?? {}, body.p_operations);
      return Response.json(structuredClone(remoteData));
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

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("Expected the promise to reject.");
}
