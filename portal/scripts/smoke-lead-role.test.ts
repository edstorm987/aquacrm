// T1 R023 smoke — `lead` role + permission grid + agency-scope guard.
// Run via `npm run smoke:lead-role` (tsx --test).
//
// Mix of pure-runtime checks (types.ts has no server-only shim) and
// source-marker checks for the modules that do (effectiveRole.ts,
// requireAgencyScope.ts, postLoginRedirect.ts).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_ROLES,
  AGENCY_ROLES,
  CLIENT_ROLES,
  LEAD_AGENCY_ID,
  isAgencyRole,
  isClientRole,
  isLeadRole,
} from "../src/server/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EFFECTIVE_ROLE = join(ROOT, "src", "lib", "server", "auth", "effectiveRole.ts");
const REQUIRE_SCOPE = join(ROOT, "src", "lib", "server", "auth", "requireAgencyScope.ts");
const RESOLVER = join(ROOT, "src", "lib", "server", "auth", "postLoginRedirect.ts");
const USERS = join(ROOT, "src", "server", "users.ts");

describe("Lead role — type system (R023)", () => {
  it("`lead` is in ALL_ROLES but not in AGENCY_ROLES or CLIENT_ROLES", () => {
    assert.ok(ALL_ROLES.includes("lead"));
    assert.ok(!AGENCY_ROLES.includes("lead" as never));
    assert.ok(!CLIENT_ROLES.includes("lead" as never));
  });

  it("isLeadRole / isAgencyRole / isClientRole are mutually exclusive for `lead`", () => {
    assert.equal(isLeadRole("lead"), true);
    assert.equal(isAgencyRole("lead"), false);
    assert.equal(isClientRole("lead"), false);
  });

  it("LEAD_AGENCY_ID is a stable sentinel string", () => {
    assert.equal(typeof LEAD_AGENCY_ID, "string");
    assert.ok(LEAD_AGENCY_ID.length > 0);
    assert.equal(LEAD_AGENCY_ID, "agency_lead_global");
  });

  it("non-lead roles still classify correctly after the union extension", () => {
    assert.equal(isAgencyRole("agency-owner"), true);
    assert.equal(isClientRole("client-owner"), true);
    assert.equal(isLeadRole("agency-owner"), false);
    assert.equal(isLeadRole("end-customer"), false);
  });
});

describe("Lead role — effectiveRole.ts source markers (R023)", () => {
  it("effectiveRole has explicit `case \"lead\"` returning EMPTY", () => {
    const src = readFileSync(EFFECTIVE_ROLE, "utf8");
    assert.ok(src.includes('case "lead"'));
    // The lead arm shares EMPTY with the other unscoped roles.
    assert.ok(src.includes("EMPTY"));
  });
});

describe("Lead role — requireAgencyScope.ts (R023)", () => {
  it("file exists with both helpers", () => {
    assert.equal(existsSync(REQUIRE_SCOPE), true);
    const src = readFileSync(REQUIRE_SCOPE, "utf8");
    assert.ok(src.includes("export function requireAgencyScope"));
    assert.ok(src.includes("export function isAgencyScopedSession"));
  });

  it("rejects lead role + LEAD_AGENCY_ID sentinel + missing agencyId", () => {
    const src = readFileSync(REQUIRE_SCOPE, "utf8");
    assert.ok(src.includes("isLeadRole(session.role)"));
    assert.ok(src.includes("LEAD_AGENCY_ID"));
    assert.ok(src.includes("AuthError(403"));
  });
});

describe("Lead role — post-login redirect → /login (standalone portal)", () => {
  it("resolver keeps leads out of portal workspaces until conversion", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "lead"'));
    assert.ok(src.includes('return "/login"'));
    assert.ok(!src.includes('return "/business-os"'));
  });
});

describe("Lead role — users.createUser tolerates global lead (R023)", () => {
  it("CreateUserInput.agencyId is optional + lead defaults to LEAD_AGENCY_ID", () => {
    const src = readFileSync(USERS, "utf8");
    assert.ok(src.includes("agencyId?:"), "agencyId should be optional in input");
    assert.ok(src.includes("LEAD_AGENCY_ID"));
    assert.ok(src.includes('input.role === "lead"'));
    assert.ok(src.match(/agencyId required for role/), "non-lead roles still reject missing agencyId at runtime");
  });

  it("updateUser can relink a converted lead into an agency/client portal scope", () => {
    const src = readFileSync(USERS, "utf8");
    assert.ok(src.includes("agencyId?: string"), "UpdateUserPatch should accept agencyId");
    assert.ok(src.includes("agencyIds?: string[]"), "UpdateUserPatch should accept agencyIds");
    assert.ok(src.includes("agencyId: patch.agencyId ?? stored.agencyId"));
    assert.ok(src.includes("agencyIds: patch.agencyIds ?? stored.agencyIds"));
  });
});
