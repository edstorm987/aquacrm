import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("wires company assignment through the client workspace and every portal surface", () => {
    const root = process.cwd();
    const assignment = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientServiceAssignment.tsx"), "utf8");
    const route = readFileSync(join(root, "src/app/api/tenants/client-products/route.ts"), "utf8");
    const layout = readFileSync(join(root, "src/app/portal/customer/layout.tsx"), "utf8");
    const views = readFileSync(join(root, "src/app/portal/customer/_CustomerPortalViews.tsx"), "utf8");
    const preview = readFileSync(join(root, "src/app/client-preview/[clientId]/page.tsx"), "utf8");

    assert.match(assignment, /Save company & services/);
    assert.match(assignment, /companyId: selectedCompanyId \|\| null/);
    assert.match(route, /getTradingCompany\(session\.agencyId, requestedCompanyId\)/);
    assert.match(route, /companyId: hasCompanyAssignment/);
    assert.match(layout, /resolveClientPortalProvider\(client, authBrand\)/);
    assert.match(views, /resolveClientPortalProvider\(client, authBrand\)\.name/);
    assert.match(preview, /resolveClientPortalProvider\(client\)/);
  });
});
