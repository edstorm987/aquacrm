// The Dev Team workspace files live in their own datastore row.
//
// ── Why they were moved ──────────────────────────────────────────────────
//
// Measured against the live project on 2026-08-29:
//
//   whole document            3.25 MB
//   devTeamWorkspaceFiles      967 KB   29.0%   ← largest single collection
//   clients                    181 KB    5.4%   ← the actual business data
//
// PostgreSQL applies each `jsonb_set` against the COMPLETE value, and the patch
// RPC returns the whole saved document to be re-parsed into the cache. So
// somebody marking one enquiry as seen paid for 967 KB of a founder's markdown
// files on the way out AND on the way back.
//
// No SQL changed. Both RPCs already take `p_app_key` and read
// `data->'devTeamWorkspaceFiles'` from whichever row it names, so the workspace
// RPC simply points at a second key.
//
// ── The three ways this could go badly wrong ─────────────────────────────
//
// Each has a test below, because each would be silent:
//
//  1. **Wiping the portal.** The workspace RPC now returns the SIDECAR row,
//     which contains only the files. The old code replaced the whole cache with
//     the RPC's response — doing that now would erase every other collection.
//  2. **Deleting a founder's workspace on backends with no sidecar.** Memory
//     and file backends have nowhere else to put the files, so excluding them
//     from the main document there would simply delete them. Every exclusion is
//     conditional on the backend actually having somewhere else.
//  3. **Two rows disagreeing.** If the main document kept writing its copy, the
//     split would double the storage and leave two answers to "what is in this
//     file".

import assert from "node:assert/strict";
import { test } from "node:test";

import { applyStoragePatch } from "../src/server/storagePatch";
import type { StoragePatchOperation } from "../src/server/storagePatch";

const MAIN_KEY = "sidecar-smoke";
const SIDECAR_KEY = `${MAIN_KEY}:dev-workspace-files`;

function keyFromUrl(url: string): string {
  const match = /app_key=eq\.([^&]+)/.exec(url);
  return match ? decodeURIComponent(match[1]!) : "";
}

test("dev workspace files are written to their own row, and the portal is not wiped", async () => {
  const originalFetch = globalThis.fetch;
  const originalBackend = process.env.PORTAL_BACKEND;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalStateKey = process.env.PORTAL_STATE_KEY;

  // Two rows, exactly as the live project has.
  const rows: Record<string, Record<string, unknown>> = {
    [MAIN_KEY]: { assistant: { keepMe: true }, devTeamWorkspaceFiles: { "legacy.md": { relPath: "legacy.md", sha: "old" } } },
  };

  process.env.PORTAL_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sidecar-smoke.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-smoke";
  process.env.PORTAL_STATE_KEY = MAIN_KEY;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (method === "POST" && url.includes("/rpc/load_app_datastore_with_sidecars")) {
      const body = JSON.parse(String(init?.body)) as { p_app_key: string; p_sidecar_specs: Array<{ slug: string; key: string }> };
      return Response.json({
        main: structuredClone(rows[body.p_app_key] ?? {}),
        sidecars: Object.fromEntries(body.p_sidecar_specs.map(spec => [
          spec.slug,
          structuredClone(rows[`${body.p_app_key}:${spec.slug}`] ?? { [spec.key]: {} }),
        ])),
      });
    }

    if (method === "POST" && url.includes("/rpc/apply_dev_team_workspace_files")) {
      const body = JSON.parse(String(init?.body)) as { p_app_key: string; p_operations: Array<{ relPath: string; file: unknown }> };
      // The real function reads `data->'devTeamWorkspaceFiles'` from whatever
      // row `p_app_key` names — so this stub does the same, and the assertion
      // that it was handed the SIDECAR key is what proves the split.
      const target = (rows[body.p_app_key] ??= {});
      const files = (target.devTeamWorkspaceFiles ??= {}) as Record<string, unknown>;
      for (const operation of body.p_operations) files[operation.relPath] = operation.file;
      return Response.json(structuredClone(target));
    }
    if (method === "POST" && url.includes("/rpc/apply_app_datastore_patch")) {
      const body = JSON.parse(String(init?.body)) as { p_app_key: string; p_operation_id: string; p_operations: StoragePatchOperation[] };
      rows[body.p_app_key] = applyStoragePatch(rows[body.p_app_key] ?? {}, body.p_operations) as Record<string, unknown>;
      return Response.json({ operationId: body.p_operation_id, main: structuredClone(rows[body.p_app_key]) });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as { app_key?: string; data: Record<string, unknown> };
      rows[body.app_key ?? MAIN_KEY] = structuredClone(body.data);
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") return new Response(null, { status: 204 });
    const key = keyFromUrl(url);
    return Response.json(rows[key] ? [{ data: structuredClone(rows[key]) }] : []);
  };

  try {
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated({ fresh: true });

    // Before any commit there is no sidecar row, so the files must still be
    // read from the main document — otherwise the move loses them on a project
    // that has not been migrated.
    assert.deepEqual(
      Object.keys(storage.getState().devTeamWorkspaceFiles),
      ["legacy.md"],
      "with no sidecar yet, the main document is the fallback",
    );

    // An ordinary write must not carry the workspace files with it.
    storage.mutate(state => { state.assistant = { ...state.assistant, ordinary: { written: true } }; });
    await storage.flushPendingWrites();
    assert.deepEqual(
      (rows[MAIN_KEY]!.assistant as Record<string, unknown>).ordinary,
      { written: true },
      "an ordinary mutation must still persist",
    );

    // THE COMMIT. It must land in the sidecar row.
    await storage.commitDevTeamWorkspaceFiles([
      { relPath: "notes/new.md", file: { relPath: "notes/new.md", sha: "abc", contents: "x" } } as never,
    ]);

    assert.ok(rows[SIDECAR_KEY], `the sidecar row must exist; saw keys ${Object.keys(rows).join(", ")}`);
    // ── THE BUG THIS CATCHES ───────────────────────────────────────────────
    //
    // The first version lost data here. The RPC writes only the operations it
    // is handed, against whatever the sidecar already holds — which on an
    // unsplit project is nothing. So the first commit left the sidecar with
    // one file while the main document, which still had all of them, was
    // cleared on the next flush. Every other workspace file was gone.
    //
    // The commit now SEEDS the sidecar from the cache first, so the legacy file
    // must still be here alongside the new one.
    assert.deepEqual(
      Object.keys(rows[SIDECAR_KEY]!.devTeamWorkspaceFiles as Record<string, unknown>).sort(),
      ["legacy.md", "notes/new.md"],
      "the pre-split files must be carried into the sidecar, not dropped by the first commit",
    );

    // (1) The portal must not have been wiped by the RPC's response.
    assert.deepEqual(
      storage.getState().assistant.ordinary,
      { written: true },
      "the workspace RPC returns only the sidecar row — merging it must not erase other collections",
    );
    assert.deepEqual(
      storage.getState().devTeamWorkspaceFiles["notes/new.md"],
      { relPath: "notes/new.md", sha: "abc", contents: "x" },
      "and the committed file must be visible in the merged state",
    );

    // (3) The main document must stop carrying its copy.
    storage.mutate(state => { state.assistant = { ...state.assistant, second: { written: true } }; });
    await storage.flushPendingWrites();
    assert.deepEqual(
      rows[MAIN_KEY]!.devTeamWorkspaceFiles,
      {},
      "once the sidecar is real the main document must not keep a second, diverging copy",
    );

    // The sidecar wins on the next boot.
    await storage.ensureHydrated({ fresh: true });
    assert.deepEqual(
      Object.keys(storage.getState().devTeamWorkspaceFiles).sort(),
      ["legacy.md", "notes/new.md"],
      "hydration must prefer the sidecar — and the sidecar must hold everything",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.PORTAL_BACKEND = originalBackend;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    process.env.PORTAL_STATE_KEY = originalStateKey;
  }
});

test("a backend with no sidecar keeps the files in the main document", async () => {
  // (2) The failure that would delete a founder's workspace. Memory and file
  // backends have nowhere else to put these, so none of the exclusions above
  // may apply to them.
  const storage = await import("../src/server/storage");
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/server/storage.ts", "utf8");

  assert.match(
    source,
    /const splitOut = backend\.loadSidecarBlob[\s\S]{0,300}?runtime\.sidecarPopulated\.has\(entry\.slug\)[\s\S]{0,150}?ownedSidecarPatches\.some\(sidecar => sidecar\.slug === entry\.slug\)[\s\S]{0,50}?: \[\];/,
    "the exclusion must be conditional on BOTH the backend having sidecars and the sidecar being "
    + "confirmed populated — clearing before that is the data-loss bug this file exists to prevent",
  );
  assert.match(
    source,
    /\.filter\(operation => !splitOut\.some\(entry => entry\.key === operation\.path\[0\]\)\)/,
    "the patch exclusion must use the same set as the snapshot exclusion, or the two disagree",
  );
  assert.match(
    source,
    /if \(backend\.loadSidecarBlob\) \{[\s\S]{0,600}?current\.devTeamWorkspaceFiles = remoteState\.devTeamWorkspaceFiles/,
    "the merge-instead-of-replace must only apply where the RPC targets the sidecar",
  );
  assert.match(
    source,
    /operations\.push\(\{ op: "set", path: \[entry\.key\], value: \{\} \}\)/,
    "and the stale pre-split copy must be actively cleared, not merely stopped from growing",
  );
  assert.match(
    source,
    /if \(backend\.saveSidecarBlob && !runtime\.sidecarPopulated\.has\(devSidecar\.slug\)\)/,
    "and the first commit must seed the workspace sidecar from the cache before the RPC runs",
  );

  // Ordering. The main write is what CLEARS the collection from the portal
  // document, so a sidecar that is written after it would lose everything on a
  // network blip between the two.
  assert.match(source, /backend\.applyPatchWithSidecars\(operations, ownedSidecarPatches, operationId, realmId\)/,
    "owned sidecars and main must use one database transaction");
  assert.match(source, /if \(backend\.applyPatch\) \{\s*if \(operations\.length === 0\) return \{ mainBlob: null, sidecarBlobs: \{\} \};/,
    "a sidecar-only flush must never fall through to full main saveBlob");
  assert.match(source, /runtime\.pendingPatchOperations\.splice\(0, operationCount\)/,
    "successful sidecar-only operations must be removed from the pending queue");
  assert.match(
    source,
    /SIDECAR_COLLECTIONS\s*\.filter\(entry => !entry\.dedicatedWriter\)/,
    "a collection with its own row-locking RPC must not also be written by the flush — that races "
    + "the lock",
  );

  // The memory-backend round trip is not re-driven here: the backend resolves
  // once at module load, so this file cannot switch back after the test above.
  // It is covered far better anyway — the ENTIRE suite runs on
  // `PORTAL_BACKEND=memory`, and the Dev Team workspace tests in it exercise
  // this path for real. If any exclusion above were unconditional, those would
  // fail rather than this assertion.
  assert.ok(
    typeof storage.commitDevTeamWorkspaceFiles === "function",
    "the commit entry point must still exist for backends with no sidecar",
  );
});
