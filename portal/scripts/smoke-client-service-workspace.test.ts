import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clientServiceCapabilities,
  inheritedClientServiceKeys,
} from "../src/lib/clientServiceWorkspace";
import type { PortalProductKey, PortalProductSelection } from "../src/lib/portalProducts";
import { cleanClientOperationsBrief } from "../src/lib/clientOperations";

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
    assert.match(route, /effectiveCompanyId = hasCompanyAssignment \? requestedCompanyId : client\.companyId/);
    assert.match(route, /getTradingCompany\(session\.agencyId, effectiveCompanyId\)/);
    assert.match(route, /companyId: hasCompanyAssignment/);
    assert.match(layout, /resolveClientPortalProvider\(client, authBrand\)/);
    assert.match(views, /resolveClientPortalProvider\(client, authBrand\)\.name/);
    assert.match(preview, /resolveClientPortalProvider\(client,/);
  });

  it("keeps service assignment canonical across the internal workspace and portal editor", () => {
    const root = process.cwd();
    const page = readFileSync(join(root, "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
    const editor = readFileSync(join(root, "src/app/portal/clients/[clientId]/_FulfilmentPortalPreview.tsx"), "utf8");
    const control = readFileSync(join(root, "src/app/api/tenants/customer-portal-control/route.ts"), "utf8");
    const assignmentRoute = readFileSync(join(root, "src/app/api/tenants/client-products/route.ts"), "utf8");

    assert.match(page, /products: selectedProducts/);
    assert.match(editor, /canonical service assignment/i);
    assert.match(editor, /Manage canonical services/);
    assert.match(page, /providerName=\{portalProviderName\}/);
    assert.match(readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientDeliveryOverview.tsx"), "utf8"), /manage=1&section=service&productId=/);
    assert.doesNotMatch(editor, /PORTAL_PRODUCT_CATALOG/);
    assert.match(control, /const portalProducts = existingAssignment\.products/);
    assert.match(control, /Assign at least one service before creating the client portal/);
    assert.match(assignmentRoute, /\["agency-owner", "agency-manager"\]/);
  });

  it("shows precise launch readiness and routes missing services to their source of truth", () => {
    const root = process.cwd();
    const workspace = readFileSync(join(root, "src/app/portal/agency/portals/_PortalsWorkspace.tsx"), "utf8");
    const data = readFileSync(join(root, "src/app/portal/agency/portals/_portalWorkspaceData.ts"), "utf8");

    assert.match(data, /productCount: productAssignment\.products\.length/);
    assert.match(workspace, /Launch progress/);
    assert.match(workspace, /Ready to invite/);
    assert.match(workspace, /Assign a service/);
    assert.match(workspace, /tab=delivery#service-assignment/);
    assert.match(workspace, /Access & setup/);
  });

  it("does not mark the delivery overview active while a product workspace is selected", () => {
    const navLink = readFileSync(join(process.cwd(), "src/components/chrome/SidebarNavLink.tsx"), "utf8");
    assert.match(navLink, /id === "client-delivery" && searchParams\.has\("product"\)/);
  });

  it("gives operations an expanded, task-oriented client control surface", () => {
    const root = process.cwd();
    const layout = readFileSync(join(root, "src/app/portal/clients/[clientId]/layout.tsx"), "utf8");
    const overview = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx"), "utf8");
    const taskButton = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientOperationTaskButton.tsx"), "utf8");
    const taskRoute = readFileSync(join(root, "src/app/api/tenants/client-operation-task/route.ts"), "utf8");
    const page = readFileSync(join(root, "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
    const handover = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientOperationsControl.tsx"), "utf8");
    const handoverRoute = readFileSync(join(root, "src/app/api/tenants/client-operations/route.ts"), "utf8");

    assert.match(layout, /label: "Operations desk"/);
    assert.match(layout, /label: "Operate"/);
    assert.match(layout, /label: "Delivery & services"/);
    assert.match(layout, /label: "Assets & access"/);
    assert.match(overview, /Work the client in this order/);
    assert.match(overview, /commercialGaps\.join/);
    assert.match(overview, /Operator shortcuts/);
    assert.match(overview, /No operational blocker is recorded/);
    assert.match(page, /commercialGaps=\{commercialGaps\}/);
    assert.match(taskButton, /Add to Actions/);
    assert.match(taskButton, /\/api\/tenants\/client-operation-task/);
    assert.match(taskRoute, /requireRoleForClient\(\[\.\.\.AGENCY_ROLES\], clientId\)/);
    assert.match(taskRoute, /canUsePeopleStation\(session\.agencyId, session\.userId, "actions", true\)/);
    assert.match(taskRoute, /sourceId: `client:\$\{clientId\}:operation:\$\{operationId\}`/);
    assert.match(taskRoute, /assigneeUserId: session\.userId/);
    assert.match(taskRoute, /origin: "crm"/);
    assert.match(overview, /Operational handover is incomplete/);
    assert.match(overview, /Account review is overdue/);
    assert.match(handover, /The minimum context another operator needs to take over cleanly/);
    assert.match(handover, /Save handover/);
    assert.match(handover, /Complete review/);
    assert.match(handover, /Record review/);
    assert.match(handoverRoute, /client_operations\.updated/);
    assert.match(handoverRoute, /client_operations\.review_completed/);
    assert.match(handoverRoute, /Account review completed/);
    assert.match(handoverRoute, /operation:account-review-overdue/);
    assert.match(handoverRoute, /updateAgencyTask/);
    assert.match(handoverRoute, /listPeopleEmployees/);
    assert.match(handoverRoute, /metadata: \{ clientOperations: brief \}/);
    assert.match(page, /operationsBrief=\{clientOperations\}/);
    assert.match(page, /tab === "delivery" \? <ClientServiceAssignment/);
  });

  it("normalises the internal operations brief without exposing arbitrary data", () => {
    assert.deepEqual(cleanClientOperationsBrief(null), { state: "unassigned", reviews: [] });
    assert.deepEqual(cleanClientOperationsBrief({
      ownerId: " employee_1 ",
      ownerName: " Ed ",
      state: "at-risk",
      currentObjective: " Recover the account ",
      nextReviewAt: "2026-08-20T12:00:00.000Z",
      ignored: "customer-visible",
    }), {
      ownerId: "employee_1",
      ownerUserId: undefined,
      ownerName: "Ed",
      ownerEmail: undefined,
      state: "at-risk",
      currentObjective: "Recover the account",
      nextReviewAt: Date.parse("2026-08-20T12:00:00.000Z"),
      riskSummary: undefined,
      handoverNote: undefined,
      reviews: [],
      updatedAt: undefined,
      updatedBy: undefined,
    });
  });
});
