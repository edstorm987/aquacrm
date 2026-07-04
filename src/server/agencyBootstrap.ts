import "server-only";
// Agency-creation helper that wraps `createAgency` + auto-installs every
// `core: true` plugin at the agency scope. Use this anywhere a new
// agency is created (login bootstrap, demo seed, future agency-onboarding
// wizard) so plugins like fulfillment seed their data on day one.

import { createAgency, type CreateAgencyInput } from "./tenants";
import { installCorePluginsForScope } from "@/plugins/_runtime";
import { logActivity } from "./activity";
import { seedDefaultPipelines, migrateClientsToFulfilment } from "./pipelines";
import type { Agency } from "./types";

export interface BootstrapAgencyResult {
  agency: Agency;
  installedCorePlugins: string[];
}

export async function bootstrapAgency(
  input: CreateAgencyInput,
  installedBy?: string,
): Promise<BootstrapAgencyResult> {
  const agency = createAgency(input);
  // T1 R034 — seed default pipelines (fulfilment / leads / sales) before
  // installing core plugins so kanban-aware plugins find a fulfilment
  // pipeline to attach to. Idempotent — safe to call from re-bootstrap.
  seedDefaultPipelines(agency.id);
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
