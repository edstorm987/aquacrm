import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

describe("company products workspace", () => {
  it("keeps products inside Company without a duplicate sidebar item", () => {
    const company = read("src", "app", "portal", "agency", "company", "_CompanyWorkspace.tsx");
    const page = read("src", "app", "portal", "agency", "company", "page.tsx");
    const sidebar = read("src", "lib", "chrome", "sidebarLayout.ts");

    assert.ok(company.includes('type View = "overview" | "direction" | "plans" | "products" | "connections" | "legal"'));
    assert.ok(company.includes('["products", "Products", Package]'));
    assert.ok(company.includes("<ProductsWorkspace"));
    assert.ok(company.includes('requestedView === "products"'));
    assert.ok(company.includes('url.searchParams.set("view", "products")'));
    assert.ok(company.includes('url.searchParams.delete("view")'));
    assert.ok(page.includes("ensureDefaultAgencyProducts(session.agencyId)"));
    assert.ok(page.includes("initialProducts={products}"));
    assert.ok(!sidebar.includes('id: "products",    label: "Products"'));
  });

  it("redirects the old catalogue route and returns product details to Company", () => {
    const legacyPage = read("src", "app", "portal", "agency", "products", "page.tsx");
    const detail = read("src", "app", "portal", "agency", "products", "[productId]", "_ProductDetailWorkspace.tsx");

    assert.ok(legacyPage.includes('redirect("/portal/agency/company?view=products")'));
    assert.ok(detail.includes('href="/portal/agency/company?view=products"'));
  });
});
