import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clientServiceCapabilities,
  inheritedClientServiceKeys,
} from "../src/lib/clients/clientServiceWorkspace";
import type { PortalProductKey, PortalProductSelection } from "../src/lib/portal/portalProducts";
import { cleanClientOperationsBrief } from "../src/lib/clients/clientOperations";
import { defaultProductInternalWorkspace } from "../src/lib/products/productInternalWorkspace";
import { clientProductStageElapsedMs, cleanClientProductProcessState, setClientProductStage, setClientProductStepCompletion } from "../src/lib/clients/clientProductProcess";
import { applyClientProductVariations, buildClientProductVariation } from "../src/lib/clients/clientProductVariations";
import type { AgencyProduct } from "../src/server/types";

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
  it("gives every internal client lens a bespoke entry instead of repeating the control room", () => {
    const page = readFileSync(new URL("../src/app/portal/clients/[clientId]/page.tsx", import.meta.url), "utf8");
    const header = readFileSync(new URL("../src/app/portal/clients/[clientId]/_ClientWorkspaceHeader.tsx", import.meta.url), "utf8");
    const lensHeader = readFileSync(new URL("../src/app/portal/clients/[clientId]/_ClientLensHeader.tsx", import.meta.url), "utf8");

    assert.match(page, /tab === "overview" \? <ClientWorkspaceHeader/);
    assert.match(page, /: <ClientLensHeader/);
    assert.doesNotMatch(header, /Client control room/);
    for (const label of ["Relationship desk", "Delivery operations", "Client growth desk", "Technical estate", "Commercial desk", "Conversation desk", "Evidence library", "Customer experience", "Information archive"]) {
      assert.match(lensHeader, new RegExp(label));
    }
  });

  it("keeps static client information and the complete log together in the client record", () => {
    const page = readFileSync(new URL("../src/app/portal/clients/[clientId]/page.tsx", import.meta.url), "utf8");
    const recordStart = page.indexOf('{tab === "notes"');
    const recordEnd = page.indexOf("function ContextItem", recordStart);
    const record = page.slice(recordStart, recordEnd);
    const relationshipStart = page.indexOf('{tab === "relationship"');
    const relationshipEnd = page.indexOf('{tab === "delivery"', relationshipStart);
    const relationship = page.slice(relationshipStart, relationshipEnd);

    assert.match(record, /data-testid="client-information-record"/);
    assert.match(record, /<ClientContactsPanel/);
    assert.match(record, /Client information and useful links/);
    assert.match(record, /<ClientNotesWorkspace/);
    assert.match(record, /<ClientRecordWorkspace/);
    assert.ok(record.indexOf("<ClientContactsPanel") < record.indexOf("<ClientRecordWorkspace"));
    assert.doesNotMatch(relationship, /<ClientContactsPanel/);
  });

  it("keeps client operators inside the client-scoped micro workspace", () => {
    const root = process.cwd();
    const page = readFileSync(join(root, "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
    const layout = readFileSync(join(root, "src/app/portal/clients/[clientId]/layout.tsx"), "utf8");
    const finance = readFileSync(join(root, "src/app/portal/clients/[clientId]/_FinanceTabClient.tsx"), "utf8");
    const fulfilment = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientFulfilmentHub.tsx"), "utf8");
    const operatingPlan = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientOperatingPlan.tsx"), "utf8");
    const spine = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx"), "utf8");
    const sops = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientSopsTab.tsx"), "utf8");
    const switcher = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientWorkspaceSwitcher.tsx"), "utf8");
    const attentionProvider = readFileSync(join(root, "src/components/chrome/NotificationAttentionProvider.tsx"), "utf8");
    const clientRadarControl = readFileSync(join(root, "src/components/chrome/ClientRadarQuickLookControl.tsx"), "utf8");
    const clientRadarButton = readFileSync(join(root, "src/components/chrome/ClientRadarQuickLookButton.tsx"), "utf8");
    const topbarBack = readFileSync(join(root, "src/components/chrome/TopbarBackButton.tsx"), "utf8");

    for (const [source, route] of [
      [page, "/portal/agency/fulfilment"],
      [page, "/portal/agency/inbox"],
      [finance, "/portal/agency/agency-finance"],
      [fulfilment, "/portal/agency/fulfilment"],
      [operatingPlan, "/portal/agency/fulfilment"],
      [spine, "/portal/agency/actions"],
      [spine, "/portal/agency/inbox"],
      [sops, "/portal/agency/sop-library"],
      [sops, "/portal/agency/products"],
    ] as const) {
      assert.doesNotMatch(source, new RegExp(route.replaceAll("/", "\\/")));
    }

    assert.match(finance, /Create first invoice/);
    assert.match(page, /Contact details, customer requests, replies and relationship history for this client only/);
    assert.match(page, /clientId=\{client\.id\}[\s\S]*families=\{familiesForStage/);
    assert.match(layout, /const canReturnToAgency = session\.role === "agency-owner" \|\| session\.role === "agency-manager"/);
    assert.match(layout, /\.\.\.\(canReturnToAgency \?/);
    assert.match(layout, /NotificationAttentionProvider initialAlerts=\{alertViews\} clientId=\{client\.id\}/);
    assert.match(layout, /ClientRadarQuickLookControl agencyId=\{session\.agencyId\} clientId=\{client\.id\}/);
    assert.match(layout, /NotificationCentreButton includeProductUpdates=\{false\}/);
    assert.match(attentionProvider, /items\.filter\(alert => operationalAlertBelongsToClient\(alert, clientId\)\)/);
    assert.match(switcher, /context=client-workspace/);
    assert.match(clientRadarControl, /buildClientRadar\(agencyId, clientId\)/);
    assert.match(clientRadarButton, /api\/portal\/clients\/\$\{encodeURIComponent\(radar\.clientId\)\}\/radar/);
    assert.doesNotMatch(clientRadarButton, /\/portal\/agency/);
    assert.match(topbarBack, /clientMatch\?\.\[1\] && clientMatch\[2\]/);
    assert.match(topbarBack, /return `\/portal\/clients\/\$\{clientMatch\[1\]\}`/);
  });

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

  it("gives every new product a useful internal workspace before it is customised", () => {
    const marketing = defaultProductInternalWorkspace({ id: "paid-social", name: "Paid social", portalTemplateKey: "social-ads", sopIds: ["sop-brief", "sop-launch"] });
    assert.equal(marketing.processSteps.length, 4);
    assert.equal(marketing.lifecycleStages.length, 4);
    assert.equal(marketing.processSteps[0]?.stageId, marketing.lifecycleStages[0]?.id);
    assert.equal(marketing.processSteps[1]?.module, "marketing");
    assert.deepEqual(marketing.processSteps[0]?.sopIds, ["sop-brief"]);
    assert.equal(marketing.quickActions.includes("marketing"), true);

    const website = defaultProductInternalWorkspace({ id: "website", name: "Website", portalTemplateKey: "website" });
    assert.equal(website.processSteps[1]?.module, "systems");
    assert.equal(website.advancedModules.includes("systems"), true);
  });

  it("retains real per-client completion without leaking malformed process state", () => {
    assert.deepEqual(cleanClientProductProcessState(null), {});
    const completed = setClientProductStepCompletion({}, "product-1", "brief", true, "owner@example.com", 100);
    assert.deepEqual(completed, {
      "product-1": { completedStepIds: ["brief"], updatedAt: 100, updatedBy: "owner@example.com" },
    });
    assert.deepEqual(setClientProductStepCompletion(completed, "product-1", "brief", false, "owner@example.com", 200), {
      "product-1": { completedStepIds: [], updatedAt: 200, updatedBy: "owner@example.com" },
    });
    const production = setClientProductStage(completed, "product-1", "production", "owner@example.com", 300);
    assert.deepEqual(production, {
      "product-1": { completedStepIds: ["brief"], currentStageId: "production", stageHistory: [{ stageId: "production", enteredAt: 300, actor: "owner@example.com" }], updatedAt: 300, updatedBy: "owner@example.com" },
    });
    const review = setClientProductStage(production, "product-1", "review", "owner@example.com", 500);
    assert.deepEqual(review["product-1"].stageHistory, [
      { stageId: "production", enteredAt: 300, exitedAt: 500, actor: "owner@example.com" },
      { stageId: "review", enteredAt: 500, actor: "owner@example.com" },
    ]);
    assert.equal(clientProductStageElapsedMs(review["product-1"], "production", 800), 200);
    assert.equal(clientProductStageElapsedMs(review["product-1"], "review", 800), 300);
  });

  it("keeps draft services out of client assignment and retains client variations as deltas", () => {
    const workspace = defaultProductInternalWorkspace({ id: "service-1", name: "Website" });
    const base: AgencyProduct = {
      id: "service-1", agencyId: "agency-1", kind: "product", name: "Website", category: "Digital",
      description: "Official scope", portalRequirement: "required", includedProductIds: [], welcomePackItems: [],
      pricing: "fixed", priceCents: 100_000, internalWorkspace: workspace, deliverables: ["Five pages"],
      sopIds: [], sopCategories: [], status: "live", active: true, createdAt: 1, updatedAt: 1,
    };
    const variation = buildClientProductVariation(base, {
      ...base,
      name: "Website · expanded shop",
      deliverables: ["Five pages", "Product catalogue"],
    }, "owner-1");
    assert.equal(variation.name, "Website · expanded shop");
    assert.deepEqual(variation.deliverables, ["Five pages", "Product catalogue"]);
    assert.equal(variation.priceCents, undefined);
    const [effective] = applyClientProductVariations({ clientProductVariations: { [base.id]: variation } }, [base]);
    assert.equal(effective?.name, "Website · expanded shop");
    assert.equal(effective?.priceCents, 100_000);

    const root = process.cwd();
    const productsUi = readFileSync(join(root, "src/app/portal/agency/products/_ProductsWorkspace.tsx"), "utf8");
    const productRoute = readFileSync(join(root, "src/app/api/portal/products/route.ts"), "utf8");
    const variationRoute = readFileSync(join(root, "src/app/api/tenants/client-product-variation/route.ts"), "utf8");
    const assignment = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientServiceAssignment.tsx"), "utf8");
    assert.match(productsUi, /Draft idea · internal only/);
    assert.match(productsUi, /Open & edit/);
    assert.match(productRoute, /status: body\.status/);
    assert.match(variationRoute, /client\.service_variation_saved/);
    assert.match(variationRoute, /client\.service_variation_reset/);
    assert.match(assignment, /Customise/);
    assert.match(assignment, /Client variation/);
    assert.match(assignment, /Reset .* to the official catalogue service/);

    const serviceWorkspace = readFileSync(join(root, "src/app/portal/agency/products/[productId]/_ProductDetailWorkspace.tsx"), "utf8");
    const servicePage = readFileSync(join(root, "src/app/portal/agency/products/[productId]/page.tsx"), "utf8");
    const rollout = readFileSync(join(root, "src/app/portal/agency/products/[productId]/_ProductRolloutCentre.tsx"), "utf8");
    assert.match(serviceWorkspace, /Product service workspace/);
    assert.match(serviceWorkspace, /Product service workspace stations/);
    assert.match(serviceWorkspace, /Edit base portal/);
    assert.match(serviceWorkspace, /Manage SOP links/);
    assert.match(serviceWorkspace, /id="service-pricing"/);
    assert.match(serviceWorkspace, /id="service-contract"/);
    assert.match(rollout, /Clients, variations and rollout/);
    assert.match(rollout, /Client variation/);
    assert.match(rollout, /tab=delivery&product=/);
    assert.match(servicePage, /clientProductVariations/);
    assert.match(servicePage, /effectiveName:/);
    assert.match(servicePage, /effectiveCurrentProduct/);
  });

  it("wires company assignment through the client workspace and every portal surface", () => {
    const root = process.cwd();
    const assignment = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientServiceAssignment.tsx"), "utf8");
    const route = readFileSync(join(root, "src/app/api/tenants/client-products/route.ts"), "utf8");
    const layout = readFileSync(join(root, "src/app/portal/customer/layout.tsx"), "utf8");
    const views = readFileSync(join(root, "src/app/portal/customer/_CustomerPortalViews.tsx"), "utf8");
    const requestContext = readFileSync(join(root, "src/app/portal/customer/_requestContext.ts"), "utf8");
    const preview = readFileSync(join(root, "src/app/client-preview/[clientId]/page.tsx"), "utf8");

    assert.match(assignment, /Save company & services/);
    assert.match(assignment, /companyId: selectedCompanyId \|\| null/);
    assert.match(route, /effectiveCompanyId = hasCompanyAssignment \? requestedCompanyId : client\.companyId/);
    assert.match(route, /getTradingCompany\(session\.agencyId, effectiveCompanyId\)/);
    assert.match(route, /companyId: hasCompanyAssignment/);
    assert.match(requestContext, /resolveClientPortalProvider\(client, authBrand\)/);
    assert.match(layout, /loadCustomerPortalIdentity/);
    assert.match(views, /loadCustomerPortalRequestContext/);
    assert.match(preview, /resolveClientPortalProvider\(client,/);
  });

  it("keeps service assignment canonical across the internal workspace and portal editor", () => {
    const root = process.cwd();
    const page = readFileSync(join(root, "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
    const editor = readFileSync(join(root, "src/app/portal/clients/[clientId]/_FulfilmentPortalPreview.tsx"), "utf8");
    const fulfilmentHub = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientFulfilmentHub.tsx"), "utf8");
    const portalStudioPage = readFileSync(join(root, "src/app/portal/agency/portals/editor/page.tsx"), "utf8");
    const portalStudio = readFileSync(join(root, "src/engines/editor/DevEditor.tsx"), "utf8");
    const control = readFileSync(join(root, "src/app/api/tenants/customer-portal-control/route.ts"), "utf8");
    const assignmentRoute = readFileSync(join(root, "src/app/api/tenants/client-products/route.ts"), "utf8");

    assert.match(page, /products: selectedProducts/);
    assert.match(editor, /canonical service assignment/i);
    assert.match(editor, /Manage canonical services/);
    assert.match(editor, /context=client-workspace/);
    assert.match(fulfilmentHub, /Client fulfilment room/);
    assert.match(fulfilmentHub, /Contracts & finance/);
    assert.match(fulfilmentHub, /Edit client portal/);
    assert.match(fulfilmentHub, /More client controls/);
    assert.doesNotMatch(fulfilmentHub, /Portfolio Fulfilment/);
    assert.match(portalStudioPage, /lockToClient/);
    assert.match(portalStudioPage, /Back to client portal/);
    assert.match(portalStudio, /lockToClient = false/);
    assert.match(portalStudio, /Client portal/);
    assert.match(portalStudio, /href=\{backHref\}/);
    assert.match(page, /providerName=\{portalProviderName\}/);
    assert.match(readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientDeliveryOverview.tsx"), "utf8"), /manage=1&section=service&productId=/);
    assert.doesNotMatch(editor, /PORTAL_PRODUCT_CATALOG/);
    assert.match(control, /const portalProducts = existingAssignment\.products/);
    assert.match(control, /Assign at least one service before creating the client portal/);
    assert.match(assignmentRoute, /\["agency-owner", "agency-manager"\]/);
    assert.match(assignmentRoute, /client\.services_expanded/);
    assert.match(assignmentRoute, /addedProductIds/);
    assert.match(assignmentRoute, /changeType/);
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

  it("keeps the Delivery parent active across every nested delivery workspace", () => {
    const navLink = readFileSync(join(process.cwd(), "src/components/chrome/SidebarNavLink.tsx"), "utf8");
    assert.match(navLink, /id === "client-delivery"/);
    assert.match(navLink, /currentClientTab === "delivery" \|\| currentClientTab === "marketing" \|\| currentClientTab === "systems" \|\| currentClientTab === "files"/);
  });

  it("gives operations an expanded, task-oriented client control surface", () => {
    const root = process.cwd();
    const layout = readFileSync(join(root, "src/app/portal/clients/[clientId]/layout.tsx"), "utf8");
    const overview = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx"), "utf8");
    const operatingPlan = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientOperatingPlan.tsx"), "utf8");
    const advanced = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientAdvancedControls.tsx"), "utf8");
    const taskButton = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientOperationTaskButton.tsx"), "utf8");
    const taskRoute = readFileSync(join(root, "src/app/api/tenants/client-operation-task/route.ts"), "utf8");
    const page = readFileSync(join(root, "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
    const handover = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientOperationsControl.tsx"), "utf8");
    const handoverRoute = readFileSync(join(root, "src/app/api/tenants/client-operations/route.ts"), "utf8");
    const productProcessRoute = readFileSync(join(root, "src/app/api/tenants/client-product-process/route.ts"), "utf8");
    const portalWorkspaceRoute = readFileSync(join(root, "src/app/api/tenants/product-workspaces/route.ts"), "utf8");
    const portalWorkspaceUi = readFileSync(join(root, "src/app/portal/customer/_ProductWorkspaceApplication.tsx"), "utf8");
    const clientHeader = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientWorkspaceHeader.tsx"), "utf8");

    assert.match(layout, /label: "Client workspace"/);
    assert.match(layout, /label: "Overview"/);
    assert.match(layout, /label: "Relationship"/);
    assert.match(layout, /label: "Fulfilment"/);
    assert.match(layout, /label: "Commercial"/);
    assert.match(layout, /label: "Client record"/);
    assert.match(layout, /label: "Client portal"/);
    assert.doesNotMatch(layout, /assignedServices\.map/);
    assert.match(page, /contextualTabs/);
    const serviceSwitcher = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientServiceSwitcher.tsx"), "utf8");
    assert.match(serviceSwitcher, /Find one of \$\{products\.length\} services/);
    assert.match(serviceSwitcher, /mode: advanced \? "advanced" : undefined/);
    assert.match(overview, /Work the client in this order/);
    assert.match(overview, /commercialGaps\.join/);
    assert.match(overview, /Next best move/);
    assert.match(overview, /One account process, with a bespoke playbook for every service/);
    assert.match(overview, /<ClientOperatingPlan clientId=/);
    assert.match(operatingPlan, /Product operating plan/);
    assert.match(operatingPlan, /Customise \$\{product\.name\} for this client/);
    assert.match(operatingPlan, /Next useful move/);
    assert.match(operatingPlan, /Advanced controls/);
    assert.match(operatingPlan, /data-testid="client-service-advanced"/);
    assert.doesNotMatch(operatingPlan, /Open in Fulfilment/);
    assert.match(operatingPlan, /client-sop-/);
    assert.match(operatingPlan, /Mark complete/);
    assert.match(operatingPlan, /Make current stage/);
    assert.match(operatingPlan, /service stages/);
    assert.match(operatingPlan, /\/api\/tenants\/client-product-process/);
    assert.match(productProcessRoute, /product is not assigned to this client/);
    assert.match(productProcessRoute, /step is not part of this product process/);
    assert.match(productProcessRoute, /stage is not part of this product lifecycle/);
    assert.match(productProcessRoute, /transitionClientProductStage/);
    assert.match(portalWorkspaceRoute, /transitionClientProductStage/);
    assert.match(portalWorkspaceRoute, /stage => stage\.portalMode === portalMode/);
    assert.match(portalWorkspaceRoute, /serviceStageId: transition\.stageId/);
    assert.match(portalWorkspaceUi, /Portal experience/);
    assert.match(page, /portalMaterialized = customPortalExists\(client\.slug\)/);
    assert.doesNotMatch(page, /portalMaterialized = live &&/);
    assert.match(page, /selectedProducts\.length === 0 && isAquaStage/);
    assert.match(page, /Independent service stages/);
    assert.match(clientHeader, /label="Account status"/);
    assert.match(productProcessRoute, /client_product_step\.completed/);
    assert.match(overview, /Know the client/);
    assert.match(overview, /Agree the work/);
    assert.match(overview, /Deliver with playbooks/);
    assert.match(overview, /Keep them informed/);
    assert.match(overview, /Review and improve/);
    assert.match(overview, /const priorityOperations = operations\.slice\(0, 3\)/);
    assert.match(overview, /additional operational check/);
    assert.match(advanced, /Advanced client controls/);
    assert.match(advanced, /Radar, detailed health, systems and operational handover/);
    assert.match(advanced, /#operational-brief/);
    assert.match(advanced, /window\.addEventListener\("hashchange"/);
    assert.match(advanced, /document\.addEventListener\("click", revealLinkedTarget, true\)/);
    assert.match(overview, /<ClientAdvancedControls signalCount=/);
    assert.match(overview, /Open linked SOPs/);
    const clientSops = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientSopsTab.tsx"), "utf8");
    assert.match(clientSops, /id="client-sops"/);
    assert.match(clientSops, /SOPs linked to assigned services/);
    assert.match(clientSops, /product\.sopIds\.includes\(sop\.id\)/);
    assert.match(clientSops, /product\.sopCategories\.some/);
    assert.match(clientSops, /Read procedure/);
    assert.match(clientSops, /id=\{`client-sop-\$\{sop\.id\}`\}/);
    assert.match(clientSops, /\/api\/portal\/sops\/content\?id=/);
    assert.match(clientSops, /Manage client service/);
    assert.match(page, /listSops\(session\.agencyId\)/);
    assert.match(page, /linkedDefinitions\.flatMap\(item => item\.sopIds/);
    assert.match(page, /clientProductPlans/);
    assert.match(page, /defaultProductInternalWorkspace/);
    assert.match(overview, /Client movement/);
    assert.match(overview, /Latest retained events/);
    assert.match(overview, /label="Message"/);
    assert.match(overview, /label="Call"/);
    assert.match(overview, /label=\{canManageProductPlans \? "Add note" : "View notes"\}/);
    assert.match(overview, /label="Review priorities"/);
    assert.match(overview, /label=\{canManageProductPlans \? "Upload file" : "Open files"\}/);
    assert.match(overview, /label="Payment"/);
    assert.match(overview, /title="Shared experience"/);
    assert.match(overview, /portal decision/);
    assert.match(overview, /Portal access cannot be sent/);
    assert.match(overview, /Portal invitation is ready to send/);
    assert.match(page, /recentMovement=\{recentMovement\}/);
    assert.match(page, /message\.occurredAt > 0/);
    assert.match(page, /message\.body\.trim\(\) !== "No message was recorded\."/);
    assert.match(page, /pendingApprovals: customerPortalData\.approvals\.filter/);
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
    assert.match(page, /const deliveryAdvanced = rawDeliveryMode === "advanced"/);
    assert.match(page, /deliveryAdvanced \? <section/);
    assert.match(page, /Advanced fulfilment tools/);
    const deliveryOverview = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientDeliveryOverview.tsx"), "utf8");
    const fulfilmentHub = readFileSync(join(root, "src/app/portal/clients/[clientId]/_ClientFulfilmentHub.tsx"), "utf8");
    assert.match(deliveryOverview, /Simple mode/);
    assert.match(deliveryOverview, /Advanced Fulfilment/);
    assert.doesNotMatch(fulfilmentHub, /Portfolio Fulfilment/);
    const fulfilmentPage = readFileSync(join(root, "src/app/portal/agency/fulfilment/page.tsx"), "utf8");
    const fulfilmentWorkspace = readFileSync(join(root, "src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx"), "utf8");
    assert.match(fulfilmentPage, /focusedClientId=\{requested\.client\}/);
    assert.match(fulfilmentWorkspace, /Focused fulfilment/);
    assert.match(fulfilmentWorkspace, /Show every client/);
  });

  it("persists an in-app product process designer as the client workspace source of truth", () => {
    const root = process.cwd();
    const types = readFileSync(join(root, "src/server/types.ts"), "utf8");
    const products = readFileSync(join(root, "src/server/agencyProducts.ts"), "utf8");
    const api = readFileSync(join(root, "src/app/api/portal/products/route.ts"), "utf8");
    const editor = readFileSync(join(root, "src/app/portal/agency/products/_ProductsWorkspace.tsx"), "utf8");
    const detail = readFileSync(join(root, "src/app/portal/agency/products/[productId]/_ProductDetailWorkspace.tsx"), "utf8");

    assert.match(types, /interface AgencyProductInternalWorkspace/);
    assert.match(types, /internalWorkspace\?: AgencyProductInternalWorkspace/);
    assert.match(products, /cleanInternalWorkspace/);
    assert.match(products, /defaultProductInternalWorkspace/);
    assert.match(api, /internalWorkspace: body\.internalWorkspace/);
    assert.match(editor, /Internal client workspace/);
    assert.match(editor, /Service stages/);
    assert.match(editor, /Portal experience/);
    assert.match(editor, /Everyday controls/);
    assert.match(editor, /Ordered process/);
    assert.match(editor, /SOP for this step/);
    assert.match(editor, /Advanced workspace tools/);
    assert.match(editor, /Suggested process/);
    assert.match(detail, /The operating path inherited by every client assigned this product/);
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
