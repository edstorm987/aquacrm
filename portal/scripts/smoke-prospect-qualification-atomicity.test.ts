import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");
type InstallsMod = typeof import("../src/server/pluginInstalls");
type PluginStorageMod = typeof import("../src/lib/server/pluginStorage");
type FoundationMod = typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
type HandlersMod = typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
type LeadsMod = typeof import("../src/built-ins/modules/leads-pipeline/src/server/leads");

let storage: StorageMod;
let tenants: TenantsMod;
let installs: InstallsMod;
let pluginStorage: PluginStorageMod;
let foundation: FoundationMod;
let handlers: HandlersMod;
let leadsModule: LeadsMod;
let pluginServices: Record<string, unknown>;

before(async () => {
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  handlers = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  leadsModule = await import("../src/built-ins/modules/leads-pipeline/src/server/leads");
  const shared = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
  foundation.registerLeadsPipelineFoundation({
    tenant: shared.tenantPort,
    activity: shared.activityPort,
    events: shared.eventBusPort,
    pluginInstalls: shared.pluginInstallStorePort,
    pipeline: leadsPorts.pipelinePort,
    personIdentity: leadsPorts.personIdentityPort,
  });
  pluginServices = {
    clients: {},
    pluginInstalls: {},
    pluginRuntime: {},
    registry: {},
    phases: {},
    activity: shared.activityPort,
    events: shared.eventBusPort,
    variants: {},
    tenant: shared.tenantPort,
  };
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

let sequence = 0;

function makeWorld() {
  sequence += 1;
  const agency = tenants.createAgency({
    name: `Atomic qualification ${sequence}`,
    ownerEmail: `owner-atomic-${sequence}@example.test`,
  });
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: "qualification-atomicity-smoke",
  });
  const scopedStorage = pluginStorage.makePluginStorage(install.id);
  const container = foundation.containerFor({
    agencyId: agency.id as never,
    storage: scopedStorage as never,
  });
  const ctx = {
    agencyId: agency.id,
    actor: "user_qualifier",
    install,
    storage: scopedStorage,
    services: pluginServices,
  } as never;
  return { agency, container, ctx };
}

function qualificationRequest(id: string): Request {
  return new Request("http://localhost/api/portal/leads-pipeline/prospects/qualify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

async function qualify(id: string, ctx: never): Promise<Response> {
  return handlers.qualifyProspectHandler(qualificationRequest(id), ctx);
}

function stateSnapshot(): string {
  return JSON.stringify(storage.getState());
}

describe("Prospect qualification transaction", { concurrency: false }, () => {
  test("two dossiers racing for one identity yield one qualified Lead and one untouched loser", async () => {
    const world = makeWorld();
    const first = await world.container.prospects.create({
      company: "First dossier",
      name: "First operator name",
      email: "shared-race@example.test",
      source: "networking",
    }, "user_scout" as never);
    const second = await world.container.prospects.create({
      company: "Second dossier",
      name: "Second operator name",
      email: "shared-race@example.test",
      source: "google-maps",
    }, "user_scout" as never);

    const responses = await Promise.all([
      qualify(first.id, world.ctx),
      qualify(second.id, world.ctx),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 422]);

    const prospects = await world.container.prospects.list();
    const qualified = prospects.filter(prospect => prospect.status === "qualified");
    const scouting = prospects.filter(prospect => prospect.status === "scouting");
    const leads = await world.container.leads.list();
    assert.equal(qualified.length, 1);
    assert.equal(scouting.length, 1);
    assert.equal(leads.length, 1);
    assert.equal(qualified[0]?.qualifiedLeadId, leads[0]?.id);
    assert.equal(leads[0]?.prospectAcquisitions?.length, 1);
    assert.equal(leads[0]?.prospectAcquisitions?.[0]?.prospectId, qualified[0]?.id);
  });

  test("a dossier that loses the Lead pointer conflict leaves the complete graph byte-identical", async () => {
    const world = makeWorld();
    const winner = await world.container.prospects.create({
      company: "Canonical company",
      name: "Canonical name",
      email: "shared-conflict@example.test",
      source: "networking",
    }, "user_scout" as never);
    const loser = await world.container.prospects.create({
      company: "Must not overwrite company",
      name: "Must not overwrite name",
      email: "shared-conflict@example.test",
      source: "google-maps",
      researchNotes: "Must not leak into the winner's Lead.",
    }, "user_scout" as never);
    assert.equal((await qualify(winner.id, world.ctx)).status, 200);
    const before = stateSnapshot();

    const response = await qualify(loser.id, world.ctx);
    assert.equal(response.status, 422);
    assert.match(String((await response.json() as { error?: unknown }).error), /already linked/i);
    assert.equal(stateSnapshot(), before,
      "the losing qualification changed a Lead, Person, Prospect pointer, activity row, or metric");
  });

  test("a projection failure rolls back the new Lead, Person, Prospect link, and activity", async () => {
    const world = makeWorld();
    const prospect = await world.container.prospects.create({
      company: "Rollback company",
      name: "Rollback name",
      email: "rollback-projection@example.test",
      source: "networking",
    }, "user_scout" as never);
    const before = stateSnapshot();
    const original = leadsModule.LeadService.prototype.attachProspectAcquisition;
    leadsModule.LeadService.prototype.attachProspectAcquisition = async function forcedFailure() {
      throw new Error("forced_projection_failure");
    } as typeof original;
    try {
      const response = await qualify(prospect.id, world.ctx);
      assert.equal(response.status, 422);
      assert.match(String((await response.json() as { error?: unknown }).error), /forced_projection_failure/);
    } finally {
      leadsModule.LeadService.prototype.attachProspectAcquisition = original;
    }
    assert.equal(stateSnapshot(), before,
      "a failed dossier projection committed part of the acquisition graph");
  });
});
