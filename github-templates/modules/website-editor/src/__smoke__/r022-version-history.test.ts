// Smoke — R022 Auto-save + persisted version history.

import {
  saveVersion,
  listVersions,
  getVersion,
  deleteVersion,
  renameVersion,
  AUTO_VERSION_CAP,
} from "../server/pageVersions";
import {
  handleSaveVersion,
  handleListVersions,
  handleGetVersion,
  handleDeleteVersion,
  handleRenameVersion,
} from "../api/handlers/pageVersions";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { Block } from "../types/block";
import type { AgencyId, ClientId } from "../lib/tenancy";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const a = "ag_smoke" as AgencyId;
const c = "cl_smoke" as ClientId;
const pageId = "page_smoke";
const TREE: Block[] = [{ id: "h1", type: "heading", props: { text: "Hi" } }];

(async () => {
  // ─── A: AUTO_VERSION_CAP ───────────────────────────────────────────────
  expect("AUTO_VERSION_CAP = 30", AUTO_VERSION_CAP === 30);

  // ─── B: saveVersion + listVersions round-trip ─────────────────────────
  const storage = memStorage();
  const r1 = await saveVersion(storage, {
    agencyId: a, clientId: c, pageId, blocks: TREE, savedBy: "u_smoke",
  });
  expect("saveVersion returns a record with id + blocks",
    r1.version.id.startsWith("v_") && r1.version.blocks === TREE);
  expect("auto-save has no label", r1.version.label === undefined);
  expect("savedBy populated", r1.version.savedBy === "u_smoke");

  const r2 = await saveVersion(storage, {
    agencyId: a, clientId: c, pageId,
    blocks: [...TREE, { id: "p1", type: "text", props: { text: "p" } }],
    savedBy: "u_smoke",
    label: "Pre-launch v1",
  });
  expect("named save preserves label", r2.version.label === "Pre-launch v1");

  const list = await listVersions(storage, a, c, pageId);
  expect("listVersions newest-first", list[0]!.id === r2.version.id && list[1]!.id === r1.version.id);
  expect("listVersions returns 2 entries", list.length === 2);

  const limited = await listVersions(storage, a, c, pageId, 1);
  expect("listVersions limit honoured", limited.length === 1);

  // ─── C: getVersion + deleteVersion ─────────────────────────────────────
  expect("getVersion returns the right record",
    (await getVersion(storage, a, c, pageId, r1.version.id))?.id === r1.version.id);
  expect("getVersion null for unknown id",
    (await getVersion(storage, a, c, pageId, "v_nope")) === null);

  const removed = await deleteVersion(storage, a, c, pageId, r1.version.id);
  expect("deleteVersion returns true on hit", removed);
  const afterDel = await listVersions(storage, a, c, pageId);
  expect("deleteVersion drops from list",
    afterDel.length === 1 && afterDel[0]!.id === r2.version.id);
  const removeMiss = await deleteVersion(storage, a, c, pageId, "v_nope");
  expect("deleteVersion returns false on miss", !removeMiss);

  // ─── D: renameVersion ─────────────────────────────────────────────────
  // Promote auto-save into named.
  const auto = await saveVersion(storage, {
    agencyId: a, clientId: c, pageId, blocks: TREE, savedBy: "u_smoke",
  });
  const promoted = await renameVersion(storage, a, c, pageId, auto.version.id, "Restored v2");
  expect("renameVersion adds label", promoted?.label === "Restored v2");
  // Strip label by passing empty.
  const stripped = await renameVersion(storage, a, c, pageId, auto.version.id, "");
  expect("renameVersion with empty strips label", stripped?.label === undefined);
  expect("renameVersion null on unknown",
    (await renameVersion(storage, a, c, pageId, "v_nope", "x")) === null);

  // ─── E: capacity trim — auto-save cap honoured, named survives ────────
  const stCap = memStorage();
  // Plant 1 named version first.
  await saveVersion(stCap, {
    agencyId: a, clientId: c, pageId, blocks: TREE, savedBy: "u_smoke", label: "anchor",
  });
  // Plant 32 auto-saves (over cap by 2).
  for (let i = 0; i < 32; i++) {
    await saveVersion(stCap, {
      agencyId: a, clientId: c, pageId, blocks: TREE, savedBy: "u_smoke",
    });
  }
  const finalList = await listVersions(stCap, a, c, pageId);
  const namedCount = finalList.filter(v => v.label).length;
  const unnamedCount = finalList.filter(v => !v.label).length;
  expect("named version survives cap trim",
    namedCount === 1 && finalList.some(v => v.label === "anchor"));
  expect("unnamed versions capped at AUTO_VERSION_CAP (30)",
    unnamedCount === AUTO_VERSION_CAP);

  // ─── F: HTTP handlers ─────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleSaveVersion>[1];

  // POST creates a version.
  const post = await handleSaveVersion(new Request("http://x/pages/versions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageId, blocks: TREE }),
  }), ctx);
  expect("POST /pages/versions 201", post.status === 201);
  const postBody = await post.json() as { ok: boolean; version: { id: string }; pruned: string[] };
  expect("POST returns version id", typeof postBody.version.id === "string");

  // POST 400 on missing pageId.
  const bad1 = await handleSaveVersion(new Request("http://x/pages/versions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blocks: TREE }),
  }), ctx);
  expect("POST without pageId → 400", bad1.status === 400);

  // POST 400 on missing blocks.
  const bad2 = await handleSaveVersion(new Request("http://x/pages/versions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageId }),
  }), ctx);
  expect("POST without blocks → 400", bad2.status === 400);

  // GET list.
  const lst = await handleListVersions(
    new Request(`http://x/pages/versions?pageId=${pageId}`), ctx,
  );
  expect("GET /pages/versions 200", lst.status === 200);
  const lstBody = await lst.json() as { versions: { id: string }[] };
  expect("GET surfaces 1 version", lstBody.versions.length === 1);

  // GET get.
  const got = await handleGetVersion(
    new Request(`http://x/pages/versions/get?pageId=${pageId}&versionId=${postBody.version.id}`), ctx,
  );
  expect("GET /pages/versions/get 200", got.status === 200);
  const got404 = await handleGetVersion(
    new Request(`http://x/pages/versions/get?pageId=${pageId}&versionId=v_nope`), ctx,
  );
  expect("GET unknown version → 404", got404.status === 404);

  // PATCH rename.
  const patch = await handleRenameVersion(
    new Request(`http://x/pages/versions?pageId=${pageId}&versionId=${postBody.version.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Test label" }),
    }), ctx,
  );
  expect("PATCH /pages/versions 200", patch.status === 200);
  const patchBody = await patch.json() as { version: { label: string } };
  expect("PATCH applies label", patchBody.version.label === "Test label");

  const patchBad = await handleRenameVersion(
    new Request(`http://x/pages/versions?pageId=${pageId}&versionId=${postBody.version.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), ctx,
  );
  expect("PATCH without label → 400", patchBad.status === 400);

  // DELETE.
  const del = await handleDeleteVersion(
    new Request(`http://x/pages/versions?pageId=${pageId}&versionId=${postBody.version.id}`, { method: "DELETE" }), ctx,
  );
  expect("DELETE /pages/versions 200", del.status === 200);
  const del404 = await handleDeleteVersion(
    new Request(`http://x/pages/versions?pageId=${pageId}&versionId=v_nope`, { method: "DELETE" }), ctx,
  );
  expect("DELETE unknown version → 404", del404.status === 404);

  // GET no pageId → 400 across endpoints.
  const noPg = await handleListVersions(new Request("http://x/pages/versions"), ctx);
  expect("GET list without pageId → 400", noPg.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
