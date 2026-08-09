import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyStoragePatch, type StoragePatchOperation } from "../src/server/storagePatch";

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
