// Smoke — R006 Portal Template Marketplace.
//
// Pure structural tests against templateMarketplace.ts:
//   - listBuiltinTemplates surfaces all PAGE_TEMPLATES + brand-page-pack
//   - tag inference covers expected groupings
//   - saveTemplate round-trips through in-memory storage
//   - listAllTemplates surfaces saved + builtin together
//   - deleteSavedTemplate removes only the targeted record
// And against handlers/templates.ts (HTTP shape):
//   - GET /templates 200 with templates array
//   - POST /templates 201 with template, missing label → 400
//   - DELETE /templates 200 / 404 unknown id

import {
  listBuiltinTemplates,
  listSavedTemplates,
  listAllTemplates,
  saveTemplate,
  deleteSavedTemplate,
} from "../server/templateMarketplace";
import { handleListTemplates, handleSaveTemplate, handleDeleteTemplate } from "../api/handlers/templates";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { Block } from "../types/block";
import { BRAND_PAGE_PACK_ID } from "../components/pageTemplates";

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

const STUB_TREE: Block[] = [
  { id: "s1", type: "section", props: {}, children: [
    { id: "h1", type: "heading", props: { text: "Hi", level: 1 } },
  ]},
];

(async () => {
  // ─── listBuiltinTemplates ─────────────────────────────────────────────────
  const builtin = listBuiltinTemplates();
  expect("listBuiltinTemplates returns >0", builtin.length > 0, `got ${builtin.length}`);
  expect("includes brand-page-pack composite",
    builtin.some(t => t.id === BRAND_PAGE_PACK_ID && t.tags.includes("Brand Pack")));
  expect("every builtin has at least one tag",
    builtin.every(t => Array.isArray(t.tags) && t.tags.length > 0));
  expect("every builtin marked kind=builtin",
    builtin.every(t => t.kind === "builtin"));
  expect("Aqua Incubator surfaces under tag 'Aqua Incubator'",
    builtin.filter(t => t.tags.includes("Aqua Incubator")).length > 0);

  // ─── saved templates ──────────────────────────────────────────────────────
  const storage = memStorage();
  const empty = await listSavedTemplates(storage, "ag_smoke");
  expect("listSavedTemplates empty before save", empty.length === 0);

  const saved = await saveTemplate(storage, "ag_smoke", {
    label: "Felicia hero variant",
    description: "Custom hero we want to reuse",
    tags: ["Therapist"],
    coverUrl: "https://example.com/cover.jpg",
    blocks: STUB_TREE,
    savedBy: "u_smoke",
  });
  expect("saveTemplate returns kind=saved", saved.kind === "saved");
  expect("saveTemplate id starts with saved-", saved.id.startsWith("saved-"));
  expect("saveTemplate persists blocks",
    Array.isArray(saved.blocks) && saved.blocks!.length === 1);

  const after = await listSavedTemplates(storage, "ag_smoke");
  expect("listSavedTemplates surfaces newly-saved", after.length === 1 && after[0]!.id === saved.id);

  const all = await listAllTemplates(storage, "ag_smoke");
  expect("listAllTemplates merges saved + builtin",
    all.length === builtin.length + 1 && all[0]!.kind === "saved");

  // Cross-agency isolation.
  const otherAgency = await listSavedTemplates(storage, "ag_other");
  expect("saved templates scoped per-agency", otherAgency.length === 0);

  // ─── delete ──────────────────────────────────────────────────────────────
  const removed = await deleteSavedTemplate(storage, "ag_smoke", saved.id);
  expect("deleteSavedTemplate returns true on hit", removed === true);
  const removedMissing = await deleteSavedTemplate(storage, "ag_smoke", "saved-nope-xxx");
  expect("deleteSavedTemplate returns false on miss", removedMissing === false);
  const afterDelete = await listSavedTemplates(storage, "ag_smoke");
  expect("listSavedTemplates empty after delete", afterDelete.length === 0);

  // ─── HTTP handler shape ──────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleListTemplates>[1];

  // GET — empty saved + builtin
  const listRes = await handleListTemplates(new Request("http://x/templates"), ctx);
  expect("GET /templates returns 200", listRes.status === 200);
  const listBody = await listRes.json() as { ok: boolean; templates: { id: string }[] };
  expect("GET /templates ok=true + templates array",
    listBody.ok && Array.isArray(listBody.templates) && listBody.templates.length === builtin.length,
    `got ${listBody.templates?.length}`);

  // POST — happy path
  const postRes = await handleSaveTemplate(new Request("http://x/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      label: "Smoke saved",
      description: "via handler",
      tags: ["Test"],
      blocks: STUB_TREE,
    }),
  }), ctx);
  expect("POST /templates returns 201", postRes.status === 201);
  const postBody = await postRes.json() as { ok: boolean; template?: { id: string; kind: string } };
  expect("POST /templates surfaces saved template",
    postBody.ok === true && postBody.template?.kind === "saved");

  // POST — missing label
  const badRes = await handleSaveTemplate(new Request("http://x/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blocks: STUB_TREE }),
  }), ctx);
  expect("POST /templates without label → 400", badRes.status === 400);

  // POST — missing blocks
  const badBlocks = await handleSaveTemplate(new Request("http://x/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "no blocks" }),
  }), ctx);
  expect("POST /templates without blocks → 400", badBlocks.status === 400);

  // DELETE — happy + miss
  const savedId = postBody.template!.id;
  const delRes = await handleDeleteTemplate(new Request(`http://x/templates?id=${savedId}`, { method: "DELETE" }), ctx);
  expect("DELETE /templates?id=… returns 200", delRes.status === 200);
  const delMiss = await handleDeleteTemplate(new Request(`http://x/templates?id=saved-nope`, { method: "DELETE" }), ctx);
  expect("DELETE /templates unknown id → 404", delMiss.status === 404);
  const delNoId = await handleDeleteTemplate(new Request(`http://x/templates`, { method: "DELETE" }), ctx);
  expect("DELETE /templates without id → 400", delNoId.status === 400);

  // GET filter sanity — search by label substring should narrow.
  // (Filtering itself lives client-side in TemplateGallery.tsx; here
  // we only assert the registry returns enough to filter against.)
  const all2 = await listAllTemplates(ctxStorage, "ag_smoke");
  const brandHits = all2.filter(t => t.tags.includes("Brand Pack"));
  expect("Brand Pack tag narrows to >0 templates", brandHits.length > 0);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
