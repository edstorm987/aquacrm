import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Products = typeof import("../src/server/agencyProducts");
type Milestones = typeof import("../src/server/clientMilestones");
type Delight = typeof import("../src/server/clientDelight");

let storage: Storage;
let tenants: Tenants;
let products: Products;
let milestones: Milestones;
let delight: Delight;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  products = await import("../src/server/agencyProducts");
  milestones = await import("../src/server/clientMilestones");
  delight = await import("../src/server/clientDelight");
});

async function fresh() {
  await storage.ensureHydrated();
  await storage.reset();
  const agency = tenants.createAgency({ name: "Performance Test", slug: "performance-test" });
  const client = tenants.createClient(agency.id, { name: "Ocean Boulevard" });
  return { agency, client };
}

describe("agency products", () => {
  it("seeds the reusable catalogue once and supports custom product lifecycle", async () => {
    const { agency } = await fresh();
    const seeded = products.ensureDefaultAgencyProducts(agency.id);
    assert.equal(seeded.length, 10);
    assert.deepEqual(
      seeded.filter(product => product.category === "Lead magnets").map(product => product.name).sort(),
      ["Business OS", "Digital health check"],
    );
    assert.equal(products.ensureDefaultAgencyProducts(agency.id).length, 10);

    const custom = products.createAgencyProduct(agency.id, {
      name: "Launch photography",
      category: "Creative",
      buyerHeadline: "A launch library ready for every channel.",
      coverImageUrl: "https://example.com/shoot.jpg",
      accentColor: "#B25E45",
      portalRequirement: "required",
      portalHeadline: "Your launch shoot, all together.",
      portalWelcomeNote: "Review the plan, references and delivered gallery here.",
      pricing: "fixed",
      priceCents: 75_000,
      depositPercent: 30,
      taxRatePercent: 20,
      paymentTermsDays: 14,
      billingNotes: "Use the shoot reference on payment.",
      internalInfo: "Confirm the shot list before travel is booked.",
      deliverables: ["Planning", "Shoot", "Edited gallery"],
      contractTitle: "Launch photography agreement",
      contractBody: "The agreed shoot, editing, delivery and payment terms.",
      sopIds: ["sop_shoot"],
      sopCategories: ["Photography"],
    }, "tester");
    assert.equal(products.listAgencyProducts(agency.id).length, 11);
    assert.equal(custom.priceCents, 75_000);
    assert.equal(custom.contractTitle, "Launch photography agreement");
    assert.match(custom.contractBody ?? "", /delivery and payment/);
    assert.equal(custom.depositPercent, 30);
    assert.equal(custom.paymentTermsDays, 14);
    assert.deepEqual(custom.sopIds, ["sop_shoot"]);
    assert.deepEqual(custom.sopCategories, ["Photography"]);
    assert.equal(custom.portalRequirement, "required");
    assert.equal(custom.accentColor, "#B25E45");

    const archived = products.updateAgencyProduct(agency.id, custom.id, { active: false }, "tester");
    assert.equal(archived?.active, false);
    assert.equal(products.listAgencyProducts(agency.id).length, 10);
    assert.equal(products.listAgencyProducts(agency.id, true).length, 11);

    const website = seeded.find(product => product.name === "Website")!;
    const photography = seeded.find(product => product.name === "Photography")!;
    const packageProduct = products.createAgencyProduct(agency.id, {
      kind: "package",
      name: "Launch package",
      includedProductIds: [website.id, photography.id],
      welcomePackItems: ["Welcome letter", "Printed roadmap"],
      portalRequirement: "required",
    }, "tester");
    assert.equal(packageProduct.kind, "package");
    assert.deepEqual(packageProduct.includedProductIds, [website.id, photography.id]);
    assert.equal(packageProduct.welcomePackItems.length, 2);
  });
});

describe("you deserve it", () => {
  it("tracks a client welcome through delivery and records spend", async () => {
    const { agency, client } = await fresh();
    const record = delight.createClientDelight(agency.id, {
      clientId: client.id,
      recipientName: "Ocean Boulevard",
      occasion: "welcome",
      title: "Personalised welcome pack",
      status: "planned",
      budgetCents: 10_000,
    }, "tester");
    assert.equal(delight.listClientDelight(agency.id).length, 1);
    const delivered = delight.updateClientDelight(agency.id, record.id, { status: "delivered", costCents: 8_750 }, "tester");
    assert.equal(delivered?.status, "delivered");
    assert.equal(delivered?.costCents, 8_750);
    assert.equal(delight.deleteClientDelight(agency.id, record.id), true);
  });
});

describe("client milestones", () => {
  it("creates, progresses, completes, and deletes a client-scoped milestone", async () => {
    const { agency, client } = await fresh();
    const milestone = milestones.createClientMilestone(agency.id, client.id, {
      title: "Website approved",
      targetAt: Date.now() + 86_400_000,
    }, "tester");
    assert.equal(milestone.progress, 0);
    assert.equal(milestones.listClientMilestones(agency.id, client.id).length, 1);

    const progressed = milestones.updateClientMilestone(agency.id, client.id, milestone.id, {
      status: "in-progress",
      progress: 80,
    }, "tester");
    assert.equal(progressed?.progress, 80);

    const complete = milestones.updateClientMilestone(agency.id, client.id, milestone.id, {
      status: "complete",
    }, "tester");
    assert.equal(complete?.progress, 100);
    assert.ok(complete?.completedAt);

    assert.equal(milestones.deleteClientMilestone(agency.id, client.id, milestone.id), true);
    assert.equal(milestones.listClientMilestones(agency.id, client.id).length, 0);
  });

  it("refuses cross-agency milestone access", async () => {
    const { agency, client } = await fresh();
    const other = tenants.createAgency({ name: "Other", slug: "other" });
    const milestone = milestones.createClientMilestone(agency.id, client.id, { title: "Launch" }, "tester");
    assert.equal(milestones.updateClientMilestone(other.id, client.id, milestone.id, { progress: 50 }, "tester"), null);
    assert.equal(milestones.deleteClientMilestone(other.id, client.id, milestone.id), false);
  });
});

describe("adaptive product performance", () => {
  it("uses client properties and real delivery records for product-specific views", async () => {
    const [page, workspace] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/performance/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/performance/_PerformanceWorkspace.tsx", import.meta.url), "utf8"),
    ]);

    for (const source of ["metadata.properties", "metadata.telemetryEvents", "metadata.files", "metadata.portalApprovals", "metadata.clientRequests"]) {
      assert.match(page, new RegExp(source.replace(".", "\\.")));
    }
    assert.match(workspace, /Website and server analytics/);
    assert.match(workspace, /Automation health/);
    assert.match(workspace, /Support health/);
    assert.match(workspace, /Google reporting/);
    assert.match(workspace, /function productKind/);
  });

  it("connects product contract templates to the meeting invoice flow", async () => {
    const commercial = await readFile(new URL("../src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx", import.meta.url), "utf8");
    assert.match(commercial, /fetch\(\"\/api\/portal\/products\"\)/);
    assert.match(commercial, /Choose product/);
    assert.match(commercial, /setAgreementTitle\(product\.contractTitle/);
    assert.match(commercial, /setAgreementBody\(product\.contractBody/);
    assert.match(commercial, /product\.depositPercent/);
    assert.match(commercial, /product\.paymentTermsDays/);
  });

  it("keeps initial client creation simple and product configuration available afterwards", async () => {
    const clientCreator = await readFile(new URL("../src/app/portal/agency/_NewClientButton.tsx", import.meta.url), "utf8");
    const createRoute = await readFile(new URL("../src/app/api/portal/fulfillment/clients/route.ts", import.meta.url), "utf8");
    assert.match(clientCreator, /What are we helping with\?/);
    assert.match(clientCreator, /serviceBrief: helpingWith \|\| undefined/);
    assert.match(clientCreator, /Create a client portal now/);
    assert.match(clientCreator, /set up their portal later from the client record/);
    assert.doesNotMatch(clientCreator, /selectedProducts\.map/);
    assert.match(createRoute, /createClientDelight/);
    assert.match(createRoute, /occasion: "welcome"/);
  });
});
