import "server-only";

import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import type { CommercialPack } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { listAgencies } from "@/server/tenants";
import { getInstall } from "@/server/pluginInstalls";

export async function findCommercialProposal(token: string): Promise<{
  pack: CommercialPack;
  agencyName: string;
  accept: (acceptedBy: string) => Promise<CommercialPack | null>;
} | null> {
  if (!/^[a-zA-Z0-9_-]{12,160}$/.test(token)) return null;
  ensureLeadsPipelineFoundationRegistered();
  for (const agency of listAgencies()) {
    const install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    if (!install?.enabled) continue;
    const container = containerFor({
      agencyId: agency.id,
      storage: makePluginStorage(install.id) as never,
    });
    const pack = await container.commercial.getByToken(token);
    if (!pack) continue;
    return {
      pack,
      agencyName: agency.name,
      accept: acceptedBy => container.commercial.accept(token, acceptedBy),
    };
  }
  return null;
}
