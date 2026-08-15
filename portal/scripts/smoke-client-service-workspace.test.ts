import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clientServiceCapabilities,
  inheritedClientServiceKeys,
} from "../src/lib/clientServiceWorkspace";
import type { PortalProductKey, PortalProductSelection } from "../src/lib/portalProducts";

function service(id: string, catalogKey?: PortalProductKey): PortalProductSelection {
  return {
    id,
    catalogKey,
    name: id,
    description: "",
    deliverables: [],
  };
}

describe("adaptive internal client services", () => {
  it("requires assignment before exposing service workspaces", () => {
    assert.deepEqual(clientServiceCapabilities([]), {
      hasServices: false,
      marketing: false,
      systems: false,
      keys: [],
    });
  });

  it("enables only the workspace capabilities required by assigned services", () => {
    const marketing = clientServiceCapabilities([service("paid-social", "social-ads")]);
    assert.equal(marketing.hasServices, true);
    assert.equal(marketing.marketing, true);
    assert.equal(marketing.systems, false);

    const website = clientServiceCapabilities([service("website-build", "website")]);
    assert.equal(website.marketing, false);
    assert.equal(website.systems, true);
  });

  it("inherits capabilities from every product included in an assigned package", () => {
    const assigned = [service("growth-package")];
    const catalogue = [
      { id: "growth-package", includedProductIds: ["website-build", "paid-social"] },
      { id: "website-build", portalTemplateKey: "website" as const },
      { id: "paid-social", portalTemplateKey: "social-ads" as const },
    ];

    const inherited = inheritedClientServiceKeys(assigned, catalogue);
    const capabilities = clientServiceCapabilities(assigned, inherited);

    assert.deepEqual(new Set(inherited), new Set(["website", "social-ads"]));
    assert.equal(capabilities.hasServices, true);
    assert.equal(capabilities.marketing, true);
    assert.equal(capabilities.systems, true);
  });
});
