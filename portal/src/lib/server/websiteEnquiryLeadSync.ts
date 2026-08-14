import "server-only";

import { containerFor } from "@aqua/plugin-leads-pipeline/server";

import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";

export async function recordWebsiteEnquiryLeadContact(input: {
  agencyId: string;
  leadId?: string;
  actorUserId: string;
  channel: string;
  outcome: string;
  note?: string;
  at?: number;
  incrementSentCount?: boolean;
}): Promise<boolean> {
  if (!input.leadId) return false;
  try {
    ensureLeadsPipelineFoundationRegistered();
    const install = getInstall({ agencyId: input.agencyId }, "leads-pipeline");
    if (!install?.enabled) return false;
    const { leads } = containerFor({ agencyId: input.agencyId, storage: makePluginStorage(install.id) as never });
    return Boolean(await leads.recordContact(input.leadId, {
      at: input.at,
      channel: input.channel,
      outcome: input.outcome,
      note: input.note,
      incrementSentCount: input.incrementSentCount,
    }, input.actorUserId));
  } catch (error) {
    console.error("[website-enquiries] lead contact sync failed", error);
    return false;
  }
}
