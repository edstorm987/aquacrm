import "server-only";

// Effective-role resolver (T1 R7 — chapter
// `04-effective-role-resolver.md`).
//
// Maps a session to the agency-hr "effective role" — the seed
// `CustomRole` whose permission grid drives sidebar / page visibility.
// v1 keys off `session.role` enum directly:
//
//   agency-owner   → Founder    (all 18 perms)
//   agency-manager → Admin      (17 perms — all minus `roles.edit`)
//   agency-staff   → Designer   (3 perms — narrow operating scope)
//   client-* / end-customer → empty permissions
//
// The deeper Q-ASSUMED — read user's `agencyEmployee.customRoleId`
// from agency-hr storage at request time — is the documented
// hookup point for R+1. Foundation has no container resolver for
// plugin storage today, so we lean on the role-enum mapping as the
// v1 story. Once a `getCurrentEmployeeRole(session)` resolver lands,
// it overrides this default before falling back to the enum mapping.

import type { SessionPayload } from "@/server/types";
// NOTE: agency-hr is symlinked into node_modules at install time, but
// the live exports map there hasn't been rebuilt to expose
// `ALL_PERMISSION_KEYS` / `PermissionKey`. Import directly from the
// workspace path so we always get the on-disk source. The relative
// hop walks `portal/src/lib/server/` → `portal/src/lib/` → `portal/src/`
// → `portal/` → `04-the-final-portal/` → `plugins/agency-hr/...`.
import { DEFAULT_ROLES } from "../../../src/built-ins/modules/agency-hr/src/server/roles";
import { ALL_PERMISSION_KEYS } from "../../../src/built-ins/modules/agency-hr/src/lib/domain";
import type { PermissionKey } from "../../../src/built-ins/modules/agency-hr/src/lib/domain";

export type { PermissionKey };
export { ALL_PERMISSION_KEYS };

export interface EffectiveRole {
  roleLabel: string;            // "Founder" / "Admin" / "Designer" / etc.
  permissions: readonly PermissionKey[];
  isFounder: boolean;
}

const EMPTY: EffectiveRole = { roleLabel: "None", permissions: [], isFounder: false };

function findSeed(label: string): EffectiveRole {
  const seed = DEFAULT_ROLES.find(r => r.label === label);
  if (!seed) return EMPTY;
  return {
    roleLabel: seed.label,
    permissions: seed.permissions,
    isFounder: seed.label === "Founder",
  };
}

export function effectiveRole(session: SessionPayload | null | undefined): EffectiveRole {
  if (!session) return EMPTY;
  switch (session.role) {
    case "agency-owner":
      return findSeed("Founder");
    case "agency-manager":
      return findSeed("Admin");
    case "agency-staff":
      return findSeed("Designer");
    case "client-owner":
    case "client-staff":
    case "freelancer":
    case "end-customer":
    case "lead":
      // R023: lead role has no agency-scoped permissions (reads only its
      // own user record via `account.read` / `account.update.email-name`,
      // which live outside the permission grid in /portal/account).
      return EMPTY;
    default:
      return EMPTY;
  }
}

// Permission-set helpers used by Sidebar + RequirePermission. Founder
// short-circuits — Founder never gets gated regardless of declared
// `requires` (matches prompt's "Founder always sees everything").
export function hasAllPermissions(
  effective: EffectiveRole,
  requires: readonly PermissionKey[],
): boolean {
  if (effective.isFounder) return true;
  if (requires.length === 0) return true;
  const set = new Set(effective.permissions);
  return requires.every(p => set.has(p));
}
