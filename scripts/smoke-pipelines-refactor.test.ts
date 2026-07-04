// T1 R034 smoke — multi-pipeline kanban refactor.
// Run via `npm run smoke:pipelines-refactor` (tsx --test).
//
// Surface:
//  - Pipeline CRUD (create / read / update / delete + cascade).
//  - Default seed (idempotent fulfilment + leads + sales).
//  - Multi-pipeline reads (sortOrder + per-agency scoping).
//  - Slug uniqueness within an agency (clash → numeric suffix).
//  - Card add — kind enforcement via allowedCardKinds.
//  - Client → fulfilment-card projection (read-only).
//  - Migration runner (idempotent on second run).
//  - PortalState type carries `pipelines` + `pipelineCards` keys.
//  - Source-marker checks: hub page, [slug] view, sidebar nav,
//    bootstrap wire-up, default column packs.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Stub the `server-only` module so domain modules can be loaded under
// tsx --test (which has no Next.js RSC tagging). Must run BEFORE any
// import of `src/server/*` — we use dynamic imports inside `before()`
// so static-import hoisting doesn't bite us.
const _req = createRequire(import.meta.url);
const _serverOnlyPath = _req.resolve("server-only");
_req.cache[_serverOnlyPath] = {
  id: _serverOnlyPath,
  filename: _serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

type PipelinesMod = typeof import("../src/server/pipelines");
type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");

let pipelines: PipelinesMod;
let storage: StorageMod;
let tenants: TenantsMod;

before(async () => {
  pipelines = await import("../src/server/pipelines");
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TYPES = join(ROOT, "src", "server", "types.ts");
const STORAGE = join(ROOT, "src", "server", "storage.ts");
const BOOTSTRAP = join(ROOT, "src", "server", "agencyBootstrap.ts");
const HUB_PAGE = join(ROOT, "src", "app", "portal", "agency", "page.tsx");
const PIPELINE_VIEW = join(ROOT, "src", "app", "portal", "agency", "pipelines", "[slug]", "page.tsx");
const NAV = join(ROOT, "src", "components", "chrome", "AgencyToolsBallpark.tsx");

async function freshAgency(name = "Smoke Co"): Promise<string> {
  await storage.ensureHydrated();
  await storage.reset();
  const a = tenants.createAgency({ name, slug: name.toLowerCase().replace(/\s+/g, "-") });
  return a.id;
}

describe("Pipelines — domain model (T1 R034)", () => {
  it("PortalState carries pipelines + pipelineCards keys", () => {
    const src = readFileSync(TYPES, "utf-8");
    assert.ok(src.includes("pipelines: Record<string, Pipeline>"));
    assert.ok(src.includes("pipelineCards: Record<string, PipelineCard>"));
    assert.ok(src.includes("export type PipelineKind"));
    assert.ok(src.includes('"fulfilment"'));
    assert.ok(src.includes('"leads"'));
    assert.ok(src.includes('"sales"'));
  });

  it("storage.ts seeds + parses pipelines + pipelineCards", () => {
    const src = readFileSync(STORAGE, "utf-8");
    assert.match(src, /pipelines:\s*\{\}/);
    assert.match(src, /pipelineCards:\s*\{\}/);
    assert.match(src, /pipelines:\s*parsed\.pipelines\s*\?\?\s*\{\}/);
  });

  it("createPipeline + getPipeline round-trip, scoped to agency", async () => {
    const agencyId = await freshAgency();
    const p = pipelines.createPipeline({
      agencyId,
      kind: "custom",
      name: "Onboarding Q",
      columns: [{ id: "a", label: "A", order: 0 }],
    });
    const got = pipelines.getPipeline(p.id);
    assert.ok(got);
    assert.equal(got!.agencyId, agencyId);
    assert.equal(got!.slug, "onboarding-q");
    assert.equal(got!.kind, "custom");
    assert.equal(got!.columns.length, 1);
  });

  it("getPipelineBySlug returns null for cross-agency reads", async () => {
    const agencyA = await freshAgency("A Co");
    const agencyB = tenants.createAgency({ name: "B Co", slug: "b-co" }).id;
    pipelines.createPipeline({ agencyId: agencyA, kind: "custom", name: "Mine", slug: "shared" });
    const fromB = pipelines.getPipelineBySlug(agencyB, "shared");
    assert.equal(fromB, null);
  });

  it("listPipelines is sorted by sortOrder + scoped to agency", async () => {
    const agencyId = await freshAgency();
    pipelines.createPipeline({ agencyId, kind: "custom", name: "Z", sortOrder: 5 });
    pipelines.createPipeline({ agencyId, kind: "custom", name: "A", sortOrder: 1 });
    const list = pipelines.listPipelines(agencyId);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.name, "A");
    assert.equal(list[1]!.name, "Z");
  });

  it("slug clashes resolved with numeric suffix within agency", async () => {
    const agencyId = await freshAgency();
    const p1 = pipelines.createPipeline({ agencyId, kind: "custom", name: "Beta" });
    const p2 = pipelines.createPipeline({ agencyId, kind: "custom", name: "Beta" });
    const p3 = pipelines.createPipeline({ agencyId, kind: "custom", name: "Beta" });
    assert.equal(p1.slug, "beta");
    assert.equal(p2.slug, "beta-2");
    assert.equal(p3.slug, "beta-3");
  });

  it("updatePipeline patches name + slug + columns; refuses cross-agency", async () => {
    const agencyA = await freshAgency("A Co");
    const agencyB = tenants.createAgency({ name: "B Co", slug: "b-co" }).id;
    const p = pipelines.createPipeline({ agencyId: agencyA, kind: "custom", name: "Renamed me" });
    const updated = pipelines.updatePipeline(agencyA, p.id, { name: "New", slug: "new" });
    assert.ok(updated);
    assert.equal(updated!.name, "New");
    assert.equal(updated!.slug, "new");
    const refused = pipelines.updatePipeline(agencyB, p.id, { name: "Hax" });
    assert.equal(refused, null);
  });

  it("deletePipeline cascades pipelineCards rows", async () => {
    const agencyId = await freshAgency();
    const seed = pipelines.seedDefaultPipelines(agencyId);
    const leads = seed.created.find(p => p.kind === "leads")!;
    pipelines.addCard(agencyId, leads.id, { kind: "lead", lead: { email: "a@b.c" }, columnId: "new" });
    pipelines.addCard(agencyId, leads.id, { kind: "lead", lead: { email: "x@y.z" }, columnId: "new" });
    assert.equal(pipelines.listCards(leads.id).length, 2);
    const ok = pipelines.deletePipeline(agencyId, leads.id);
    assert.equal(ok, true);
    assert.equal(pipelines.getPipeline(leads.id), null);
    assert.equal(pipelines.listCards(leads.id).length, 0);
  });
});

describe("Pipelines — default seed (idempotent)", () => {
  it("seedDefaultPipelines creates fulfilment + leads + sales", async () => {
    const agencyId = await freshAgency();
    const result = pipelines.seedDefaultPipelines(agencyId);
    assert.equal(result.created.length, 3);
    assert.equal(result.existing.length, 0);
    const list = pipelines.listPipelines(agencyId);
    assert.deepEqual(list.map(p => p.kind), ["fulfilment", "leads", "sales"]);
    const fulfilment = list[0]!;
    assert.deepEqual(fulfilment.columns.map(c => c.id), ["discovery", "design", "onboarding", "live", "churned"]);
    assert.deepEqual(fulfilment.allowedCardKinds, ["client"]);
  });

  it("seedDefaultPipelines is idempotent — second call adds none", async () => {
    const agencyId = await freshAgency();
    pipelines.seedDefaultPipelines(agencyId);
    const second = pipelines.seedDefaultPipelines(agencyId);
    assert.equal(second.created.length, 0);
    assert.equal(second.existing.length, 3);
    assert.equal(pipelines.listPipelines(agencyId).length, 3);
  });

  it("FULFILMENT_STAGE_TO_COLUMN covers every ClientStage", () => {
    // Just spot-check the canonical Aqua + legacy stages map to a valid column id.
    const validColumns = new Set(["discovery", "design", "onboarding", "live", "churned"]);
    for (const stage of [
      "lead", "discovery", "design", "development", "onboarding", "live", "churned",
      "aqua-epic-intro", "aqua-blueprint", "aqua-diagnostics",
      "aqua-brand-builder", "aqua-traffic", "aqua-mastery",
    ]) {
      const col = pipelines.FULFILMENT_STAGE_TO_COLUMN[stage];
      assert.ok(col && validColumns.has(col), `stage ${stage} → ${col}`);
    }
  });
});

describe("Pipelines — cards + projection + migration", () => {
  it("addCard rejects kinds not in allowedCardKinds", async () => {
    const agencyId = await freshAgency();
    const seed = pipelines.seedDefaultPipelines(agencyId);
    const fulfilment = seed.created.find(p => p.kind === "fulfilment")!;
    // fulfilment only allows "client" kind
    const bad = pipelines.addCard(agencyId, fulfilment.id, {
      kind: "lead",
      lead: { email: "x@y.z" },
      columnId: "discovery",
    });
    assert.equal(bad, null);
    assert.equal(pipelines.pipelineAllowsKind(fulfilment, "lead"), false);
    assert.equal(pipelines.pipelineAllowsKind(fulfilment, "client"), true);
  });

  it("projectClientsToFulfilmentCards maps client.stage → column", async () => {
    const agencyId = await freshAgency();
    pipelines.seedDefaultPipelines(agencyId);
    tenants.createClient(agencyId, { name: "Felicia", stage: "live" });
    tenants.createClient(agencyId, { name: "Maya", stage: "discovery" });
    const projections = pipelines.projectClientsToFulfilmentCards(agencyId);
    assert.equal(projections.length, 2);
    const liveProj = projections.find(p => p.client.name === "Felicia");
    const discProj = projections.find(p => p.client.name === "Maya");
    assert.equal(liveProj!.columnId, "live");
    assert.equal(discProj!.columnId, "discovery");
  });

  it("migrateClientsToFulfilment creates one card per client + idempotent on re-run", async () => {
    const agencyId = await freshAgency();
    pipelines.seedDefaultPipelines(agencyId);
    tenants.createClient(agencyId, { name: "C1", stage: "discovery" });
    tenants.createClient(agencyId, { name: "C2", stage: "live" });
    const first = pipelines.migrateClientsToFulfilment(agencyId);
    assert.equal(first.created, 2);
    assert.equal(first.alreadyPresent, 0);
    const second = pipelines.migrateClientsToFulfilment(agencyId);
    assert.equal(second.created, 0);
    assert.equal(second.alreadyPresent, 2);
    // Total cards still 2 — no duplicates.
    assert.equal(pipelines.listCardsByAgency(agencyId).length, 2);
  });

  it("pipelineCardCounts surfaces fulfilment via client count when no cards yet", async () => {
    const agencyId = await freshAgency();
    pipelines.seedDefaultPipelines(agencyId);
    tenants.createClient(agencyId, { name: "C1" });
    tenants.createClient(agencyId, { name: "C2" });
    tenants.createClient(agencyId, { name: "C3" });
    const counts = pipelines.pipelineCardCounts(agencyId);
    const fulfilment = pipelines.listPipelines(agencyId).find(p => p.kind === "fulfilment")!;
    assert.equal(counts[fulfilment.id], 3);
  });
});

describe("Pipelines — wiring (source markers)", () => {
  it("agencyBootstrap.ts seeds pipelines + runs client migration", () => {
    const src = readFileSync(BOOTSTRAP, "utf-8");
    assert.match(src, /seedDefaultPipelines/);
    assert.match(src, /migrateClientsToFulfilment/);
  });

  it("/portal/agency hub renders pipelines grid (data-testid)", () => {
    const src = readFileSync(HUB_PAGE, "utf-8");
    assert.match(src, /data-testid="agency-pipelines-hub"/);
    assert.match(src, /data-testid="pipelines-grid"/);
    assert.match(src, /\/portal\/agency\/pipelines\//);
    assert.match(src, /seedDefaultPipelines/);
    // No more single Clients grid as the primary section.
    assert.doesNotMatch(src, /lastByClient/);
  });

  it("/portal/agency/pipelines/[slug] renders columns + switcher", () => {
    const src = readFileSync(PIPELINE_VIEW, "utf-8");
    assert.match(src, /data-testid="pipeline-view"/);
    assert.match(src, /data-testid="pipeline-switcher"/);
    assert.match(src, /data-testid="pipeline-columns"/);
    assert.match(src, /getPipelineBySlug/);
    assert.match(src, /projectClientsToFulfilmentCards/);
    assert.match(src, /notFound\(\)/);
  });

  it("sidebar nav points Pipelines at /portal/agency/pipelines/fulfilment", () => {
    const src = readFileSync(NAV, "utf-8");
    assert.match(src, /\/portal\/agency\/pipelines\/fulfilment/);
    assert.doesNotMatch(src, /\/portal\/agency#clients/);
  });
});
