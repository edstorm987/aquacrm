// "The agency for everyone" — what a new agency inherits, and what never crosses.
//
// Ed, 2026-08-27: "the original product will be the agency for everyone, with
// all products services, and we can choose to develop etc."
//
// One agency is the origin; new agencies are seeded from its catalogue. Whether
// the origin ends up being a real agency Ed operates or a system-owned artefact
// is still open — and does not change the dangerous part, which is the tenant
// boundary. That is what this file guards.
//
// The failure this exists to prevent is not "the copy was incomplete". It is a
// client record, a person, or an API key appearing inside somebody else's
// tenant, and nobody noticing because the code silently copied a collection
// that was added months later.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

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

type OriginModule = typeof import("../src/server/agencyOriginTemplate");
type Storage = typeof import("../src/server/storage");

let origin: OriginModule;
let storage: Storage;
let tenants: typeof import("../src/server/tenants");
let users: typeof import("../src/server/users");
let products: typeof import("../src/server/agencyProducts");
let designs: typeof import("../src/server/clientPortalDesigns");

before(async () => {
  [origin, storage, tenants, users, products, designs] = await Promise.all([
    import("../src/server/agencyOriginTemplate"),
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/server/agencyProducts"),
    import("../src/server/clientPortalDesigns"),
  ]);
});

async function fixture() {
  await storage.reset();
  const originAgency = tenants.createAgency({ name: "Milesymedia", slug: `origin-${Date.now()}` });
  const target = tenants.createAgency({ name: "A brand new agency", slug: `target-${Date.now()}` });

  const owner = users.createUser({
    email: `owner-${originAgency.id}@origin.test`,
    name: "Ed",
    role: "agency-owner",
    agencyId: originAgency.id,
    password: "origin-owner-password",
  });
  // The origin is a working agency: it has real clients and real people, and
  // NONE of that may cross.
  const client = tenants.createClient(originAgency.id, { name: "Bright Coffee" });
  users.createUser({
    email: `owner-${originAgency.id}@bright.test`,
    name: "Bright Owner",
    role: "client-owner",
    agencyId: originAgency.id,
    clientId: client.id,
    password: "bright-owner-password",
  });

  products.ensureDefaultAgencyProducts(originAgency.id);
  const catalogue = products.listAgencyProducts(originAgency.id, true);
  designs.ensureProductPortalTemplates(originAgency.id, catalogue, owner.id);
  designs.ensureClientPortalInstance({
    agencyId: originAgency.id,
    clientId: client.id,
    actorUserId: owner.id,
  });
  await storage.flushPendingWrites();

  return { originAgency, target, owner, client, catalogue };
}

let home: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => { home = await fixture(); });

describe("nothing is contributed unless it is named", () => {
  it("classifies every single state collection — a new one fails loudly", () => {
    // The guarantee: `PortalState` grows, and an unclassified collection is a
    // build failure rather than a silent exclusion (or worse, inclusion).
    assert.doesNotThrow(() => origin.assertOriginClassificationIsComplete(storage.getState()));
  });

  it("proves the check is real by hiding a collection from the classification", () => {
    const pretendNewCollection = { ...storage.getState(), somethingAddedNextMonth: {} } as never;
    assert.throws(
      () => origin.assertOriginClassificationIsComplete(pretendNewCollection),
      /somethingAddedNextMonth/,
    );
  });

  it("names people, secrets, live work and tenancy as never-contributed", () => {
    const never = new Set(Object.values(origin.ORIGIN_NEVER_CONTRIBUTES).flat());
    for (const collection of [
      "clients", "endCustomers", "users", "persons",           // people
      "integrationConnections", "externalAssistantApiKeys",     // secrets
      "agencyMasterTagKeys", "editorAiConfigs",                 // more secrets
      "activity", "pipelines", "tasks", "clientPortalInstances", // live work
      "agencies", "accessGrants", "devProjects",                // tenancy
    ]) {
      assert.ok(never.has(collection as never), `${collection} must be explicitly never-contributed`);
    }
  });
});

describe("what a new agency actually receives", () => {
  it("brings the services across, re-tenanted with new ids", () => {
    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
    });

    assert.ok(projection.products.length > 0, "the catalogue came across");
    for (const product of projection.products) {
      assert.equal(product.agencyId, home.target.id, "every product belongs to the new agency");
      assert.ok(
        !Object.keys(storage.getState().agencyProducts).includes(product.id),
        "and carries a NEW id, not the origin's",
      );
    }
    assert.match(
      origin.describeAgencyOriginProjection(projection),
      /\d+ services?, \d+ portal templates?, \d+ contract templates?, \d+ task templates?/,
    );
  });

  it("brings the portal templates and keeps them pointed at the copied products", () => {
    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
    });
    const newProductIds = new Set(projection.products.map(product => product.id));

    assert.ok(projection.portalTemplates.length > 0);
    for (const template of projection.portalTemplates) {
      assert.equal(template.agencyId, home.target.id);
      if (template.productId) {
        assert.ok(
          newProductIds.has(template.productId),
          "a template points at the COPIED product, never the origin's",
        );
      }
    }
  });

  it("is idempotent — seeding the same origin twice yields the same ids", () => {
    const first = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id, now: 1,
    });
    const second = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id, now: 1,
    });
    assert.deepEqual(
      first.products.map(product => product.id),
      second.products.map(product => product.id),
      "a re-seed must not duplicate the catalogue",
    );
  });

  it("writes nothing — projecting is a review, not a seed", () => {
    const before = JSON.stringify(storage.getState());
    origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
    });
    assert.equal(JSON.stringify(storage.getState()), before);
  });

  it("refuses to seed an agency from itself", () => {
    assert.throws(
      () => origin.projectAgencyOrigin({
        originAgencyId: home.originAgency.id,
        targetAgencyId: home.originAgency.id,
      }),
      /cannot be seeded from itself/,
    );
  });
});

describe("the tenant boundary holds", () => {
  it("carries NO trace of the origin's clients, people or ids", () => {
    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
    });
    const payload = JSON.stringify(projection);

    // The origin genuinely has a client and its people; none may appear.
    assert.ok(!payload.includes(home.client.id), "no client id");
    assert.ok(!payload.includes("Bright Coffee"), "no client name");
    assert.ok(!payload.includes(home.owner.id), "no user id");
    assert.ok(!payload.includes("@bright.test"), "no client email");
    // …nor the origin tenant's own id, which would re-tenant a record back.
    assert.ok(
      !projection.products.some(product => product.agencyId === home.originAgency.id),
      "no product left pointing at the origin agency",
    );
  });

  it("DROPS references to things it does not carry, rather than leaving them dangling", () => {
    // Give an origin product a trading-company binding and an SOP, neither of
    // which is contributed.
    storage.mutate(state => {
      const first = Object.values(state.agencyProducts).find(product => product.agencyId === home.originAgency.id);
      if (first) {
        state.agencyProducts[first.id] = {
          ...first,
          companyIds: ["company_from_the_origin_tenant"],
          sopIds: ["sop_from_the_origin_tenant"],
        };
      }
    });

    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
    });
    const payload = JSON.stringify(projection.products);

    assert.ok(!payload.includes("company_from_the_origin_tenant"), "a foreign company id must not survive");
    assert.ok(!payload.includes("sop_from_the_origin_tenant"), "nor a foreign SOP id");
    // …and the drop is REPORTED, so a review screen can say what was lost.
    const fields = projection.droppedReferences.map(dropped => dropped.field);
    assert.ok(fields.includes("companyIds"));
    assert.ok(fields.includes("sopIds"));
    assert.match(
      origin.describeAgencyOriginProjection(projection),
      /references? dropped as tenant-specific/,
    );
  });

  it("keeps a package's links only to products that genuinely came across", () => {
    storage.mutate(state => {
      const [first] = Object.values(state.agencyProducts).filter(product => product.agencyId === home.originAgency.id);
      if (first) {
        state.agencyProducts[first.id] = {
          ...first,
          includedProductIds: [...first.includedProductIds, "prod_that_does_not_exist"],
        };
      }
    });

    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
    });
    const newIds = new Set(projection.products.map(product => product.id));
    for (const product of projection.products) {
      for (const included of product.includedProductIds) {
        assert.ok(newIds.has(included), `${included} must be a product that came across`);
      }
    }
  });
});

describe("Ed's classification decisions, 2026-08-27", () => {
  it("transfers the catalogue, its portal designs, and contract + task templates", () => {
    assert.deepEqual(
      [...origin.ORIGIN_CONTRIBUTES],
      ["agencyProducts", "clientPortalTemplates", "contractTemplates", "taskTemplates"],
    );
  });

  it("does NOT transfer phases or written material — his words, pinned", () => {
    // "no phases sops individually written ones wont transfer"
    const written = origin.ORIGIN_NEVER_CONTRIBUTES["written-material-and-lifecycle"];
    for (const collection of ["phases", "sops", "sopGuides", "legalDocuments"]) {
      assert.ok(written.includes(collection as never), `${collection} must not transfer`);
    }
  });

  it("names an origin agency by configuration, so a synthetic origin can come later", () => {
    const previous = process.env[origin.ORIGIN_AGENCY_ENV];
    try {
      delete process.env[origin.ORIGIN_AGENCY_ENV];
      assert.equal(origin.getOriginAgencyId(), null, "no origin is configured by default");
      process.env[origin.ORIGIN_AGENCY_ENV] = "milesymedia";
      assert.equal(origin.getOriginAgencyId(), "milesymedia");
    } finally {
      if (previous === undefined) delete process.env[origin.ORIGIN_AGENCY_ENV];
      else process.env[origin.ORIGIN_AGENCY_ENV] = previous;
    }
  });
});

describe("contract templates: the template, never the client's agreement", () => {
  function seedContractTemplates(agencyId: string) {
    storage.mutate(state => {
      state.contractTemplates.generic = {
        id: "generic", agencyId, title: "Website build agreement",
        body: "This agreement is between Milesymedia and the client…",
        status: "active", createdBy: "usr_origin_person", createdAt: 1, updatedAt: 1,
      } as never;
      state.contractTemplates.fromRealClient = {
        id: "fromRealClient", agencyId, title: "Bright Coffee agreement",
        body: "Signed terms with Bright Coffee…",
        sourceContractId: "contract_of_a_real_client",
        creationOperationId: "op_from_the_origin",
        status: "active", createdBy: "usr_origin_person", createdAt: 1, updatedAt: 1,
      } as never;
    });
  }

  it("refuses one derived from a real client contract, and says why", () => {
    seedContractTemplates(home.originAgency.id);
    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
      actorUserId: "usr_new_owner",
    });

    const titles = projection.contractTemplates.map(template => template.title);
    assert.ok(titles.includes("Website build agreement"), "a real template transfers");
    assert.ok(!titles.includes("Bright Coffee agreement"), "a client's agreement does not");
    assert.ok(
      projection.droppedReferences.some(dropped => dropped.field === "sourceContractId"),
      "and the refusal is reported rather than silent",
    );
    const payload = JSON.stringify(projection.contractTemplates);
    assert.ok(!payload.includes("contract_of_a_real_client"));
    assert.ok(!payload.includes("op_from_the_origin"), "an operation key belongs to the origin's history");
    assert.ok(!payload.includes("usr_origin_person"), "and its author is a person in another tenant");
  });

  it("flags the transferred ones as carrying the origin's wording, rather than pretending to strip it", () => {
    seedContractTemplates(home.originAgency.id);
    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });

    assert.equal(projection.needsRebrand.length, 1);
    assert.equal(projection.needsRebrand[0]?.title, "Website build agreement");
    assert.match(projection.needsRebrand[0]!.reason, /wording and terms/);
    assert.match(
      origin.describeAgencyOriginProjection(projection),
      /carries the origin's wording and needs rebranding/,
    );
  });
});

describe("task templates: the shape, without the origin's links", () => {
  it("drops an SOP step reference, because SOPs do not transfer", () => {
    storage.mutate(state => {
      state.taskTemplates.onboarding = {
        id: "onboarding", agencyId: home.originAgency.id, name: "Onboarding",
        taskTitle: "Onboard {subject}",
        steps: [
          { label: "Read the SOP", sopId: "sop_written_by_ed" },
          { label: "Say hello" },
        ],
        createdBy: "usr_origin_person", createdAt: 1, updatedAt: 1,
      } as never;
    });

    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });
    const payload = JSON.stringify(projection.taskTemplates);

    assert.equal(projection.taskTemplates.length, 1, "the template itself transfers");
    assert.ok(!payload.includes("sop_written_by_ed"), "but not the SOP it pointed at");
    assert.ok(
      projection.droppedReferences.some(dropped => dropped.field === "steps[].sopId"),
      "and the drop is reported",
    );
  });

  it("drops a step link that carries an identifier from the origin tenant", () => {
    storage.mutate(state => {
      state.taskTemplates.linked = {
        id: "linked", agencyId: home.originAgency.id, name: "Kickoff",
        taskTitle: "Kick off {subject}",
        steps: [
          { label: "Open their workspace", href: `/portal/clients/${home.client.id}?tab=overview` },
          { label: "Read the guide", href: "/portal/agency/fulfilment?view=portals" },
        ],
        createdBy: "usr_origin_person", createdAt: 1, updatedAt: 1,
      } as never;
    });

    const projection = origin.projectAgencyOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });
    const steps = projection.taskTemplates[0]!.steps;

    assert.equal(steps[0]?.href, undefined, "a link naming a client id must not cross");
    assert.equal(steps[0]?.label, "Open their workspace", "…though the step itself survives");
    assert.equal(steps[1]?.href, "/portal/agency/fulfilment?view=portals", "a generic link is fine");
    assert.ok(!JSON.stringify(projection).includes(home.client.id));
  });
});

describe("seeding a new agency — and never clobbering it", () => {
  it("creates the catalogue in the target and leaves the origin alone", () => {
    const originBefore = JSON.stringify(
      Object.values(storage.getState().agencyProducts).filter(p => p.agencyId === home.originAgency.id),
    );

    const result = origin.seedAgencyFromOrigin({
      originAgencyId: home.originAgency.id,
      targetAgencyId: home.target.id,
      actorUserId: "usr_new_owner",
    });

    assert.ok(result.created.agencyProducts > 0, "services arrived");
    assert.ok(result.created.clientPortalTemplates > 0, "so did their portal designs");

    const state = storage.getState();
    const targetProducts = Object.values(state.agencyProducts).filter(p => p.agencyId === home.target.id);
    assert.equal(targetProducts.length, result.created.agencyProducts);

    assert.equal(
      JSON.stringify(Object.values(state.agencyProducts).filter(p => p.agencyId === home.originAgency.id)),
      originBefore,
      "the origin's own catalogue is untouched by seeding someone else",
    );
    assert.match(origin.describeAgencySeed(result), /Added \d+ records?/);
  });

  it("is idempotent — a second seed adds nothing and skips what is already there", () => {
    origin.seedAgencyFromOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });
    const second = origin.seedAgencyFromOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });

    assert.equal(Object.values(second.created).reduce((a, b) => a + b, 0), 0, "nothing duplicated");
    assert.ok(Object.values(second.skipped).reduce((a, b) => a + b, 0) > 0, "everything recognised as present");
    assert.match(origin.describeAgencySeed(second), /Everything was already here/);
  });

  it("NEVER overwrites a record the new agency has since edited", () => {
    origin.seedAgencyFromOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });
    // The new agency renames a seeded service — their own work now.
    const seededId = Object.values(storage.getState().agencyProducts)
      .find(product => product.agencyId === home.target.id)!.id;
    storage.mutate(state => {
      state.agencyProducts[seededId] = { ...state.agencyProducts[seededId]!, name: "Our own name for it" };
    });

    // Ed adds something to the origin and re-seeds.
    storage.mutate(state => {
      state.agencyProducts.brandNew = {
        ...Object.values(state.agencyProducts).find(p => p.agencyId === home.originAgency.id)!,
        id: "brandNew", name: "A new service", includedProductIds: [], sopIds: [],
      } as never;
    });
    const again = origin.seedAgencyFromOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });

    assert.equal(again.created.agencyProducts, 1, "only the genuinely new service arrives");
    assert.equal(
      storage.getState().agencyProducts[seededId]?.name,
      "Our own name for it",
      "their rename survived — a seed is not a forced upgrade",
    );
  });

  it("refuses to seed an agency that does not exist", () => {
    assert.throws(
      () => origin.seedAgencyFromOrigin({
        originAgencyId: home.originAgency.id, targetAgencyId: "agency_that_never_existed",
      }),
      /does not exist/,
    );
  });

  it("carries the rebrand list through to the result, so the screen can say so", () => {
    storage.mutate(state => {
      state.contractTemplates.generic = {
        id: "generic", agencyId: home.originAgency.id, title: "Website build agreement",
        body: "This agreement is between Milesymedia and the client…",
        status: "active", createdBy: "usr_origin_person", createdAt: 1, updatedAt: 1,
      } as never;
    });

    const result = origin.seedAgencyFromOrigin({
      originAgencyId: home.originAgency.id, targetAgencyId: home.target.id,
    });
    assert.equal(result.created.contractTemplates, 1);
    assert.equal(result.needsRebrand.length, 1);
    assert.match(origin.describeAgencySeed(result), /needs rebranding/);
  });
});
