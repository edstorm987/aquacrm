import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveAgencyProductAssignment,
  resolvePortalProductAssignment,
} from "../src/lib/productAssignments";
import { portalProductLifecycle, portalProductModule } from "../src/lib/portalProductModules";
import type { AgencyProduct } from "../src/server/types";

function product(
  id: string,
  overrides: Partial<AgencyProduct> = {},
): AgencyProduct {
  return {
    id,
    agencyId: "agency-test",
    kind: "product",
    name: id,
    category: "Test",
    description: `${id} description`,
    portalRequirement: "optional",
    includedProductIds: [],
    welcomePackItems: [],
    pricing: "custom",
    deliverables: [`${id} deliverable`],
    sopIds: [],
    sopCategories: [],
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("adaptive product assignments", () => {
  it("expands nested packages once and remains cycle safe", () => {
    const catalogue = [
      product("growth", {
        kind: "package",
        includedProductIds: ["website", "launch"],
      }),
      product("launch", {
        kind: "package",
        includedProductIds: ["social", "growth"],
      }),
      product("website"),
      product("social"),
    ];

    const resolved = resolveAgencyProductAssignment(catalogue, ["growth", "growth"]);

    assert.deepEqual(resolved.selectedIds, ["growth"]);
    assert.deepEqual(resolved.effectiveIds, ["growth", "website", "launch", "social"]);
    assert.deepEqual(resolved.missingIds, []);
  });

  it("reports missing and archived products instead of treating them as healthy", () => {
    const resolved = resolveAgencyProductAssignment([
      product("active"),
      product("archived", { active: false }),
    ], ["active", "archived", "deleted"]);

    assert.deepEqual(resolved.inactiveIds, ["archived"]);
    assert.deepEqual(resolved.missingIds, ["deleted"]);
  });

  it("uses current catalogue copy while retaining the assignment-time snapshot", () => {
    const resolved = resolvePortalProductAssignment({
      portalSelectedProductIds: ["website"],
      portalProductIds: ["website"],
      portalProducts: [{
        id: "website",
        name: "Old website name",
        description: "Old copy",
        deliverables: ["Old deliverable"],
      }],
    }, [product("website", {
      name: "Website transformation",
      description: "Current copy",
      deliverables: ["Strategy", "Build", "Launch"],
      updatedAt: 2,
    })]);

    assert.equal(resolved.products[0]?.name, "Website transformation");
    assert.deepEqual(resolved.products[0]?.deliverables, ["Strategy", "Build", "Launch"]);
    assert.equal(resolved.snapshotProducts[0]?.name, "Old website name");
    assert.equal(resolved.snapshotCurrent, false);
  });

  it("does not silently add new package children until rollout is approved", () => {
    const catalogue = [
      product("growth", {
        kind: "package",
        includedProductIds: ["website", "social"],
      }),
      product("website"),
      product("social"),
    ];
    const resolved = resolvePortalProductAssignment({
      portalSelectedProductIds: ["growth"],
      portalProductIds: ["growth", "website"],
      portalProducts: [
        { id: "growth", name: "growth", description: "", deliverables: [] },
        { id: "website", name: "website", description: "", deliverables: [] },
      ],
    }, catalogue);

    assert.deepEqual(resolved.effectiveIds, ["growth", "website"]);
    assert.deepEqual(resolved.products.map(item => item.id), ["growth", "website"]);
    assert.deepEqual(resolved.selectedIds, ["growth"]);
    assert.deepEqual(resolveAgencyProductAssignment(catalogue, resolved.selectedIds).effectiveIds, [
      "growth",
      "website",
      "social",
    ]);
    assert.equal(resolved.snapshotCurrent, false);
  });

  it("keeps a historical snapshot when a previously assigned product is deleted", () => {
    const resolved = resolvePortalProductAssignment({
      portalSelectedProductIds: ["retired-service"],
      portalProductIds: ["retired-service"],
      portalProducts: [{
        id: "retired-service",
        name: "Retired service",
        description: "Historical agreement",
        deliverables: ["Retained deliverable"],
      }],
    }, []);

    assert.deepEqual(resolved.missingIds, ["retired-service"]);
    assert.equal(resolved.products[0]?.name, "Retired service");
    assert.deepEqual(resolved.products[0]?.deliverables, ["Retained deliverable"]);
  });

  it("turns an uncategorised custom service into a complete deliverable-led portal", () => {
    const custom = {
      id: "executive-retreat",
      name: "Executive retreat",
      description: "A planned private strategy experience.",
      deliverables: ["Strategy brief", "Travel plan", "Facilitated sessions", "Decision record"],
    };
    const module = portalProductModule(custom);
    const lifecycle = portalProductLifecycle(custom);

    assert.equal(module.label, "Executive retreat workspace");
    assert.deepEqual(module.pages.map(page => page.navLabel), [
      "Executive retreat plan",
      "Working space",
      "Delivery & support",
    ]);
    assert.deepEqual(module.pages[0]?.outputs, custom.deliverables);
    assert.match(lifecycle.onboarding.focus, /Executive retreat plan/);
    assert.equal(lifecycle["developed-launch"].pageId, "delivery");
    assert.match(lifecycle.maintenance.heading, /supported and improving/i);
  });
});
