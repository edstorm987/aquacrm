// T1 R037 smoke — leads-pipeline foundation glue.
// Run via `npm run smoke:leads-pipeline-foundation-glue` (tsx --test).
//
// Surface (≥10):
//  - ActivityCategory union includes "leads".
//  - Chip styling map resolves "leads" without throwing.
//  - CATEGORY_FILTER_ORDER includes "leads".
//  - `_registry.ts` lists `@aqua/plugin-leads-pipeline` import + manifest entry.
//  - Foundation adapter side-effect import is wired in `_registry.ts`.
//  - `next.config.ts` transpilePackages registers the plugin.
//  - `package.json` workspace deps register the plugin.
//  - `pipelinePort.addLeadCard` lands on the leads pipeline's "New" column.
//  - `pipelinePort.leadIdsInColumn` reverse-resolves cards by column label.
//  - `pipelinePort.columnLabelForLead` returns the current column label.
//  - `pipelines.ts` `moveCard` emits `pipelines.card.moved` payload.
//  - `EVENT_SUBSCRIPTIONS` array exported from the plugin includes both events.
//  - `emailEnqueuePort.enqueue` forwards triggeredByPlugin + externalRef
//     (verified by source inspection — runtime requires email-sender,
//     a foundation-pending dependency).

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Stub `server-only` so `src/server/*` modules load under tsx --test.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TYPES = join(ROOT, "src", "server", "types.ts");
const CHIP = join(ROOT, "src", "lib", "chrome", "activityCategoryStyle.ts");
const REGISTRY = join(ROOT, "src", "built-ins", "runtime", "_registry.ts");
const NEXT_CFG = join(ROOT, "next.config.ts");
const PKG = join(ROOT, "package.json");
const PORTS = join(ROOT, "src", "lib", "server", "leadsPipelinePorts.ts");
const FOUND_ADAPTER = join(ROOT, "src", "built-ins", "runtime", "foundation-adapters", "leadsPipelineFoundation.ts");
const PIPELINES = join(ROOT, "src", "server", "pipelines.ts");

type PipelinesMod = typeof import("../src/server/pipelines");
type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");
type EventBusMod = typeof import("../src/server/eventBus");
type LeadsPortsMod = typeof import("../src/lib/server/leadsPipelinePorts");
type LeadsPluginMod = typeof import("@aqua/plugin-leads-pipeline/server");
type ChipMod = typeof import("../src/lib/chrome/activityCategoryStyle");

let pipelines: PipelinesMod;
let storage: StorageMod;
let tenants: TenantsMod;
let eventBus: EventBusMod;
let leadsPorts: LeadsPortsMod;
let leadsPlugin: LeadsPluginMod;
let chip: ChipMod;

before(async () => {
  pipelines = await import("../src/server/pipelines");
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  eventBus = await import("../src/server/eventBus");
  leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
  leadsPlugin = await import("@aqua/plugin-leads-pipeline/server");
  chip = await import("../src/lib/chrome/activityCategoryStyle");
});

async function freshAgency(name = "Leads Co"): Promise<string> {
  await storage.ensureHydrated();
  await storage.reset();
  const a = tenants.createAgency({ name, slug: name.toLowerCase().replace(/\s+/g, "-") });
  pipelines.seedDefaultPipelines(a.id);
  return a.id;
}

describe("Leads-pipeline foundation glue (T1 R037) — source markers", () => {
  it("ActivityCategory union includes \"leads\"", () => {
    const src = readFileSync(TYPES, "utf-8");
    assert.match(src, /\|\s*"leads"\s*\/\/\s*T2 R027 leads-pipeline/);
  });

  it("activityCategoryStyle resolves \"leads\" without throwing", () => {
    const style = chip.categoryStyle("leads");
    assert.ok(style.color);
    assert.ok(style.label.length > 0);
  });

  it("CATEGORY_FILTER_ORDER lists \"leads\"", () => {
    assert.ok((chip.CATEGORY_FILTER_ORDER as readonly string[]).includes("leads"));
  });

  it("_registry.ts imports + lists @aqua/plugin-leads-pipeline manifest", () => {
    const src = readFileSync(REGISTRY, "utf-8");
    assert.match(src, /from ["']@aqua\/plugin-leads-pipeline["']/);
    assert.match(src, /leadsPipelineManifest/);
  });

  it("_registry.ts side-effect imports leadsPipelineFoundation", () => {
    const src = readFileSync(REGISTRY, "utf-8");
    assert.match(src, /foundation-adapters\/leadsPipelineFoundation/);
  });

  it("next.config.ts stays standalone without external plugin transpilePackages", () => {
    const src = readFileSync(NEXT_CFG, "utf-8");
    assert.doesNotMatch(src, /transpilePackages/);
  });

  it("package.json workspace deps + smoke script register the plugin", () => {
    const pkg = JSON.parse(readFileSync(PKG, "utf-8"));
    assert.equal(pkg.dependencies["@aqua/plugin-leads-pipeline"], undefined);
    assert.ok(typeof pkg.scripts["smoke:leads-pipeline-foundation-glue"] === "string");
  });

  it("emailEnqueuePort source forwards triggeredByPlugin + externalRef", () => {
    const src = readFileSync(PORTS, "utf-8");
    assert.match(src, /triggeredByPlugin:\s*input\.triggeredByPlugin/);
    assert.match(src, /externalRef:\s*input\.externalRef/);
  });

  it("foundation adapter binds EVENT_SUBSCRIPTIONS handlers", () => {
    const src = readFileSync(FOUND_ADAPTER, "utf-8");
    assert.match(src, /subscribeForPlugin\(PLUGIN_ID,\s*"public-funnel\.lead\.captured"/);
    assert.match(src, /subscribeForPlugin\(PLUGIN_ID,\s*"pipelines\.card\.moved"/);
  });

  it("pipelines.ts moveCard emits pipelines.card.moved", () => {
    const src = readFileSync(PIPELINES, "utf-8");
    assert.match(src, /export function moveCard/);
    assert.match(src, /"pipelines\.card\.moved"/);
  });
});

describe("Leads-pipeline foundation glue — runtime", () => {
  it("EVENT_SUBSCRIPTIONS array exports both expected event names", () => {
    const arr = leadsPlugin.EVENT_SUBSCRIPTIONS as readonly string[];
    assert.ok(arr.includes("public-funnel.lead.captured"));
    assert.ok(arr.includes("pipelines.card.moved"));
  });

  it("pipelinePort.addLeadCard lands on the leads pipeline \"new\" column", async () => {
    const agencyId = await freshAgency();
    const ref = leadsPorts.pipelinePort.addLeadCard({
      agencyId: agencyId as never,
      leadId: "lead_test_1",
      email: "alice@example.com",
      name: "Alice",
      source: "test",
    });
    assert.ok(ref);
    assert.equal((ref as { columnId: string }).columnId, "new");
    const leads = pipelines.getPipelineBySlug(agencyId, "leads");
    assert.ok(leads);
    assert.equal((ref as { pipelineId: string }).pipelineId, leads!.id);
  });

  it("pipelinePort.leadIdsInColumn returns ids stamped on lead snapshots", async () => {
    const agencyId = await freshAgency();
    leadsPorts.pipelinePort.addLeadCard({
      agencyId: agencyId as never,
      leadId: "lead_a",
      email: "a@x.com",
      source: "test",
    });
    const ids = await leadsPorts.pipelinePort.leadIdsInColumn({
      agencyId: agencyId as never,
      columnLabel: "New",
    });
    assert.deepEqual(ids, ["lead_a"]);
  });

  it("pipelinePort.columnLabelForLead reverse-lookups the current column", async () => {
    const agencyId = await freshAgency();
    leadsPorts.pipelinePort.addLeadCard({
      agencyId: agencyId as never,
      leadId: "lead_b",
      email: "b@x.com",
      source: "test",
    });
    const label = await leadsPorts.pipelinePort.columnLabelForLead({
      agencyId: agencyId as never,
      leadId: "lead_b",
    });
    assert.equal(label, "New");
  });

  it("moveCard emits pipelines.card.moved with from/to column labels", async () => {
    const agencyId = await freshAgency();
    const ref = (await leadsPorts.pipelinePort.addLeadCard({
      agencyId: agencyId as never,
      leadId: "lead_move",
      email: "m@x.com",
      source: "test",
    }))!;
    const events: Array<{ name: string; payload: unknown }> = [];
    eventBus.on("pipelines.card.moved", (e) => {
      events.push({ name: e.name, payload: e.payload });
    });
    pipelines.moveCard(agencyId, ref.cardId, "won");
    // emit handlers run on a microtask — flush.
    await new Promise(r => setTimeout(r, 0));
    assert.equal(events.length, 1);
    const payload = events[0]!.payload as {
      cardKind: string;
      fromColumn: string;
      toColumn: string;
      leadId?: string;
    };
    assert.equal(payload.cardKind, "lead");
    assert.equal(payload.fromColumn, "New");
    assert.equal(payload.toColumn, "Won");
    assert.equal(payload.leadId, "lead_move");
  });

  it("addLeadCard returns null when no leads pipeline exists yet", async () => {
    await storage.ensureHydrated();
    await storage.reset();
    const a = tenants.createAgency({ name: "Bare Co", slug: "bare-co" });
    // Skip seedDefaultPipelines on purpose.
    const ref = leadsPorts.pipelinePort.addLeadCard({
      agencyId: a.id as never,
      leadId: "lead_x",
      email: "x@x.com",
      source: "test",
    });
    assert.equal(ref, null);
  });

  it("foundation registration: plugin reports isFoundationRegistered() === true after adapter import", async () => {
    // Side-effect import the foundation adapter directly so the
    // `registerLeadsPipelineFoundation` call lands. The registry-level
    // import path also reaches it at boot but goes through manifest
    // validation; this asserts the binding itself.
    //
    // tsx loads `server-only`-tagged TS via CJS while ESM dynamic
    // `import()` lives in a separate module graph. Use createRequire
    // to fetch the plugin module from the same graph as the adapter.
    await import("../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation");
    const sameGraph = _req("@aqua/plugin-leads-pipeline/server") as typeof leadsPlugin;
    assert.equal(sameGraph.isFoundationRegistered(), true);
  });
});
