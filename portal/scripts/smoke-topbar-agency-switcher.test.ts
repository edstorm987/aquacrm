// One-owner-workspace smoke. The historical filename is retained so existing
// CI commands keep working after retiring the agency/company switchers.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INTERNAL_WORKSPACE = join(ROOT, "src", "lib", "shared", "internalWorkspace.ts");
const AGENCY_LAYOUT = join(ROOT, "src", "app", "portal", "agency", "layout.tsx");
const FOUNDER = join(ROOT, "src", "lib", "server", "seeds", "founderSeed.ts");
const COMPANY_CONTEXT = join(ROOT, "src", "lib", "server", "tradingCompanyContext.ts");
const SIDEBAR = join(ROOT, "src", "components", "chrome", "Sidebar.tsx");
const ARCHIVED_SWITCHER = join(ROOT, "src", "archive", "multi-agency", "components", "AgencySwitcher.tsx");
const LIVE_AGENCY_SWITCHER = join(ROOT, "src", "components", "chrome", "AgencySwitcher.tsx");
const LIVE_COMPANY_SWITCHER = join(ROOT, "src", "components", "chrome", "CompanyContextSwitcher.tsx");
const LIVE_COMPANY_CONTEXT_ROUTE = join(ROOT, "src", "app", "api", "auth", "company-context", "route.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("AquaOasis-Web internal workspace", () => {
  it("defines one canonical owner identity", () => {
    const src = read(INTERNAL_WORKSPACE);
    assert.ok(src.includes('INTERNAL_WORKSPACE_NAME = "AquaOasis-Web"'));
    assert.ok(src.includes('INTERNAL_WORKSPACE_SUBTITLE = "One business. Every service."'));
  });

  it("uses the canonical identity throughout the owner chrome", () => {
    const src = read(AGENCY_LAYOUT);
    assert.ok(src.includes("tenantLabel={INTERNAL_WORKSPACE_NAME}"));
    assert.ok(src.includes("title={INTERNAL_WORKSPACE_NAME}"));
    assert.ok(src.includes("subtitle={INTERNAL_WORKSPACE_SUBTITLE}"));
    assert.ok(!src.includes("CompanyContextSwitcher"));
    assert.ok(!src.includes("activeCompany"));
  });

  it("keeps service brands as record attribution, not hidden workspaces", () => {
    const src = read(COMPANY_CONTEXT);
    assert.ok(src.includes("record-level service and client-facing brand attribution"));
    assert.ok(src.includes("return null"));
    assert.ok(!src.includes("cookies()"));
  });

  it("seeds the founder into AquaOasis-Web without a second demo agency", () => {
    const src = read(FOUNDER);
    assert.ok(src.includes("DEFAULT_FOUNDER_AGENCY_NAME = INTERNAL_WORKSPACE_NAME"));
    assert.ok(src.includes("ensureZimanteTradingCompanies"));
    assert.ok(!src.includes("seedAquaOasisDemo"));
    assert.ok(!src.includes("addUserAgencyMembership"));
  });
});

describe("Retired owner workspace switching", () => {
  it("keeps the former multi-agency UI parked outside the live component tree", () => {
    assert.equal(existsSync(ARCHIVED_SWITCHER), true);
    assert.equal(existsSync(LIVE_AGENCY_SWITCHER), false);
    assert.equal(existsSync(LIVE_COMPANY_SWITCHER), false);
    assert.equal(existsSync(LIVE_COMPANY_CONTEXT_ROUTE), false);
    assert.ok(!read(SIDEBAR).includes("TenantSwitcher"));
  });
});
