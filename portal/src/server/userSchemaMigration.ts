// R025 — multi-agency user schema migration.
//
// Walks state.users and rewrites legacy single-agency rows into the
// multi-agency shape. Idempotent: rows already carrying `agencyIds[]`
// pass through untouched. The runner is invoked from `ensureHydrated`
// after the cache loads from disk; it also runs lazily before any
// `createUser` call so writes never land in the legacy shape.
//
// The legacy `agencyId` field is preserved as a mirror — 56+ callsites
// read it directly and we don't want to sweep them all in one round.
// Lead users (chapter #127) carry `agencyIds: []` (no real agency).

import type { ServerUser } from "./types";
import { LEAD_AGENCY_ID, USER_SCHEMA_V } from "./types";

interface UserMapLike {
  [key: string]: ServerUser;
}

export interface MigrationStats {
  scanned: number;
  upgraded: number;
  schemaVersion: number;
}

// Run the migration over a users map. Returns counts for telemetry +
// smoke. Mutates the user records in place (callers are inside a
// `mutate(state => ...)` block or the post-hydrate hook).
export function migrateUsersSchema(users: UserMapLike): MigrationStats {
  let upgraded = 0;
  const keys = Object.keys(users);
  for (const key of keys) {
    const u = users[key];
    if (!u) continue;
    if (Array.isArray(u.agencyIds)) {
      // Already migrated. Re-mirror agencyId in case it drifted.
      if (!u.agencyId) {
        u.agencyId = u.agencyIds[0] ?? LEAD_AGENCY_ID;
      }
      continue;
    }
    // Legacy single-agency row. Build the canonical list.
    const agencyId = u.agencyId ?? "";
    const agencyIds = u.role === "lead"
      ? []
      : agencyId
        ? [agencyId]
        : [];
    u.agencyIds = agencyIds;
    upgraded += 1;
  }
  return {
    scanned: keys.length,
    upgraded,
    schemaVersion: USER_SCHEMA_V,
  };
}
