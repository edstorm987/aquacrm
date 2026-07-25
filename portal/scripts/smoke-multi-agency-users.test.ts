// T1 R025 smoke — multi-agency user schema (`agencyIds[]`).
// Run via `npm run smoke:multi-agency-users` (tsx --test).
//
// Two test surfaces:
//   - Pure runtime: `migrateUsersSchema` (no server-only) walks a fake
//     users map and converts legacy single-agency rows in place.
//   - Source-marker: createUser writes both shapes, issueSession derives
//     agencyIds + activeAgencyId, auth.ts exports the new helpers.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateUsersSchema } from "../src/server/userSchemaMigration";
import { USER_SCHEMA_V, LEAD_AGENCY_ID } from "../src/server/types";
import type { ServerUser } from "../src/server/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const USERS = join(ROOT, "src", "server", "users.ts");
const AUTH = join(ROOT, "src", "lib", "server", "auth.ts");
const TYPES = join(ROOT, "src", "server", "types.ts");
const STORAGE = join(ROOT, "src", "server", "storage.ts");

function legacyUser(over: Partial<ServerUser> = {}): ServerUser {
  // Cast through `unknown` — the row is intentionally pre-migration
  // (no `agencyIds` field) so it doesn't satisfy the post-R025 type.
  const base = {
    id: "u1",
    email: "x@y.z",
    name: "X",
    passwordHash: "scrypt$$",
    role: "agency-owner",
    agencyId: "agency_a",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
  return base as unknown as ServerUser;
}

describe("Multi-agency users — migration runner (R025)", () => {
  it("converts legacy single-agency row → agencyIds:[agencyId]", () => {
    const users = { u1: legacyUser() };
    const stats = migrateUsersSchema(users);
    assert.equal(stats.upgraded, 1);
    assert.equal(stats.scanned, 1);
    assert.equal(stats.schemaVersion, USER_SCHEMA_V);
    assert.deepEqual(users.u1.agencyIds, ["agency_a"]);
    assert.equal(users.u1.agencyId, "agency_a");
  });

  it("is idempotent — re-running on migrated rows is a no-op", () => {
    const users = { u1: legacyUser() };
    migrateUsersSchema(users);
    const second = migrateUsersSchema(users);
    assert.equal(second.upgraded, 0);
    assert.deepEqual(users.u1.agencyIds, ["agency_a"]);
  });

  it("lead role migrates to empty agencyIds (global tenant)", () => {
    const users: Record<string, ServerUser> = {
      u1: legacyUser({ role: "lead", agencyId: LEAD_AGENCY_ID }),
    };
    migrateUsersSchema(users);
    assert.deepEqual(users.u1.agencyIds, []);
    // Sentinel preserved as legacy mirror.
    assert.equal(users.u1.agencyId, LEAD_AGENCY_ID);
  });

  it("preserves existing agencyIds + re-mirrors agencyId when missing", () => {
    const users = {
      u1: {
        ...legacyUser(),
        agencyIds: ["agency_a", "agency_b"],
        agencyId: "",
      } as ServerUser,
    };
    migrateUsersSchema(users);
    assert.deepEqual(users.u1.agencyIds, ["agency_a", "agency_b"]);
    assert.equal(users.u1.agencyId, "agency_a");
  });
});

describe("Multi-agency users — schema (R025)", () => {
  it("ServerUser carries agencyIds + legacy agencyId mirror", () => {
    const src = readFileSync(TYPES, "utf8");
    assert.ok(src.includes("agencyIds: string[]"));
    assert.ok(src.match(/agencyId:\s*string;\s+\/\/\s*legacy mirror/), "agencyId should be marked legacy mirror");
    assert.ok(src.includes("USER_SCHEMA_V"));
  });

  it("SessionPayload gains activeAgencyId + agencyIds", () => {
    const src = readFileSync(TYPES, "utf8");
    assert.ok(src.includes("activeAgencyId?:"));
    assert.ok(src.includes("agencyIds?:"));
  });
});

describe("Multi-agency users — createUser writes both shapes (R025)", () => {
  it("createUser sets agencyIds: [agencyId] for non-lead, [] for lead", () => {
    const src = readFileSync(USERS, "utf8");
    assert.ok(src.includes("const agencyIds = input.role === \"lead\" ? [] : [agencyId];"));
    assert.ok(src.includes("agencyIds,"));
  });
});

describe("Multi-agency users — issueSession + helpers (R025)", () => {
  it("issueSession derives activeAgencyId + agencyIds defaults", () => {
    const src = readFileSync(AUTH, "utf8");
    assert.ok(src.includes("activeAgencyId ?? input.agencyId"));
    assert.ok(src.includes("input.agencyIds && input.agencyIds.length"));
  });

  it("auth.ts exports getSessionAgencyIds + getActiveAgencyId + getActiveAgencyIds + assertTenantScope", () => {
    const src = readFileSync(AUTH, "utf8");
    assert.ok(src.includes("export function getSessionAgencyIds"));
    assert.ok(src.includes("export function getActiveAgencyId"));
    assert.ok(src.includes("export function getActiveAgencyIds"));
    assert.ok(src.includes("export function assertTenantScope"));
    assert.ok(src.includes('"tenant_scope_mismatch"'));
  });
});

describe("Multi-agency users — storage hydrate runs migration (R025)", () => {
  it("ensureHydrated calls migrateUsersSchema after parseBlob", () => {
    const src = readFileSync(STORAGE, "utf8");
    assert.ok(src.includes("migrateUsersSchema"));
    assert.ok(src.includes("./userSchemaMigration"));
  });
});
