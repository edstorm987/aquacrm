// The templates sidecar — the second collection moved out of the portal document.
//
// In its own file, not appended to `smoke-storage-sidecars.test.ts`, for a
// reason worth stating: the storage backend and `PORTAL_STATE_KEY` are both
// resolved ONCE at module load. A second test in the same file inherits the
// first one's key and silently reads an empty row — which looks exactly like a
// broken fallback and cost a confusing ten minutes. `node:test` gives each FILE
// its own process, so a separate file is the only way to get a clean backend.
//
// ── Why templates are a different shape from workspace files ─────────────
//
// Workspace files are committed by their own row-locking RPC. Templates are
// written through ordinary `mutate()`, so the FLUSH owns this row — which is
// where the write ORDER starts to matter, because the main document write is
// what clears the collection out of it.
//
// 615 KB, 18.5% of the live document, and no personal data. That is why it is
// the second thing to move rather than the client records.

import assert from "node:assert/strict";
import { test } from "node:test";

import { applyStoragePatch } from "../src/server/storagePatch";
import type { StoragePatchOperation } from "../src/server/storagePatch";

const MAIN = "tpl-smoke";
const TPL = `${MAIN}:client-portal-templates`;

function keyFromUrl(url: string): string {
  const match = /app_key=eq\.([^&]+)/.exec(url);
  return match ? decodeURIComponent(match[1]!) : "";
}

test("clientPortalTemplates moves to its own row, written before the main document", async () => {
  const originalFetch = globalThis.fetch;
  const originalBackend = process.env.PORTAL_BACKEND;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalStateKey = process.env.PORTAL_STATE_KEY;

  const rows: Record<string, Record<string, unknown>> = {
    [MAIN]: {
      assistant: { keepMe: true },
      clientPortalTemplates: { tpl_legacy: { id: "tpl_legacy", name: "Legacy" } },
    },
  };
  const writeOrder: string[] = [];

  process.env.PORTAL_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://tpl-smoke.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-smoke";
  process.env.PORTAL_STATE_KEY = MAIN;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      const body = JSON.parse(String(init?.body)) as { p_app_key: string; p_operations: StoragePatchOperation[] };
      writeOrder.push(`patch:${body.p_app_key}`);
      rows[body.p_app_key] = applyStoragePatch(rows[body.p_app_key] ?? {}, body.p_operations) as Record<string, unknown>;
      return Response.json(structuredClone(rows[body.p_app_key]));
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as { app_key?: string; data: Record<string, unknown> };
      writeOrder.push(`save:${body.app_key ?? MAIN}`);
      rows[body.app_key ?? MAIN] = structuredClone(body.data);
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") return new Response(null, { status: 204 });
    const key = keyFromUrl(url);
    return Response.json(rows[key] ? [{ data: structuredClone(rows[key]!) }] : []);
  };

  try {
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated({ fresh: true });

    // No sidecar yet, so the main document is the fallback. Nothing is lost on
    // a project that has not been split.
    assert.deepEqual(
      Object.keys(storage.getState().clientPortalTemplates),
      ["tpl_legacy"],
      "with no sidecar yet, templates must still be read from the main document",
    );

    storage.mutate(state => {
      state.clientPortalTemplates = {
        ...state.clientPortalTemplates,
        tpl_new: { id: "tpl_new", name: "New" } as never,
      };
    });
    await storage.flushPendingWrites();

    assert.ok(rows[TPL], `the templates sidecar must exist; saw ${Object.keys(rows).join(", ")}`);
    assert.deepEqual(
      Object.keys(rows[TPL]!.clientPortalTemplates as Record<string, unknown>).sort(),
      ["tpl_legacy", "tpl_new"],
      "the pre-split templates must be carried across by the seeding write, not dropped",
    );

    // ORDER. The main write is what clears the collection from the document, so
    // a sidecar written after it would lose everything on a blip between the two.
    const sidecarWrite = writeOrder.findIndex(entry => entry === `save:${TPL}`);
    const mainWrite = writeOrder.findIndex(entry => entry.endsWith(`:${MAIN}`) || entry === `save:${MAIN}`);
    assert.ok(sidecarWrite >= 0, `the sidecar must be written; order was ${writeOrder.join(" → ")}`);
    assert.ok(
      mainWrite === -1 || sidecarWrite < mainWrite,
      `the sidecar must be written BEFORE the main document; order was ${writeOrder.join(" → ")}`,
    );

    storage.mutate(state => { state.assistant = { ...state.assistant, later: { ok: true } }; });
    await storage.flushPendingWrites();
    assert.deepEqual(rows[MAIN]!.clientPortalTemplates, {}, "the main document must not keep a second copy");
    assert.equal(
      (rows[MAIN]!.assistant as Record<string, unknown>).keepMe,
      true,
      "and clearing the templates must not disturb anything else in the document",
    );

    await storage.ensureHydrated({ fresh: true });
    assert.deepEqual(
      Object.keys(storage.getState().clientPortalTemplates).sort(),
      ["tpl_legacy", "tpl_new"],
      "hydration must read templates from the sidecar",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.PORTAL_BACKEND = originalBackend;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    process.env.PORTAL_STATE_KEY = originalStateKey;
  }
});
