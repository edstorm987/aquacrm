// mutate() patch-equivalence — the guard over the 2026-09-05 write-path change.
//
// `mutate()` no longer `structuredClone`s the whole ~2.9MB state on every call.
// It wraps the state in a Proxy that snapshots ONLY the top-level collections a
// callback actually touches, then diffs those. The claim this test defends is
// that the resulting patch operations are IDENTICAL to what a whole-state diff
// would have produced — i.e. the optimisation is invisible to persistence.
//
// It proves that end to end, not by inspecting ops: a mock Supabase applies the
// real `apply_app_datastore_patch` operations to a remote blob that was SEEDED
// with the full initial state, so after every flush the remote (patch-built) and
// the in-memory cache (mutated in place) must be byte-identical. If the Proxy
// ever misses a change, forgets a key, or emits a malformed op, the two diverge
// and the exact shape that broke is named.
//
// Runs on its own process (node:test isolates files), so setting the backend to
// supabase before importing storage takes effect — the `applyPatch` path is the
// one the Proxy diff feeds, and the one production uses on Railway.

import { test } from "node:test";
import assert from "node:assert/strict";

import { applyStoragePatch, type StoragePatchOperation } from "../src/server/storagePatch";

test("mutate() emits whole-state-diff-equivalent patch ops across every mutation shape", async () => {
  process.env.PORTAL_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mutate-equiv.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-equiv";
  process.env.PORTAL_STATE_KEY = "mutate-equiv-smoke";

  let remoteData: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url: string }).url;
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
  }) as typeof fetch;

  const storage = await import("../src/server/storage");
  // Include the one lazy sidecar (`devTeamWorkspaceFiles`) so the dev/test
  // undeclared-lazy-read guard stays quiet while we JSON-serialise the WHOLE
  // state for comparison. The production write path never touches getState(), so
  // this only concerns the test's own whole-state read.
  await storage.ensureHydrated({ fresh: true, include: ["devTeamWorkspaceFiles"] });

  // Normalise through JSON so both sides are compared as the plain, proxy-free,
  // undefined-stripped shapes the wire actually carries.
  const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  // Seed the remote with the FULL initial state, so every patch below is applied
  // against a complete baseline (in production the remote blob is the whole
  // state, never a bare {}). From here the remote is patch-built and the cache is
  // mutated in place; they must stay identical.
  remoteData = plain(storage.getState()) as Record<string, unknown>;

  // Shapes operate on REAL schema collections — `identityResolutionReviews` and
  // `persons` (the exact maps the inbox identity sync mutates, the hot path this
  // optimisation targets), `assistant`, and the `activity` array. Whole
  // top-level collections are fixed by the schema (parseBlob rebuilds them from a
  // whitelist), so record-level add/update/delete/nest/array within a collection
  // — not adding or removing a collection — is what production `mutate()` ever
  // does, and what must stay patch-equivalent.
  const RID = "equiv-review-1";
  const PID = "equiv-person-1";
  const shapes: Array<{ name: string; fn: (state: Record<string, any>) => void }> = [
    { name: "add a record to a collection", fn: s => { s.identityResolutionReviews[RID] = { id: RID, status: "open", candidates: [], meta: { n: 0 } }; } },
    { name: "update a nested field on that record", fn: s => { s.identityResolutionReviews[RID].status = "reviewing"; } },
    { name: "set a deep nested branch", fn: s => { s.identityResolutionReviews[RID].meta.n = 5; s.identityResolutionReviews[RID].meta.deep = { a: { b: 1 } }; } },
    { name: "mutate that deep branch again", fn: s => { s.identityResolutionReviews[RID].meta.deep.a.b = 99; s.identityResolutionReviews[RID].meta.deep.a.c = true; } },
    { name: "push onto a nested array", fn: s => { s.identityResolutionReviews[RID].candidates.push("x", "y", "z"); } },
    { name: "replace a nested array element", fn: s => { s.identityResolutionReviews[RID].candidates[0] = "REPLACED"; } },
    { name: "shorten a nested array", fn: s => { s.identityResolutionReviews[RID].candidates = s.identityResolutionReviews[RID].candidates.slice(0, 1); } },
    { name: "add a record to a SECOND collection (persons)", fn: s => { s.persons[PID] = { id: PID, displayName: "Ada", facets: { role: { kind: "lead" } } }; } },
    { name: "mutate the second collection's nested facet", fn: s => { s.persons[PID].facets.role.kind = "client"; s.persons[PID].facets.tags = ["vip"]; } },
    { name: "read one collection then mutate another", fn: s => { void Object.keys(s.persons); s.identityResolutionReviews[RID].readThenWrite = true; } },
    { name: "mutate two collections in one callback", fn: s => { s.identityResolutionReviews[RID].multi = 1; s.assistant = { ...(s.assistant ?? {}), equivMulti: 2 }; } },
    { name: "push onto the activity array (a top-level array)", fn: s => { s.activity.push({ id: "equiv-act-1", kind: "note", at: 1 }); } },
    { name: "a no-op that only reads (must queue nothing and diverge nothing)", fn: s => { void s.persons; void s.assistant; void s.identityResolutionReviews[RID].meta; } },
    { name: "null out a nested field", fn: s => { s.identityResolutionReviews[RID].meta.deep = null; } },
    { name: "delete a record from a collection", fn: s => { delete s.identityResolutionReviews[RID]; } },
    { name: "delete a record from the second collection", fn: s => { delete s.persons[PID]; } },
  ];

  for (const shape of shapes) {
    storage.mutate(shape.fn as (state: never) => void);
    await storage.flushPendingWrites();
    assert.deepEqual(
      remoteData,
      plain(storage.getState()),
      `after "${shape.name}", the patch-built remote diverged from the in-memory state — the Proxy diff dropped or mangled an operation`,
    );
  }
});
