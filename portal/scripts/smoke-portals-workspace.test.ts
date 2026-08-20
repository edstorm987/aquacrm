import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

describe("agency portals workspace", () => {
  it("provides one central library and editor route", () => {
    const page = read("src", "app", "portal", "agency", "portals", "page.tsx");
    const data = read("src", "app", "portal", "agency", "portals", "_portalWorkspaceData.ts");
    const workspace = read("src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx");

    assert.ok(page.includes("portalWorkspaceData"));
    assert.ok(data.includes("listClients(agencyId, { includeArchived: true })"));
    assert.ok(data.includes("ensureDefaultAgencyProducts"));
    assert.ok(data.includes("listAgencyProducts"));
    assert.ok(workspace.includes('label="All portals"'));
    assert.ok(workspace.includes('label="Demo templates"'));
    assert.ok(workspace.includes('label="Dev Editor Engine"'));
    assert.ok(workspace.includes("Search client, email, plan or brand"));
    assert.ok(workspace.includes("/portal/agency/portals/editor"));
  });

  it("previews the canonical live portal and connects products to the real studio", () => {
    const page = read("src", "app", "portal", "agency", "portals", "page.tsx");
    const workspace = read("src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx");
    const studio = read("src", "app", "portal", "agency", "portals", "editor", "_ClientPortalStudio.tsx");
    const products = read("src", "app", "portal", "agency", "products", "_ProductsWorkspace.tsx");
    const productDetail = read("src", "app", "portal", "agency", "products", "[productId]", "_ProductDetailWorkspace.tsx");
    const conversion = read("src", "built-ins", "modules", "leads-pipeline", "src", "api", "handlers.ts");
    const portalProducts = read("src", "lib", "portal", "portalProducts.ts");
    const customerPortal = read("src", "app", "portal", "customer", "_CustomerPortalViews.tsx");

    assert.ok(page.includes('requestedView === "templates"'));
    assert.ok(workspace.includes("CanonicalPortalTemplatePreview"));
    assert.ok(workspace.includes("Stunning Standard"));
    assert.ok(workspace.includes("portalScope=template"));
    assert.ok(workspace.includes("<iframe"));
    assert.ok(workspace.includes('embedded=1'));
    assert.ok(workspace.includes("/portal/agency/portals/editor?scope=template"));
    assert.ok(workspace.includes("/portal/agency/products/${product.id}"));
    assert.ok(workspace.includes("View template"));
    assert.ok(workspace.includes("Edit template"));
    assert.ok(workspace.includes("productId=${encodeURIComponent(product.id)}"));
    assert.ok(studio.includes('portalDraft: "1"'));
    assert.ok(studio.includes('aria-label="Portal template"'));
    assert.ok(studio.includes('target="_blank"'));
    assert.ok(studio.includes("Versions"));
    assert.ok(products.includes("PORTAL_PRODUCT_CATALOG"));
    assert.ok(products.includes("portalTemplateKey"));
    assert.ok(products.includes("Lifecycle stage copy"));
    assert.ok(productDetail.includes("Portal template"));
    assert.ok(productDetail.includes("Lifecycle copy"));
    assert.ok(productDetail.includes("Open template editor"));
    assert.ok(products.includes("Edit this product's portal template"));
    assert.ok(conversion.includes("catalogKey: product.portalTemplateKey"));
    assert.ok(conversion.includes("stageFocusOverrides: product.portalStageFocus"));
    assert.ok(conversion.includes("supportCta: product.portalSupportCta"));
    assert.ok(portalProducts.includes("stageFocusOverrides"));
    assert.ok(customerPortal.includes("configuredSupportCta"));
  });

  it("uses the real client preview and editing flows", () => {
    const workspace = read("src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx");

    assert.ok(workspace.includes("/client-preview/${portal.id}"));
    assert.ok(workspace.includes("/portal/clients/${portal.id}?tab=portal"));
    assert.ok(workspace.includes("/portal/agency/portals/editor?scope=client&clientId=${portal.id}"));
    assert.ok(workspace.includes("Create portal"));
  });

  it("keeps the editor out of Settings to avoid duplicate controls", () => {
    const settings = read("src", "app", "portal", "agency", "settings", "SettingsTabs.tsx");
    const fulfilment = read("src", "app", "portal", "agency", "fulfilment", "_FulfilmentWorkspace.tsx");
    const expenses = read("src", "built-ins", "modules", "agency-finance", "src", "components", "ExpensesList.tsx");
    const search = read("src", "app", "api", "portal", "search", "route.ts");
    const forms = read("src", "app", "portal", "agency", "portals", "forms", "page.tsx");

    assert.ok(!settings.includes('id: "portal-editor"'));
    assert.ok(settings.includes('["Fulfilment command centre", "/portal/agency/fulfilment"]'));
    assert.ok(fulfilment.includes('id: "portals", label: "Portals"'));
    assert.ok(fulfilment.includes('<PortalsWorkspace portals={portals}'));
    assert.ok(expenses.includes("/portal/agency/portals/forms#forms/expenses"));
    assert.ok(search.includes("/portal/agency/portals/forms"));
    assert.ok(forms.includes("PortalEditorPanel"));
  });
});
