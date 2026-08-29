import "server-only";
// Agency-creation helper that wraps `createAgency` + auto-installs every
// `core: true` plugin at the agency scope. Use this anywhere a new
// agency is created (login bootstrap, demo seed, future agency-onboarding
// wizard) so plugins like fulfillment seed their data on day one.

import { createAgency, type CreateAgencyInput } from "./tenants";
import { installCorePluginsForScope } from "@/built-ins/runtime/_runtime";
import { logActivity } from "./activity";
import { seedDefaultPipelines, migrateClientsToFulfilment } from "./pipelines";
import { getState, mutate } from "./storage";
import type { Agency } from "./types";
import { ensureDefaultAgencyProducts } from "./agencyProducts";
import { ensureDefaultDevelopmentWorkflow } from "./developmentToolkit";

export interface BootstrapAgencyResult {
  agency: Agency;
  installedCorePlugins: string[];
}

/**
 * Marks the new tenant as a TRADING COMPANY'S PORTAL rather than a top-level
 * agency — the third tier the founder settled on 2026-08-20 (holding group →
 * company → clients). See the field docs on `Agency.holdingAgencyId`.
 */
export interface AgencyHoldingLink {
  /** The holding group that holds the company this portal is for. */
  holdingAgencyId: string;
  /** The `TradingCompany.id`, inside that holding group. */
  companyId: string;
}

/**
 * Every company portal in a holding group, oldest first.
 *
 * This is the query the third tier exists to make answerable: without the
 * `holdingAgencyId` stamp a company's portal tenant is indistinguishable from
 * a wholly separate business, and a holding group cannot see what it holds.
 */
export function listHeldCompanyPortals(holdingAgencyId: string): Agency[] {
  if (!holdingAgencyId) return [];
  return Object.values(getState().agencies)
    .filter(agency => agency.holdingAgencyId === holdingAgencyId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** The portal tenant for one company in a holding group, if it has one yet. */
export function getCompanyPortalAgency(holdingAgencyId: string, companyId: string): Agency | null {
  if (!holdingAgencyId || !companyId) return null;
  return listHeldCompanyPortals(holdingAgencyId).find(agency => agency.companyId === companyId) ?? null;
}

export async function bootstrapAgency(
  input: CreateAgencyInput,
  installedBy?: string,
  holding?: AgencyHoldingLink,
): Promise<BootstrapAgencyResult> {
  const agency = createAgency(input);
  // Stamp the holding-group link BEFORE anything else runs against the new
  // tenant, so a plugin seeding into it already sees a company portal rather
  // than a top-level agency. Written here and not in `createAgency` because
  // `server/tenants.ts` is read-only for this plan — this is additive and
  // leaves every other bootstrap caller untouched.
  if (holding?.holdingAgencyId && holding.companyId) {
    mutate(state => {
      const row = state.agencies[agency.id];
      if (!row) return;
      row.holdingAgencyId = holding.holdingAgencyId;
      row.companyId = holding.companyId;
      row.updatedAt = Date.now();
    });
    agency.holdingAgencyId = holding.holdingAgencyId;
    agency.companyId = holding.companyId;
  }
  // T1 R034 — seed default pipelines (fulfilment / leads / sales) before
  // installing core plugins so kanban-aware plugins find a fulfilment
  // pipeline to attach to. Idempotent — safe to call from re-bootstrap.
  seedDefaultPipelines(agency.id);
  // The one default product (Website) is seeded HERE from 2026-08-27, not on
  // the first page view. It used to be a write reachable from eight rendered
  // surfaces and from `/api/portal/search` — issue #21's widest one — and a new
  // tenant's other defaults already live in this function.
  ensureDefaultAgencyProducts(agency.id);
  // The default Development workflow, for the same reason: it used to be
  // created by whichever Development page somebody opened first (issue #21).
  ensureDefaultDevelopmentWorkflow(agency.id, installedBy ?? "system");
  migrateClientsToFulfilment(agency.id);
  await installCorePluginsForScope({ agencyId: agency.id }, installedBy);
  // Snapshot which core plugins ended up installed (mostly diagnostic).
  const { listInstalledForAgencyOnly } = await import("./pluginInstalls");
  const installs = listInstalledForAgencyOnly(agency.id);
  const installedCorePlugins = installs.map(i => i.pluginId);
  logActivity({
    agencyId: agency.id,
    actorUserId: installedBy,
    category: "system",
    action: "agency.bootstrap",
    message: `Agency '${agency.name}' bootstrapped with ${installedCorePlugins.length} core plugin install(s).`,
    metadata: { installedCorePlugins },
  });
  return { agency, installedCorePlugins };
}
