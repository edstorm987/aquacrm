// Settings truthfulness (issue #44) — Leads Pipeline.
//
// `defaultLeadSource` and `newColumnLabel` were declared, saved and shown back
// but read by nothing. They now have real consumers: the CSV lead import takes
// the setting as its source when the import names no override (blank keeps
// the import's own `csv:<filename>` provenance), and fresh captures land in
// the leads-pipeline column whose LABEL matches the setting, falling back to
// "New" when no such column exists. `fromName` is gone: the email sender needs
// a verified name+address identity, so a bare display name could never be
// honoured, and the setting's own help text already deferred to that identity.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

import { UNWIRED_SETTINGS } from "../src/lib/plugins/unwiredSettings";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "leads-pipeline-settings-consumer-test-secret";
process.env.NODE_ENV = "test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let pipelines: typeof import("../src/server/pipelines");
let installs: typeof import("../src/server/pluginInstalls");
let pluginStorage: typeof import("../src/lib/server/pluginStorage");
let ports: typeof import("../src/lib/server/leadsPipelinePorts");
let leadFoundation: typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
let serverIndex: typeof import("../src/built-ins/modules/leads-pipeline/src/server/index");
let handlers: typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");

before(async () => {
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  pipelines = await import("../src/server/pipelines");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  ports = await import("../src/lib/server/leadsPipelinePorts");
  leadFoundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  serverIndex = await import("../src/built-ins/modules/leads-pipeline/src/server/index");
  handlers = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  const foundationPorts = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  leadFoundation.registerLeadsPipelineFoundation({
    tenant: foundationPorts.tenantPort,
    activity: foundationPorts.activityPort,
    events: foundationPorts.eventBusPort,
    pluginInstalls: foundationPorts.pluginInstallStorePort,
    emailEnqueue: ports.emailEnqueuePort,
    pipeline: ports.pipelinePort,
  } as never);
});

beforeEach(async () => {
  await storage.reset();
});

function seededAgency() {
  const agency = tenants.createAgency({ name: "Leads settings" });
  pipelines.seedDefaultPipelines(agency.id);
  const pipeline = pipelines.getPipelineBySlug(agency.id, "leads")!;
  assert.ok(pipeline, "the default leads pipeline must be seeded");
  const updated = pipelines.updatePipeline(agency.id, pipeline.id, {
    columns: [...pipeline.columns, { id: "fresh", label: "Fresh", order: 99 }],
  })!;
  return { agency, pipeline: updated };
}

function ctxFor(agencyId: string, config: Record<string, unknown>) {
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId },
    enabled: true,
    config,
    features: {},
    installedBy: "settings-smoke",
  });
  const scopedStorage = pluginStorage.makePluginStorage(install.id);
  return {
    install,
    storage: scopedStorage,
    ctx: { agencyId, install, storage: scopedStorage, services: {}, actor: "settings-smoke" } as never,
  };
}

describe("Leads Pipeline settings are consumed", () => {
  it("normalises the two retained settings exactly and treats blank as no override", () => {
    assert.deepEqual(serverIndex.readLeadsPipelineSettings({}), { defaultLeadSource: undefined, newColumnLabel: undefined });
    assert.deepEqual(serverIndex.readLeadsPipelineSettings(undefined), { defaultLeadSource: undefined, newColumnLabel: undefined });
    assert.deepEqual(serverIndex.readLeadsPipelineSettings({ defaultLeadSource: "  referral ", newColumnLabel: " Fresh " }), { defaultLeadSource: "referral", newColumnLabel: "Fresh" });
    assert.deepEqual(serverIndex.readLeadsPipelineSettings({ defaultLeadSource: "   ", newColumnLabel: 7 }), { defaultLeadSource: undefined, newColumnLabel: undefined });
    assert.equal(serverIndex.readLeadsPipelineSettings({ defaultLeadSource: "x".repeat(200) }).defaultLeadSource?.length, 120);
  });

  it("places a fresh capture in the column whose label matches the setting, and falls back to New for an unknown label", async () => {
    const { agency, pipeline } = seededAgency();
    const newColumn = pipeline.columns.find(column => column.label === "New")!;
    const base = { agencyId: agency.id, email: "fresh@example.test", source: "manual" };

    const labelled = ports.pipelinePort.addLeadCard({ ...base, leadId: "lead_fresh", columnLabel: "Fresh" })!;
    assert.equal(labelled.columnId, "fresh", "a matching label places the card in that column");
    const unknown = ports.pipelinePort.addLeadCard({ ...base, leadId: "lead_unknown", columnLabel: "Nowhere" })!;
    assert.equal(unknown.columnId, newColumn.id, "an unknown label falls back to New rather than stranding the card");
    const blank = ports.pipelinePort.addLeadCard({ ...base, leadId: "lead_blank", columnLabel: "   " })!;
    assert.equal(blank.columnId, newColumn.id);
    const idWins = ports.pipelinePort.addLeadCard({ ...base, leadId: "lead_id", columnId: newColumn.id, columnLabel: "Fresh" })!;
    assert.equal(idWins.columnId, newColumn.id, "an explicit existing column id still wins over the label");

    // Through the real container: the setting reaches LeadService and the card lands by label.
    const configured = ctxFor(agency.id, { newColumnLabel: "Fresh" });
    const container = leadFoundation.containerFor({
      agencyId: agency.id as never,
      storage: configured.storage as never,
      settings: serverIndex.readLeadsPipelineSettings(configured.install.config),
    });
    const { lead } = await container.leads.upsert({ email: "captured@example.test", name: "Captured", source: "manual", tags: [] } as never, "settings-smoke" as never);
    // The card id is stamped onto the stored lead after the card is created, so
    // re-read the lead rather than trusting the object the upsert returned.
    const stored = (await container.leads.list()).find(item => item.id === lead.id);
    const cards = pipelines.listCards(pipeline.id);
    const card = cards.find(item => item.id === stored?.pipelineCardId);
    assert.ok(card, "the captured lead must have a card");
    assert.equal(card.columnId, "fresh");
  });

  it("applies the default lead source to CSV imports without an override, keeps csv:<filename> when blank, and lets an explicit override win", async () => {
    const csv = "email,name\nalpha@example.test,Alpha\nbeta@example.test,Beta\n";
    // A fresh agency per scenario: importing the same addresses twice into one
    // agency would update the existing leads and keep their first source.
    const importWith = async (config: Record<string, unknown>, body: Record<string, unknown>) => {
      const { agency } = seededAgency();
      const world = ctxFor(agency.id, config);
      const response = await handlers.importCsvHandler(new Request("http://localhost/api/portal/leads-pipeline/leads/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: csv, ...body }),
      }), world.ctx);
      assert.equal(response.status, 200, await response.text());
      const container = leadFoundation.containerFor({ agencyId: agency.id as never, storage: world.storage as never });
      const leads = await container.leads.list();
      return new Set(leads.map(item => item.source));
    };
    assert.deepEqual([...await importWith({ defaultLeadSource: "referral" }, {})], ["referral"], "the setting is the source when no override is given");
    assert.deepEqual([...await importWith({ defaultLeadSource: "referral" }, { defaultSource: "trade show" })], ["trade show"], "an explicit override wins");
    assert.deepEqual([...await importWith({}, { filename: "spring.csv" })], ["csv:spring.csv"], "blank keeps the import's own provenance");
    assert.deepEqual([...await importWith({ defaultLeadSource: "   " }, {})], ["csv:upload"], "a whitespace setting is blank");
  });

  it("removes fromName from the manifest and takes the three fields off the unwired inventory", () => {
    const manifest = readFileSync("src/built-ins/modules/leads-pipeline/index.ts", "utf8");
    assert.doesNotMatch(manifest, /fromName/, "a display-name-only from setting cannot be honoured by the email sender's verified identities");
    assert.match(manifest, /id: "defaultLeadSource",[\s\S]{0,120}?default: "",/);
    assert.match(manifest, /id: "newColumnLabel",[\s\S]{0,120}?default: "New",/);
    for (const fieldId of ["defaultLeadSource", "newColumnLabel", "fromName"]) {
      assert.equal(UNWIRED_SETTINGS.some(entry => entry.pluginId === "leads-pipeline" && entry.fieldId === fieldId), false, `${fieldId} must no longer be listed as unwired`);
    }
    assert.equal(UNWIRED_SETTINGS.length, 10);
    const handlerSource = readFileSync("src/built-ins/modules/leads-pipeline/src/api/handlers.ts", "utf8");
    assert.match(handlerSource, /settings: readLeadsPipelineSettings\(ctx\.install\.config\)/);
    assert.match(handlerSource, /defaultSource: defaultSource\?\.trim\(\) \|\| settingsDefaultSource,/);
    const leads = readFileSync("src/built-ins/modules/leads-pipeline/src/server/leads.ts", "utf8");
    assert.match(leads, /columnLabel: this\.settings\?\.newColumnLabel,/);
    const adapter = readFileSync("src/lib/server/leadsPipelinePorts.ts", "utf8");
    assert.match(adapter, /const labelled = !requested && input\.columnLabel\?\.trim\(\)/);
  });
});
