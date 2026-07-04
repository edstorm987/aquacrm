// Smoke — R016 Marketplace + template gallery polish.
//
// Asserts the new marketplace surface:
//   - listAllTemplates carries `category` per entry
//   - categoryForTags maps tag families correctly
//   - filterTemplates honours query + category + tag + sort
//   - listInstallCounts / bumpInstallCount round-trip + survive listAll
//   - listFeaturedIds / setFeaturedIds round-trip + 8-id cap + dedupe
//   - listSavedTemplates skips sidecar records (_install-counts/_featured)
//   - HTTP shape (GET /templates with q/category/sort, install-tick,
//     featured GET/POST/400)

import {
  listAllTemplates,
  saveTemplate,
  filterTemplates,
  categoryForTags,
  bumpInstallCount,
  listInstallCounts,
  listFeaturedIds,
  setFeaturedIds,
  listSavedTemplates,
  TEMPLATE_CATEGORIES,
} from "../server/templateMarketplace";
import {
  handleListTemplates,
  handleInstallTick,
  handleGetFeatured,
  handleSetFeatured,
} from "../api/handlers/templates";
import type { PluginStorage } from "../lib/aquaPluginTypes";

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

(async () => {
  // ─── A: TEMPLATE_CATEGORIES + categoryForTags ─────────────────────────
  expect("TEMPLATE_CATEGORIES has 6 families",
    TEMPLATE_CATEGORIES.length === 6);
  expect("categoryForTags maps Aqua Incubator → Incubator",
    categoryForTags(["Aqua Incubator"]) === "Incubator");
  expect("categoryForTags maps Brand Pack → Brand",
    categoryForTags(["Brand Pack"]) === "Brand");
  expect("categoryForTags maps Storefront → Storefront",
    categoryForTags(["Storefront"]) === "Storefront");
  expect("categoryForTags maps Service Portal → Member-area",
    categoryForTags(["Service Portal"]) === "Member-area");
  expect("categoryForTags maps Affiliate Site → Affiliate",
    categoryForTags(["Affiliate Site"]) === "Affiliate");
  expect("categoryForTags falls through to Misc",
    categoryForTags(["Generic page"]) === "Misc");
  expect("Aqua Incubator wins over Brand when both present",
    categoryForTags(["Aqua Incubator", "Brand Pack"]) === "Incubator");

  // ─── B: listAllTemplates carries category + installCount ──────────────
  const storage = memStorage();
  const all = await listAllTemplates(storage, "ag_smoke");
  expect("every template has a category",
    all.every(t => (TEMPLATE_CATEGORIES as readonly string[]).includes(t.category)));
  expect("every template has installCount=0 by default",
    all.every(t => t.installCount === 0));

  // ─── C: filterTemplates ───────────────────────────────────────────────
  const incubator = filterTemplates(all, { category: "Incubator" });
  expect("category filter narrows to Incubator only",
    incubator.length > 0 && incubator.every(t => t.category === "Incubator"));
  const brand = filterTemplates(all, { category: "Brand" });
  expect("Brand category includes brand-page-pack",
    brand.some(t => t.id === "brand-page-pack"));
  const search = filterTemplates(all, { query: "incubator" });
  expect("query='incubator' matches Aqua templates",
    search.length > 0 &&
    search.every(t => `${t.label} ${t.description} ${t.tags.join(" ")}`.toLowerCase().includes("incubator")));
  const tagOnly = filterTemplates(all, { tag: "Composite" });
  expect("tag filter narrows to Composite tag",
    tagOnly.length > 0 && tagOnly.every(t => t.tags.includes("Composite")));

  // ─── D: install counts + sort ─────────────────────────────────────────
  const counts = await listInstallCounts(storage, "ag_smoke");
  expect("listInstallCounts empty by default", Object.keys(counts).length === 0);

  const after1 = await bumpInstallCount(storage, "ag_smoke", "aqua-incubator");
  expect("bumpInstallCount returns 1", after1 === 1);
  await bumpInstallCount(storage, "ag_smoke", "aqua-incubator");
  await bumpInstallCount(storage, "ag_smoke", "brand-page-pack");
  const counts2 = await listInstallCounts(storage, "ag_smoke");
  expect("two ticks aqua-incubator + one brand-page-pack",
    counts2["aqua-incubator"] === 2 && counts2["brand-page-pack"] === 1);

  // listAllTemplates merges counts onto every entry.
  const allWithCounts = await listAllTemplates(storage, "ag_smoke");
  const aquaEntry = allWithCounts.find(t => t.id === "aqua-incubator");
  expect("listAll surfaces installCount on aqua-incubator", aquaEntry?.installCount === 2);

  // most-installed sort
  const sortedByInstalls = filterTemplates(allWithCounts, { sort: "most-installed" });
  expect("most-installed sort puts aqua-incubator first",
    sortedByInstalls[0]!.id === "aqua-incubator");

  // ─── E: featured ──────────────────────────────────────────────────────
  expect("listFeaturedIds empty by default",
    (await listFeaturedIds(storage, "ag_smoke")).length === 0);

  const saved = await setFeaturedIds(storage, "ag_smoke",
    ["aqua-incubator", "aqua-incubator", "brand-page-pack", "  homepage  ", ""]);
  expect("setFeaturedIds dedupes + trims + drops empty",
    saved.length === 3 &&
    saved.includes("aqua-incubator") &&
    saved.includes("brand-page-pack") &&
    saved.includes("homepage"));

  // 8-id cap.
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const capped = await setFeaturedIds(storage, "ag_smoke", ten);
  expect("setFeaturedIds caps at 8", capped.length === 8);

  // ─── F: listSavedTemplates skips sidecar records ──────────────────────
  // Save a real template so the sidecar logic gets tested alongside it.
  await saveTemplate(storage, "ag_smoke", {
    label: "My saved", blocks: [], savedBy: "u_smoke",
  });
  const saved2 = await listSavedTemplates(storage, "ag_smoke");
  expect("listSavedTemplates returns 1 (sidecars _install-counts/_featured filtered)",
    saved2.length === 1 && saved2[0]!.label === "My saved");
  expect("saved template carries a category",
    !!saved2[0]!.category);

  // ─── G: HTTP handlers ─────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: "ag_smoke", clientId: "cl_smoke", actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleListTemplates>[1];

  // GET /templates with category param.
  const listInc = await handleListTemplates(
    new Request("http://x/templates?category=Incubator"), ctx,
  );
  expect("GET /templates?category=Incubator 200", listInc.status === 200);
  const incBody = await listInc.json() as { ok: boolean; templates: { category: string }[]; categories: string[] };
  expect("filtered list every entry is Incubator",
    incBody.templates.every(t => t.category === "Incubator"));
  expect("response includes categories array",
    incBody.categories.length === 6);

  // GET /templates with q.
  const qRes = await handleListTemplates(new Request("http://x/templates?q=incubator"), ctx);
  const qBody = await qRes.json() as { templates: unknown[] };
  expect("GET q=incubator surfaces matches", qBody.templates.length > 0);

  // POST /templates/install-tick
  const tick = await handleInstallTick(
    new Request("http://x/templates/install-tick?id=homepage", { method: "POST" }), ctx,
  );
  expect("install-tick 200 + installCount=1",
    tick.status === 200 &&
    (await tick.json() as { ok: boolean; installCount: number }).installCount === 1);

  const tickNoId = await handleInstallTick(
    new Request("http://x/templates/install-tick", { method: "POST" }), ctx,
  );
  expect("install-tick without id → 400", tickNoId.status === 400);

  // GET /templates/featured (empty).
  const feat0 = await handleGetFeatured(new Request("http://x/templates/featured"), ctx);
  const feat0Body = await feat0.json() as { ok: boolean; featured: string[] };
  expect("GET /templates/featured 200 + empty",
    feat0.status === 200 && feat0Body.featured.length === 0);

  // POST /templates/featured.
  const featSet = await handleSetFeatured(new Request("http://x/templates/featured", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ["aqua-incubator", "brand-page-pack"] }),
  }), ctx);
  expect("POST /templates/featured 200", featSet.status === 200);
  const featBody = await featSet.json() as { featured: string[] };
  expect("featured persisted (2 ids)",
    featBody.featured.length === 2 &&
    featBody.featured.includes("aqua-incubator") &&
    featBody.featured.includes("brand-page-pack"));

  // POST /templates/featured without ids → 400.
  const featBad = await handleSetFeatured(new Request("http://x/templates/featured", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }), ctx);
  expect("POST featured without ids → 400", featBad.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
