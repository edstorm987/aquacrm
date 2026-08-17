import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const FULFILMENT_PAGE = join(ROOT, "src", "app", "portal", "agency", "fulfilment", "page.tsx");
const FULFILMENT_WORKSPACE = join(ROOT, "src", "app", "portal", "agency", "fulfilment", "_FulfilmentWorkspace.tsx");
const PORTALS_WORKSPACE = join(ROOT, "src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx");
const SIDEBAR = join(ROOT, "src", "lib", "chrome", "sidebarLayout.ts");
const PIPELINE_BOARD = join(ROOT, "src", "app", "portal", "agency", "pipelines", "[slug]", "_PipelineBoard.tsx");
const MOVE_CLIENT = join(ROOT, "src", "app", "api", "portal", "pipelines", "move-client", "route.ts");
const PRODUCT_DETAIL_PAGE = join(ROOT, "src", "app", "portal", "agency", "products", "[productId]", "page.tsx");
const PRODUCT_EDITOR = join(ROOT, "src", "app", "portal", "agency", "products", "_ProductsWorkspace.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("fulfilment command centre", () => {
  it("makes fulfilment the canonical agency delivery destination", () => {
    const sidebar = read(SIDEBAR);
    assert.ok(sidebar.includes('id: "fulfilment"'));
    assert.ok(sidebar.includes('href: "/portal/agency/fulfilment"'));
    assert.ok(!sidebar.includes('id: "portals",     label: "Portals"'));
  });

  it("brings overview, stages, services, clients, and portals together", () => {
    const workspace = read(FULFILMENT_WORKSPACE);
    for (const view of ["overview", "stages", "services", "clients", "portals"]) {
      assert.ok(workspace.includes(`\"${view}\"`), `${view} view missing`);
    }
    assert.ok(workspace.includes("<PipelineBoard"), "product-aware delivery board must remain interactive");
    assert.ok(workspace.includes("All service boards"), "stage board must open with a portfolio overview");
    assert.ok(workspace.includes("Portfolio pipeline map"), "stage overview must explain the all-board view");
    assert.ok(workspace.includes("column.count / board.total * 100"), "stage bars must reflect real client distribution");
    assert.ok(workspace.includes("All service boards</Link>"), "focused boards must return to the overview");
    assert.ok(workspace.includes("<PortalsWorkspace"), "the real portal workspace must be embedded");
    assert.ok(workspace.includes("Technical delivery"), "specialist technical delivery should remain linked from fulfilment");
  });

  it("rolls up real client products, milestones, workspaces, and pipeline stages", () => {
    const page = read(FULFILMENT_PAGE);
    assert.ok(page.includes("listClients(agencyId)"));
    assert.ok(page.includes("listClientMilestones(agencyId)"));
    assert.ok(page.includes("clientProductWorkspaces(client)"));
    assert.ok(page.includes("portalWorkspaceProgress(workspace)"));
    assert.ok(page.includes("agencyProductPipelineColumns"));
    assert.ok(page.includes("defaultAgencyProductPipelineStage"));
    assert.ok(page.includes("productPipelineStages"));
    assert.ok(page.includes("focused: Boolean(requestedProduct && requestedDefinition)"));
    assert.ok(page.includes("overviews"));
    assert.ok(page.includes("productCards.filter(card => card.columnId === column.id).length"));
    assert.ok(page.includes("key: product.id"), "each service must own an independent stage board");
  });

  it("keeps portal template switching local when embedded", () => {
    const portals = read(PORTALS_WORKSPACE);
    assert.ok(portals.includes("embedded = false"));
    assert.ok(portals.includes("if (embedded) return"));
    assert.ok(portals.includes("data-embedded-portal-workspace"));
  });

  it("uses the existing move-client API for drag-and-drop delivery changes", () => {
    const board = read(PIPELINE_BOARD);
    const route = read(MOVE_CLIENT);
    assert.ok(board.includes('fetch("/api/portal/pipelines/move-client"'));
    assert.ok(board.includes("body: JSON.stringify({ clientId: card.id, columnId, productKey })"));
    assert.ok(board.includes("onDrop="));
    assert.ok(route.includes("agencyProductPipelineColumns(product)"));
    assert.ok(route.includes("productPipelineStages[product.id] = column.id"));
  });

  it("opens the full service stage editor from a focused board", () => {
    const workspace = read(FULFILMENT_WORKSPACE);
    const detailPage = read(PRODUCT_DETAIL_PAGE);
    const editor = read(PRODUCT_EDITOR);
    assert.ok(workspace.includes("?edit=stages#service-process"));
    assert.ok(workspace.includes("Edit stages"));
    assert.ok(detailPage.includes('requested.edit === "stages"'));
    assert.ok(editor.includes('focusSection?: "stages"'));
    assert.ok(editor.includes("stageSectionRef.current?.scrollIntoView"));
    assert.ok(editor.includes("addWorkspaceStage"));
    assert.ok(editor.includes("moveWorkspaceStage"));
    assert.ok(editor.includes("removeWorkspaceStage"));
  });
});
