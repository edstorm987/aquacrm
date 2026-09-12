import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");
type InstallsMod = typeof import("../src/server/pluginInstalls");
type PluginStorageMod = typeof import("../src/lib/server/pluginStorage");
type FoundationMod = typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
type ProspectOutreachMod = typeof import("../src/lib/server/telephony/prospectOutreach");

let storage: StorageMod;
let tenants: TenantsMod;
let installs: InstallsMod;
let pluginStorage: PluginStorageMod;
let foundation: FoundationMod;
let prospectOutreach: ProspectOutreachMod;
let sequence = 0;

before(async () => {
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  prospectOutreach = await import("../src/lib/server/telephony/prospectOutreach");
  const shared = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  foundation.registerLeadsPipelineFoundation({
    tenant: shared.tenantPort,
    activity: shared.activityPort,
    events: shared.eventBusPort,
    pluginInstalls: shared.pluginInstallStorePort,
  });
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

function makeWorld(label: string) {
  sequence += 1;
  const actor = `user_${label}_${sequence}`;
  const agency = tenants.createAgency({
    name: `Qualified provider gate ${label} ${sequence}`,
    ownerEmail: `${label}-${sequence}@example.test`,
  });
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: actor,
  });
  const container = foundation.containerFor({
    agencyId: agency.id as never,
    storage: pluginStorage.makePluginStorage(install.id) as never,
  });
  return { actor, agency, container };
}

async function qualify(
  world: ReturnType<typeof makeWorld>,
  label: string,
  linkedLeadId?: string,
) {
  const email = `${label}@example.test`;
  const lead = linkedLeadId
    ? null
    : (await world.container.leads.upsert({ email, source: "manual" }, world.actor as never)).lead;
  const prospect = await world.container.prospects.create({
    company: `Company ${label}`,
    email,
    source: "manual",
  }, world.actor as never);
  const qualified = await world.container.prospects.linkQualifiedLead(
    prospect.id,
    linkedLeadId ?? lead!.id,
    world.actor as never,
  );
  assert.ok(qualified);
  return { email, lead, prospect: qualified! };
}

describe("qualified Prospect provider admission", { concurrency: false }, () => {
  test("an explicit qualified dossier is admitted only while its agency Lead is active", async () => {
    const world = makeWorld("active");
    const active = await qualify(world, "active-qualified");

    assert.equal(await prospectOutreach.assertProspectContactable(
      world.agency.id,
      world.actor,
      { prospectId: active.prospect.id, email: active.email },
    ), active.prospect.id);

    const missing = await qualify(world, "missing-qualified", "lead_that_does_not_exist");
    await assert.rejects(
      prospectOutreach.assertProspectContactable(
        world.agency.id,
        world.actor,
        { prospectId: missing.prospect.id, email: missing.email },
      ),
      /no longer attached to an active Journey lead/i,
    );

    const archived = await qualify(world, "archived-qualified");
    await world.container.leads.archive(archived.lead!.id, world.actor as never);
    await assert.rejects(
      prospectOutreach.assertProspectContactable(
        world.agency.id,
        world.actor,
        { prospectId: archived.prospect.id, email: archived.email },
      ),
      /no longer attached to an active Journey lead/i,
    );

    const converted = await qualify(world, "converted-qualified");
    await world.container.leads.recordConversion(
      converted.lead!.id,
      "client_converted",
      world.actor as never,
    );
    await assert.rejects(
      prospectOutreach.assertProspectContactable(
        world.agency.id,
        world.actor,
        { prospectId: converted.prospect.id, email: converted.email },
      ),
      /no longer attached to an active Journey lead/i,
    );
  });

  test("a Lead in another agency cannot satisfy the qualified dossier link", async () => {
    const owner = makeWorld("owner");
    const foreign = makeWorld("foreign");
    const foreignLead = (await foreign.container.leads.upsert({
      email: "foreign-lead@example.test",
      source: "manual",
    }, foreign.actor as never)).lead;
    const linked = await qualify(owner, "foreign-linked-qualified", foreignLead.id);

    await assert.rejects(
      prospectOutreach.assertProspectContactable(
        owner.agency.id,
        owner.actor,
        { prospectId: linked.prospect.id, email: linked.email },
      ),
      /no longer attached to an active Journey lead/i,
    );
  });

  test("recipient-only Contact telephony ignores historic qualified dossiers", async () => {
    const world = makeWorld("generic");
    const converted = await qualify(world, "historic-qualified");
    await world.container.leads.recordConversion(
      converted.lead!.id,
      "client_historic",
      world.actor as never,
    );

    assert.equal(await prospectOutreach.assertProspectContactable(
      world.agency.id,
      world.actor,
      { email: converted.email },
    ), undefined, "a historic converted dossier blocked a legitimate Contact email");
  });
});
