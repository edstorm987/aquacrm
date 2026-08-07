// T1 R026 smoke — Topbar agency switcher.
// Run via `npm run smoke:topbar-agency-switcher` (tsx --test).
//
// Source-marker style — the route handlers + components live behind
// `server-only` (auth.ts, tenants.ts) so we exercise the contract via
// shipped-source assertions. AquaOasis seed constants are runtime-
// imported (no server-only shim).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// aquaOasisSeed.ts carries `server-only` so we can't import its
// constants under tsx. Source-marker the contract instead.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SWITCHER = join(ROOT, "src", "archive", "multi-agency", "components", "AgencySwitcher.tsx");
const TOPBAR = join(ROOT, "src", "components", "chrome", "Topbar.tsx");
const SIDEBAR = join(ROOT, "src", "components", "chrome", "Sidebar.tsx");
const ROUTE = join(ROOT, "src", "archive", "multi-agency", "api", "agency-switch.ts");
const LIVE_SWITCH_ROUTE = join(ROOT, "src", "app", "api", "auth", "agency-switch", "route.ts");
const LIVE_ADD_ROUTE = join(ROOT, "src", "app", "api", "auth", "agency-add", "route.ts");
const SEED = join(ROOT, "src", "lib", "server", "aquaOasisSeed.ts");
const FOUNDER = join(ROOT, "src", "lib", "server", "founderSeed.ts");
const AGENCY_LAYOUT = join(ROOT, "src", "app", "portal", "agency", "layout.tsx");

describe("Milesymedia bespoke identity", () => {
  it("parks the former agency switcher outside the live component tree", () => {
    assert.equal(existsSync(SWITCHER), true);
    const src = readFileSync(SWITCHER, "utf8");
    assert.ok(src.startsWith('"use client"'));
    assert.ok(src.includes("Archived"));
    assert.equal(existsSync(join(ROOT, "src", "components", "chrome", "AgencySwitcher.tsx")), false);
  });

  it("renders a fixed non-interactive business identity", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    assert.ok(src.includes('data-testid="tenant-identity"'));
    assert.ok(!src.includes("TenantSwitcher"));
    assert.ok(!src.includes("Click to switch"));
  });

  it("keeps the workspace title plain in the top bar", () => {
    const src = readFileSync(TOPBAR, "utf8");
    assert.ok(src.includes("{title}"));
    assert.ok(!src.includes("AgencySwitcher"));
    assert.ok(!src.includes("activeAgencyId"));
  });
});

describe("Single-agency wire-up", () => {
  it("agency layout no longer resolves or passes switchable agencies", () => {
    const src = readFileSync(AGENCY_LAYOUT, "utf8");
    assert.ok(!src.includes("getSessionAgencyIds(session)"));
    assert.ok(!src.includes("getActiveAgencyId(session)"));
    assert.ok(src.includes("const activeLabel = activeCompany?.name ?? agency.name"));
    assert.ok(src.includes("tenantLabel={activeLabel}"));
  });
});

describe("Archived multi-agency endpoints", () => {
  it("removes create/switch from the live API tree", () => {
    assert.equal(existsSync(LIVE_SWITCH_ROUTE), false);
    assert.equal(existsSync(LIVE_ADD_ROUTE), false);
  });

  it("keeps the old implementation in the archive folder", () => {
    assert.equal(existsSync(ROUTE), true);
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.includes("export async function POST"));
    assert.ok(src.includes("assertTenantScope"));
    assert.ok(src.includes("activeAgencyId: agencyId"));
  });
});

describe("AquaOasis demo seed (R026)", () => {
  it("seed constants match the chapter contract", () => {
    const src = readFileSync(SEED, "utf8");
    assert.ok(src.includes('AQUA_OASIS_AGENCY_SLUG = "aquaoasis-demo"'));
    assert.ok(src.includes('AQUA_OASIS_AGENCY_NAME = "AquaOasis Demo"'));
    assert.ok(src.includes('"client-crm"'));
    assert.ok(src.includes('"bookings"'));
    assert.ok(src.includes('"agency-marketing"'));
  });

  it("seed module exports idempotent runner + membership helper", () => {
    const src = readFileSync(SEED, "utf8");
    assert.ok(src.includes("export function seedAquaOasisDemo"));
    assert.ok(src.includes("export function addUserAgencyMembership"));
    // Idempotence guard: short-circuit on existing slug.
    assert.ok(src.includes("getAgencyBySlug(AQUA_OASIS_AGENCY_SLUG)"));
    assert.ok(src.includes("alreadyExisted: true"));
  });

  it("brand kit is teal/heritage-lite + plugin set wired via upsertInstall", () => {
    const src = readFileSync(SEED, "utf8");
    assert.ok(src.includes("#0E7490"), "teal-700 primary");
    assert.ok(src.includes("Cormorant"), "heritage-lite serif heading");
    assert.ok(src.includes("upsertInstall"));
  });

  it("founderSeed wires AquaOasis seed + adds Ed to its agencyIds", () => {
    const src = readFileSync(FOUNDER, "utf8");
    assert.ok(src.includes('await import("./aquaOasisSeed")'));
    assert.ok(src.includes("seedAquaOasisDemo(founder.id)"));
    assert.ok(src.includes("addUserAgencyMembership(founder.id"));
  });
});
