// Smoke — R028 Reusable block-group components.

import {
  createComponent, listComponents, getComponent, updateComponent, deleteComponent,
  expandComponentRefs, countComponentRefs,
  COMPONENT_CATEGORIES,
} from "../server/components";
import {
  handleListComponents, handleGetComponent, handleCreateComponent,
  handleUpdateComponent, handleDeleteComponent,
} from "../api/handlers/components";
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
const TREE: Block[] = [
  { id: "h1", type: "heading", props: { text: "Hello" } },
  { id: "p1", type: "text", props: { text: "World" } },
];

(async () => {
  expect("COMPONENT_CATEGORIES has 6",
    COMPONENT_CATEGORIES.length === 6 && COMPONENT_CATEGORIES.includes("section"));

  // ─── A: createComponent + list + get ───────────────────────────────────
  const storage = memStorage();
  const r1 = await createComponent(storage, {
    agencyId: a, clientId: c, name: "My header", tree: TREE, createdBy: "u_smoke",
  });
  expect("create returns id starting with cmp_", r1.id.startsWith("cmp_"));
  expect("default category is misc", r1.category === "misc");
  expect("createdAt + updatedAt set",
    typeof r1.createdAt === "number" && r1.createdAt === r1.updatedAt);

  await createComponent(storage, {
    agencyId: a, clientId: c, name: "My footer", tree: TREE, category: "footer", createdBy: "u_smoke",
  });
  const list = await listComponents(storage, a, c);
  expect("list returns 2 newest-first",
    list.length === 2 && list[0]!.name === "My footer");

  const got = await getComponent(storage, a, c, r1.id);
  expect("getComponent returns the same record", got?.id === r1.id);

  // ─── B: updateComponent ────────────────────────────────────────────────
  const upd = await updateComponent(storage, a, c, r1.id, {
    name: "Renamed header", category: "header", description: "Top of page",
  });
  expect("updated name", upd?.name === "Renamed header");
  expect("updated category", upd?.category === "header");
  expect("description added", upd?.description === "Top of page");
  expect("updatedAt advances", (upd?.updatedAt ?? 0) >= r1.updatedAt);

  // Empty description strips the field.
  const stripped = await updateComponent(storage, a, c, r1.id, { description: "  " });
  expect("description stripped on empty input", stripped?.description === undefined);

  expect("update unknown id → null",
    (await updateComponent(storage, a, c, "cmp_nope", { name: "x" })) === null);

  // ─── C: deleteComponent ────────────────────────────────────────────────
  expect("delete hit returns true",
    (await deleteComponent(storage, a, c, r1.id)) === true);
  expect("delete miss returns false",
    (await deleteComponent(storage, a, c, "cmp_nope")) === false);
  const afterDel = await listComponents(storage, a, c);
  expect("list reflects deletion",
    afterDel.length === 1 && afterDel[0]!.name === "My footer");

  // ─── D: expandComponentRefs ────────────────────────────────────────────
  const cmp = await createComponent(storage, {
    agencyId: a, clientId: c, name: "Hero block",
    tree: [
      { id: "h", type: "hero", props: { headline: "Aqua" } },
    ],
    createdBy: "u_smoke",
  });
  const components = { [cmp.id]: cmp };
  const pageTree: Block[] = [
    { id: "page-h", type: "heading", props: { text: "Top" } },
    { id: "ref-1", type: "componentRef", props: { componentId: cmp.id } },
    { id: "page-foot", type: "text", props: { text: "Bottom" } },
  ];
  const expanded = expandComponentRefs(pageTree, components);
  expect("expansion preserves non-ref blocks",
    expanded[0]!.id === "page-h" && expanded[expanded.length - 1]!.id === "page-foot");
  expect("expansion replaces ref with source-tree blocks",
    expanded.some(b => b.type === "hero" && b.id.startsWith("h::")));
  // Original tree untouched.
  expect("original tree unchanged",
    pageTree[1]!.type === "componentRef");

  // Missing componentId surfaces as _missing flag.
  const broken = expandComponentRefs(
    [{ id: "ref", type: "componentRef", props: {} }],
    components,
  );
  expect("missing componentId flagged _missing",
    broken[0]!.props._missing === true);
  // Unknown componentId surfaces _missing + _missingId.
  const unknown = expandComponentRefs(
    [{ id: "ref", type: "componentRef", props: { componentId: "cmp_nope" } }],
    components,
  );
  expect("unknown componentId flagged _missing + _missingId",
    unknown[0]!.props._missing === true && unknown[0]!.props._missingId === "cmp_nope");

  // Same ref appearing twice doesn't collide on id.
  const twice = expandComponentRefs([
    { id: "r1", type: "componentRef", props: { componentId: cmp.id } },
    { id: "r2", type: "componentRef", props: { componentId: cmp.id } },
  ], components);
  expect("two refs to same component get distinct ids",
    twice[0]!.id !== twice[1]!.id);

  // Expansion edits source → propagates on next render.
  const updatedSrc = await updateComponent(storage, a, c, cmp.id, {
    tree: [{ id: "h", type: "hero", props: { headline: "Updated" } }],
  });
  const componentsV2 = { [cmp.id]: updatedSrc! };
  const expandedV2 = expandComponentRefs(pageTree, componentsV2);
  expect("source edit propagates to ref expansion",
    JSON.stringify(expandedV2).includes('"headline":"Updated"'));

  // Cycle guard — component A refs component B refs component A.
  const cmpA = await createComponent(storage, {
    agencyId: a, clientId: c, name: "Cycle A",
    tree: [{ id: "x", type: "componentRef", props: { componentId: "PLACEHOLDER_B" } }],
    createdBy: "u_smoke",
  });
  const cmpB = await createComponent(storage, {
    agencyId: a, clientId: c, name: "Cycle B",
    tree: [{ id: "y", type: "componentRef", props: { componentId: cmpA.id } }],
    createdBy: "u_smoke",
  });
  // Patch A to ref B (now we have a real cycle).
  await updateComponent(storage, a, c, cmpA.id, {
    tree: [{ id: "x", type: "componentRef", props: { componentId: cmpB.id } }],
  });
  const finalA = await getComponent(storage, a, c, cmpA.id);
  const cycComponents = { [cmpA.id]: finalA!, [cmpB.id]: cmpB };
  const cycExpanded = expandComponentRefs(
    [{ id: "host", type: "componentRef", props: { componentId: cmpA.id } }],
    cycComponents,
  );
  // Cycle guard caps depth at 5; doesn't infinite loop.
  expect("cycle guard returns without throwing",
    Array.isArray(cycExpanded));

  // ─── E: countComponentRefs ────────────────────────────────────────────
  const counts = countComponentRefs([
    { id: "a", type: "componentRef", props: { componentId: cmp.id } },
    { id: "b", type: "section", props: {}, children: [
      { id: "c", type: "componentRef", props: { componentId: cmp.id } },
      { id: "d", type: "componentRef", props: { componentId: cmpB.id } },
    ]},
  ]);
  expect("countComponentRefs walks nested children",
    counts[cmp.id] === 2 && counts[cmpB.id] === 1);

  // ─── F: HTTP handlers ─────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleListComponents>[1];

  // POST create.
  const post = await handleCreateComponent(new Request("http://x/components", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Hero", tree: TREE, category: "section" }),
  }), ctx);
  expect("POST 201", post.status === 201);
  const postBody = await post.json() as { component: { id: string; category: string } };
  expect("POST returns id + category",
    typeof postBody.component.id === "string" && postBody.component.category === "section");

  // POST 400 missing name.
  const noName = await handleCreateComponent(new Request("http://x/components", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tree: TREE }),
  }), ctx);
  expect("POST without name → 400", noName.status === 400);

  // POST 400 invalid category.
  const badCat = await handleCreateComponent(new Request("http://x/components", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x", tree: TREE, category: "garbage" }),
  }), ctx);
  expect("POST invalid category → 400", badCat.status === 400);

  // GET list.
  const lst = await handleListComponents(new Request("http://x/components"), ctx);
  expect("GET /components 200", lst.status === 200);
  const lstBody = await lst.json() as { components: unknown[]; categories: string[] };
  expect("GET surfaces 1 + categories[]",
    lstBody.components.length === 1 && lstBody.categories.length === 6);

  // GET get hit/miss.
  const got200 = await handleGetComponent(
    new Request(`http://x/components/get?id=${postBody.component.id}`), ctx,
  );
  expect("GET get 200", got200.status === 200);
  const got404 = await handleGetComponent(
    new Request("http://x/components/get?id=cmp_nope"), ctx,
  );
  expect("GET get unknown → 404", got404.status === 404);

  // PATCH 200 + 404 + 400 invalid category.
  const patch200 = await handleUpdateComponent(
    new Request(`http://x/components?id=${postBody.component.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    }), ctx,
  );
  expect("PATCH 200", patch200.status === 200);

  const patchBadCat = await handleUpdateComponent(
    new Request(`http://x/components?id=${postBody.component.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "garbage" }),
    }), ctx,
  );
  expect("PATCH invalid category → 400", patchBadCat.status === 400);

  // DELETE 200 + 404.
  const del = await handleDeleteComponent(
    new Request(`http://x/components?id=${postBody.component.id}`, { method: "DELETE" }), ctx,
  );
  expect("DELETE 200", del.status === 200);
  const del404 = await handleDeleteComponent(
    new Request("http://x/components?id=cmp_nope", { method: "DELETE" }), ctx,
  );
  expect("DELETE unknown → 404", del404.status === 404);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
