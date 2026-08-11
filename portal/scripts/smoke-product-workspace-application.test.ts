import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

import { PORTAL_PRODUCT_CATALOG, type PortalProductSelection } from "../src/lib/portalProducts";
import { BESPOKE_PRODUCT_MODULES } from "../src/lib/portalBespokeProductModules";
import { portalProductModule } from "../src/lib/portalProductModules";
import {
  cleanPortalProductWorkspace,
  createPortalProductWorkspace,
  mergePortalProductWorkspaceStore,
  portalWorkspacePageFields,
  portalWorkspaceProgress,
} from "../src/lib/portalProductWorkspaces";

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
type ProductWorkspaces = typeof import("../src/server/productWorkspaces");

let storage: Storage;
let tenants: Tenants;
let productWorkspaces: ProductWorkspaces;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  productWorkspaces = await import("../src/server/productWorkspaces");
});

describe("product workspace application model", () => {
  it("creates a complete working application for every established product", () => {
    const specialistProducts: PortalProductSelection[] = Object.keys(BESPOKE_PRODUCT_MODULES).map((name, index) => ({
      id: `specialist-${index}`,
      name,
      description: `${name} specialist delivery.`,
      deliverables: ["Primary delivery", "Review record", "Handover"],
    }));

    for (const product of [...PORTAL_PRODUCT_CATALOG, ...specialistProducts]) {
      const module = portalProductModule(product);
      const workspace = createPortalProductWorkspace(product, "onboarding", 1_000);
      assert.equal(workspace.productId, product.id);
      assert.equal(Object.keys(workspace.pages).length, 3, `${product.name} should own three persisted workspaces`);
      assert.equal(workspace.collections.length, 1, `${product.name} should have a seeded delivery collection`);
      assert.equal(workspace.collections[0].pageId, module.pages[2].id);
      for (const page of module.pages) {
        const state = workspace.pages[page.id];
        assert.equal(state.checklist.length, 4);
        assert.equal(state.outputs.length, 4);
        assert.equal(portalWorkspacePageFields(product, page).length, 4);
      }
    }
  });

  it("gives photography a proofing gallery and a purpose-built brief", () => {
    const photography = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "photography")!;
    const module = portalProductModule(photography);
    const workspace = createPortalProductWorkspace(photography, "designing", 2_000);
    assert.equal(workspace.collections[0].title, "Photography gallery");
    assert.match(workspace.collections[0].description ?? "", /Private proofs/);
    assert.equal(workspace.collections[0].downloadsEnabled, false);
    assert.equal(workspace.collections[0].watermarkEnabled, true);
    assert.equal(workspace.collections[0].watermarkLabel, "PRIVATE CLIENT PROOF");
    assert.deepEqual(portalWorkspacePageFields(photography, module.pages[0]).map(field => field.label), [
      "Purpose and usage",
      "People or subjects",
      "Locations and access",
      "Timing and deadline",
    ]);
  });

  it("cleans and migrates saved state without losing completed work or new module fields", () => {
    const website = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "website")!;
    const module = portalProductModule(website);
    const saved = createPortalProductWorkspace(website, "designing", 3_000);
    saved.pages[module.pages[0].id].checklist[0] = {
      ...saved.pages[module.pages[0].id].checklist[0],
      complete: true,
      completedAt: 3_100,
      completedBy: "customer@example.test",
      completedByActor: "customer",
    };
    saved.pages[module.pages[0].id].fields[`${module.pages[0].id}-field-1`] = "Create qualified enquiries.";
    saved.pages[module.pages[0].id].outputs[0].status = "approved";
    const cleaned = cleanPortalProductWorkspace(saved, website, "onboarding", 4_000);
    assert.equal(cleaned.stage, "designing");
    assert.equal(cleaned.pages[module.pages[0].id].checklist[0].complete, true);
    assert.equal(cleaned.pages[module.pages[0].id].fields[`${module.pages[0].id}-field-1`], "Create qualified enquiries.");
    assert.equal(cleaned.pages[module.pages[0].id].outputs[0].status, "approved");
    assert.ok(portalWorkspaceProgress(cleaned) > 0);
  });

  it("persists independent product stages and preserves hidden products for later re-use", async () => {
    await storage.ensureHydrated();
    await storage.reset();
    const agency = tenants.createAgency({ name: "Product Workspace Test", slug: "product-workspace-test" });
    const photography = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "photography")!;
    const website = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "website")!;
    const client = tenants.createClient(agency.id, {
      name: "Packaged Client",
      metadata: { portalProducts: [photography, website], portalMode: "onboarding" },
    });

    const workspaces = productWorkspaces.clientProductWorkspaces(client);
    const photoWorkspace = workspaces.find(workspace => workspace.productId === photography.id)!;
    const websiteWorkspace = workspaces.find(workspace => workspace.productId === website.id)!;
    photoWorkspace.stage = "developed-launch";
    photoWorkspace.updates.push({ id: "update_photo", pageId: "gallery", message: "Select the final images.", actor: "agency", author: "Aqua team", createdAt: 5_000 });
    websiteWorkspace.stage = "designing";
    assert.ok(productWorkspaces.saveClientProductWorkspaces(client, workspaces));

    const persisted = tenants.getClientForAgency(agency.id, client.id)!;
    assert.equal(productWorkspaces.clientProductWorkspaces(persisted).find(item => item.productId === photography.id)?.stage, "developed-launch");
    assert.equal(productWorkspaces.clientProductWorkspaces(persisted).find(item => item.productId === website.id)?.stage, "designing");

    const stored = persisted.metadata?.portalProductWorkspaces;
    const websiteOnly = productWorkspaces.reconcileClientProductWorkspaces(persisted, [website], "onboarding");
    assert.ok(websiteOnly[photography.id], "hidden photography state should remain in the store");
    const merged = mergePortalProductWorkspaceStore(stored, [cleanPortalProductWorkspace(websiteOnly[website.id], website)]);
    tenants.updateClient(agency.id, client.id, { metadata: { portalProducts: [photography, website], portalProductWorkspaces: merged } });
    const restored = productWorkspaces.clientProductWorkspaces(tenants.getClientForAgency(agency.id, client.id)!);
    assert.equal(restored.find(item => item.productId === photography.id)?.updates[0]?.message, "Select the final images.");
  });

  it("wires role-aware APIs, authenticated uploads and the live workspace surface", async () => {
    const [route, upload, content, application, views, preview, control] = await Promise.all([
      readFile(new URL("../src/app/api/tenants/product-workspaces/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-files/upload/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-files/content/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_ProductWorkspaceApplication.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/client-preview/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/customer-portal-control/route.ts", import.meta.url), "utf8"),
    ]);
    assert.match(route, /requireRoleForClient/);
    assert.match(route, /set-stage/);
    assert.match(route, /toggle-check/);
    assert.match(route, /request-decision/);
    assert.match(route, /respond-decision/);
    assert.match(route, /attach-file/);
    assert.match(route, /asset-response/);
    assert.match(route, /update-collection/);
    assert.match(route, /customerVisible/);
    assert.match(upload, /50 \* 1024 \* 1024/);
    assert.match(upload, /productId/);
    assert.match(content, /searchParams\.get\("download"\) === "1"/);
    assert.match(content, /downloads are not enabled/);
    assert.match(content, /watermarkedProof/);
    assert.match(content, /image\/webp/);
    assert.match(content, /PRIVATE CLIENT PROOF/);
    assert.match(content, /collection\?\.watermarkEnabled === true/);
    assert.match(application, /Photography galleries|galleries/);
    assert.match(application, /Upload photographs or media/);
    assert.match(application, /Approve collection/);
    assert.match(application, /Selection limit|selectionLimit/);
    assert.match(application, /Watermark on/);
    assert.match(views, /ProductWorkspaceApplication/);
    assert.match(views, /portalWorkspaceProgress/);
    assert.match(preview, /workspaceRole=\{manage \? "agency" : "preview"\}/);
    assert.match(control, /reconcileClientProductWorkspaces/);
  });
});
