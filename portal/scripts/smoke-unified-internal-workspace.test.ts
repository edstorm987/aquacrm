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

describe("one AquaOasis-Web internal workspace", () => {
  it("shows every client and product without active-brand filtering", () => {
    const clients = read("src", "app", "portal", "clients", "page.tsx");
    const dashboard = read("src", "app", "portal", "agency", "page.tsx");
    const products = read("src", "app", "portal", "agency", "products", "page.tsx");
    const productApi = read("src", "app", "api", "portal", "products", "route.ts");

    for (const src of [clients, dashboard, products, productApi]) {
      assert.ok(!src.includes("getActiveTradingCompanyId"));
      assert.ok(!src.includes("recordBelongsToCompany"));
    }
    assert.ok(clients.includes("listTradingCompanies"));
    assert.ok(clients.includes("brands={serviceBrands.map"));
    assert.ok(products.includes("listAgencyProducts(session.agencyId, true)"));
  });

  it("requires client-facing brand selection to be explicit and validated", () => {
    const form = read("src", "app", "portal", "agency", "_NewClientButton.tsx");
    const route = read("src", "app", "api", "portal", "fulfillment", "clients", "route.ts");

    assert.ok(form.includes("Client-facing brand"));
    assert.ok(form.includes("companyId: state.clientFacingBrandId || undefined"));
    assert.ok(form.includes("clientFacingBrandId: state.clientFacingBrandId || undefined"));
    assert.ok(form.includes("What are we helping with?"));
    assert.ok(!form.includes("selectedServiceBrandIds"));
    assert.ok(route.includes("body.companyId?.trim()"));
    assert.ok(route.includes("getTradingCompany(agencyId, companyId)"));
    assert.ok(route.includes("companyId: companyId || undefined"));
    assert.ok(!route.includes("getActiveTradingCompanyId"));
  });

  it("keeps service brands available for products without making them workspaces", () => {
    const workspace = read("src", "app", "portal", "agency", "products", "_ProductsWorkspace.tsx");
    const context = read("src", "lib", "server", "tradingCompanyContext.ts");

    assert.ok(workspace.includes("Shared AquaOasis-Web offer"));
    assert.ok(workspace.includes("companyIds"));
    assert.ok(context.includes("return null"));
  });
});
