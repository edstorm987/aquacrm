import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

describe("company specialist systems", () => {
  it("keeps one canonical services workspace reachable from Battle Table", () => {
    const company = read("src", "app", "portal", "agency", "company", "_CompanyWorkspace.tsx");
    const page = read("src", "app", "portal", "agency", "company", "page.tsx");
    const sidebar = read("src", "lib", "chrome", "sidebarLayout.ts");
    const battleTable = read("src", "app", "portal", "agency", "_BattleTableWorkspace.tsx");

    assert.ok(company.includes('type View = "overview" | "direction" | "plans" | "capacity" | "products" | "connections" | "legal"'));
    assert.ok(company.includes("CompanyDashboard"));
    assert.ok(company.includes("All companies combined"));
    assert.ok(company.includes("AggregateRow"));
    assert.ok(company.includes("CompanyPieChart"));
    assert.ok(company.includes("companyPieSegments"));
    assert.ok(page.includes("serviceBrands={companies}"));
    assert.ok(company.includes('href="/portal/agency/company?view=companies"'));
    assert.ok(company.includes('href="/portal/agency?station=battle"'));
    assert.ok(battleTable.includes('href: "/portal/agency/fulfilment?view=services"'));
    assert.ok(company.includes('["products", "Products", Package]'));
    assert.ok(company.includes("<ProductsWorkspace"));
    assert.ok(page.includes('requestedView === "companies"'));
    assert.ok(company.includes('requestedView === "products"'));
    assert.ok(company.includes('url.searchParams.set("view", "products")'));
    assert.ok(company.includes('url.searchParams.delete("view")'));
    assert.ok(page.includes("ensureDefaultAgencyProducts(session.agencyId)"));
    assert.ok(page.includes("initialProducts={products}"));
    assert.ok(!sidebar.includes('id: "products",    label: "Products"'));
    assert.ok(!sidebar.includes('id: "company"'));
  });

  it("redirects legacy catalogue routes and returns product details to Services", () => {
    const legacyPage = read("src", "app", "portal", "agency", "products", "page.tsx");
    const detail = read("src", "app", "portal", "agency", "products", "[productId]", "_ProductDetailWorkspace.tsx");
    const companyPage = read("src", "app", "portal", "agency", "company", "page.tsx");
    const fulfilment = read("src", "app", "portal", "agency", "fulfilment", "_FulfilmentWorkspace.tsx");
    const fulfilmentPage = read("src", "app", "portal", "agency", "fulfilment", "page.tsx");

    assert.ok(legacyPage.includes('redirect("/portal/agency/fulfilment?view=services")'));
    assert.ok(detail.includes('href="/portal/agency/fulfilment?view=services"'));
    assert.ok(companyPage.includes('if (requestedView === "products") redirect("/portal/agency/fulfilment?view=services")'));
    assert.ok(fulfilmentPage.includes('if (requested.view === "products") redirect("/portal/agency/fulfilment?view=services")'));
    assert.ok(fulfilment.includes('{ id: "services", label: "Services", icon: Layers3 }'));
    assert.ok(!fulfilment.includes('{ id: "products", label: "Product editor"'));
    assert.ok(fulfilment.includes('embeddedLabel="Service workspaces"'));
  });
});
