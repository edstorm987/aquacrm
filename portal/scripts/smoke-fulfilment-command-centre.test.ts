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
    assert.ok(workspace.includes("<PortalsWorkspace"), "the real portal workspace must be embedded");
    assert.ok(workspace.includes("Web development"), "specialist web delivery should remain linked from fulfilment");
  });

  it("rolls up real client products, milestones, workspaces, and pipeline stages", () => {
    const page = read(FULFILMENT_PAGE);
    assert.ok(page.includes("listClients(agencyId)"));
    assert.ok(page.includes("listClientMilestones(agencyId)"));
    assert.ok(page.includes("clientProductWorkspaces(client)"));
    assert.ok(page.includes("portalWorkspaceProgress(workspace)"));
    assert.ok(page.includes("PRODUCT_PIPELINE_COLUMNS"));
    assert.ok(page.includes("productPipelineStages"));
  });

  it("keeps portal template switching local when embedded", () => {
    const portals = read(PORTALS_WORKSPACE);
    assert.ok(portals.includes("embedded = false"));
    assert.ok(portals.includes("if (embedded) return"));
    assert.ok(portals.includes("data-embedded-portal-workspace"));
  });

  it("uses the existing move-client API for drag-and-drop delivery changes", () => {
    const board = read(PIPELINE_BOARD);
    assert.ok(board.includes('fetch("/api/portal/pipelines/move-client"'));
    assert.ok(board.includes("body: JSON.stringify({ clientId: card.id, columnId, productKey })"));
    assert.ok(board.includes("onDrop="));
  });
});
