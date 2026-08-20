import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

const require = createRequire(import.meta.url);

before(() => {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as NodeJS.Module;
});

describe("client delivery package", () => {
  it("turns the agreed sale into a ready portal and planned development work", async () => {
    const { clientDeliveryPackageMetadata } = await import("../src/lib/server/clients/customerPortalProvisioning");
    const existingProperty = {
      id: "prop_existing",
      label: "North & Pine photography gallery",
      kind: "other",
      status: "active",
    };

    const packageMetadata = clientDeliveryPackageMetadata({
      clientName: "North & Pine",
      servicePlan: "North & Pine launch",
      productKeys: ["website", "brand-identity", "ongoing-care"],
      projectValue: "£4,800 + £150 monthly",
      billingCadence: "Project + ongoing care",
      existingProperties: [existingProperty],
      now: 1_700_000_000_000,
    });

    assert.equal(packageMetadata.portalServicePlan, "North & Pine launch");
    assert.equal(packageMetadata.agreedProjectValue, "£4,800 + £150 monthly");
    assert.equal(packageMetadata.portalBillingCadence, "Project + ongoing care");
    assert.deepEqual(
      packageMetadata.portalProducts.map(product => product.catalogKey),
      ["website", "brand-identity", "ongoing-care"],
    );
    assert.ok(packageMetadata.portalPlanIncludes.includes("Build, testing and launch"));
    assert.ok(packageMetadata.portalPlanIncludes.includes("Brand kit and usage assets"));
    assert.ok(packageMetadata.portalPlanIncludes.includes("Priority support"));
    assert.equal(packageMetadata.properties[0], existingProperty);

    const website = packageMetadata.properties.find(property => property.kind === "website");
    assert.ok(website);
    assert.equal(website.label, "North & Pine website");
    assert.equal(website.status, "planning");
    assert.equal(website.repositoryStatus, "not-created");
    assert.equal(website.deploymentStatus, "not-deployed");
  });

  it("preserves existing work and does not create a duplicate planned build", async () => {
    const { clientDeliveryPackageMetadata } = await import("../src/lib/server/clients/customerPortalProvisioning");
    const existingWebsite = {
      id: "prop_existing_site",
      label: "North & Pine website",
      kind: "website",
      status: "building",
    };

    const packageMetadata = clientDeliveryPackageMetadata({
      clientName: "North & Pine",
      productKeys: ["website", "custom-software"],
      existingProperties: [existingWebsite],
    });

    assert.equal(
      packageMetadata.properties.filter(property => property.kind === "website").length,
      1,
    );
    assert.equal(
      packageMetadata.properties.filter(property => property.kind === "client-portal").length,
      1,
    );
  });
});
