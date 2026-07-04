import "server-only";
// AquaOasis demo agency seed (T1 R026 — chapter
// `04-topbar-agency-switcher.md`).
//
// Provisions a second agency on first boot so Ed-as-master sees ≥2
// agencies in the Topbar switcher. Idempotent — `getAgencyBySlug`
// short-circuits subsequent runs. Brand kit is cool teal +
// heritage-lite; plugin install set: client-crm + bookings +
// agency-marketing.
//
// Founder seed (R024) calls `seedAquaOasisDemo` after Milesy Media
// lands. The Founder user gets AquaOasis appended to `agencyIds[]`
// so the switcher renders for them out-of-the-box.

import { ensureHydrated, mutate } from "@/server/storage";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { getAgencyBySlug } from "@/server/tenants";
import { upsertInstall } from "@/server/pluginInstalls";
import type { Agency, ServerUser } from "@/server/types";

export const AQUA_OASIS_AGENCY_SLUG = "aquaoasis-demo";
export const AQUA_OASIS_AGENCY_NAME = "AquaOasis Demo";
export const AQUA_OASIS_PLUGIN_IDS = [
  "client-crm",
  "bookings",
  "agency-marketing",
] as const;

const AQUA_OASIS_BRAND = {
  primaryColor: "#0E7490",      // teal-700 — cool clinic palette
  secondaryColor: "#E0F2FE",    // sky-100 — heritage-lite cream-leaning surface
  accentColor: "#0891B2",       // cyan-600 — accent
  fontHeading: "\"Cormorant Garamond\", serif",
  fontBody: "\"Inter\", system-ui, sans-serif",
  borderRadius: "10px",
} as const;

interface SeedResult {
  agency: Agency;
  installedPlugins: string[];
  alreadyExisted: boolean;
}

let seedPromise: Promise<SeedResult> | null = null;

export function seedAquaOasisDemo(installedBy?: string): Promise<SeedResult> {
  if (!seedPromise) seedPromise = run(installedBy);
  return seedPromise;
}

async function run(installedBy?: string): Promise<SeedResult> {
  await ensureHydrated();

  const existing = getAgencyBySlug(AQUA_OASIS_AGENCY_SLUG);
  if (existing) {
    return {
      agency: existing,
      installedPlugins: [...AQUA_OASIS_PLUGIN_IDS],
      alreadyExisted: true,
    };
  }

  const { agency } = await bootstrapAgency(
    {
      name: AQUA_OASIS_AGENCY_NAME,
      slug: AQUA_OASIS_AGENCY_SLUG,
      brand: AQUA_OASIS_BRAND,
    },
    installedBy,
  );
  // Bootstrap installs every core plugin; layer the named non-core set
  // on top via upsertInstall (idempotent — re-running the seed is a
  // no-op once the agency exists).
  for (const pluginId of AQUA_OASIS_PLUGIN_IDS) {
    upsertInstall({
      pluginId,
      scope: { agencyId: agency.id },
      enabled: true,
      config: {},
      features: {},
      installedBy,
    });
  }
  return {
    agency,
    installedPlugins: [...AQUA_OASIS_PLUGIN_IDS],
    alreadyExisted: false,
  };
}

// Append agencyId to a user's `agencyIds[]` (deduped). Used by founder
// seed to make Ed a master across Milesy Media + AquaOasis.
export function addUserAgencyMembership(userId: string, agencyId: string): void {
  mutate(state => {
    for (const key of Object.keys(state.users)) {
      const u = state.users[key] as ServerUser | undefined;
      if (!u || u.id !== userId) continue;
      const ids = Array.isArray(u.agencyIds) ? u.agencyIds.slice() : [];
      if (!ids.includes(agencyId)) ids.push(agencyId);
      u.agencyIds = ids;
      // sessionRev bump so existing cookies revalidate w/ membership change.
      u.sessionRev = (u.sessionRev ?? 0) + 1;
      u.updatedAt = Date.now();
      return;
    }
  });
}

// Test helper — purely for the smoke to reset module-level cache.
export function _resetAquaOasisSeedForTests(): void {
  seedPromise = null;
}

