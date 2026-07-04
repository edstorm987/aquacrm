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
const SWITCHER = join(ROOT, "src", "components", "chrome", "AgencySwitcher.tsx");
const TOPBAR = join(ROOT, "src", "components", "chrome", "Topbar.tsx");
const ROUTE = join(ROOT, "src", "app", "api", "auth", "agency-switch", "route.ts");
const SEED = join(ROOT, "src", "lib", "server", "aquaOasisSeed.ts");
const FOUNDER = join(ROOT, "src", "lib", "server", "founderSeed.ts");
const AGENCY_LAYOUT = join(ROOT, "src", "app", "portal", "agency", "layout.tsx");

describe("Topbar agency switcher — component (R026)", () => {
  it("AgencySwitcher.tsx exists + client-component", () => {
    assert.equal(existsSync(SWITCHER), true);
    const src = readFileSync(SWITCHER, "utf8");
    assert.ok(src.startsWith('"use client"'));
    assert.ok(src.includes("export function AgencySwitcher"));
    assert.ok(src.includes("/api/auth/agency-switch"));
  });

  it("hides for single-agency users (≤1 entry returns null)", () => {
    const src = readFileSync(SWITCHER, "utf8");
    assert.ok(src.includes("agencies.length <= 1"));
    assert.ok(src.includes("return null"));
  });

  it("renders brand swatch + currently-active marker", () => {
    const src = readFileSync(SWITCHER, "utf8");
    assert.ok(src.includes("background: active.swatch"));
    assert.ok(src.includes('a.id === activeAgencyId'));
    assert.ok(src.includes("✓"));
  });
});

describe("Topbar wire-up (R026)", () => {
  it("Topbar.tsx accepts agencies + activeAgencyId props + renders switcher", () => {
    const src = readFileSync(TOPBAR, "utf8");
    assert.ok(src.includes("agencies?: AgencyOption[]"));
    assert.ok(src.includes("activeAgencyId?: string"));
    assert.ok(src.includes("<AgencySwitcher"));
  });

  it("agency layout passes session.agencyIds → resolved AgencyOption[] + activeAgencyId", () => {
    const src = readFileSync(AGENCY_LAYOUT, "utf8");
    assert.ok(src.includes("getSessionAgencyIds(session)"));
    assert.ok(src.includes("getActiveAgencyId(session)"));
    assert.ok(src.includes("a.brand?.primaryColor"));
  });
});

describe("/api/auth/agency-switch route (R026)", () => {
  it("file exists + POST validates + assertTenantScope", () => {
    assert.equal(existsSync(ROUTE), true);
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.includes("export async function POST"));
    assert.ok(src.includes("assertTenantScope"));
    assert.ok(src.includes("getSessionFromRequest"));
  });

  it("re-issues session with activeAgencyId + agencyIds + activity log", () => {
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.includes("activeAgencyId: agencyId"));
    assert.ok(src.includes("issueSession({"));
    assert.ok(src.includes('action: "agency.switch"'));
    assert.ok(src.includes("resolvePostLoginPath"));
  });

  it("rejects deleted/suspended agencies even when membership matches", () => {
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.match(/agency\.status\s*!==\s*"active"/));
    assert.ok(src.includes('"agency_inactive"'));
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
