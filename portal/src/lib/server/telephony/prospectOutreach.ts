import "server-only";

// Server-side prospect outreach: enforce, then record — in the SAME request
// that performs the delivery.
//
// Ed's findings, 2026-08-30: *"Call/email requests can therefore contact an
// opted-out or uninspected prospect"* and *"delivery and Journey logging are
// separate operations ... navigation/network failure loses history and quota
// progress; device calls always return before onCalled, so they are never
// counted."*
//
// Both had the same root: the fence and the ledger lived in the CLIENT. The
// telephony routes now call this before and after the provider action, so an
// uninspected or opted-out prospect is refused by the server whatever the UI
// showed, and the attempt is on the record the moment the route succeeds —
// including device (tel:) calls, which never had a client callback that fired.

import { _containerFromCtx } from "@/built-ins/modules/leads-pipeline/src/server/foundationAdapter";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { LEADS_PIPELINE_PLUGIN_ID } from "@/lib/server/plugins/ensureLeadsPipelineInstall";

function prospectService(agencyId: string, actor: string) {
  const install = getInstall({ agencyId }, LEADS_PIPELINE_PLUGIN_ID);
  if (!install?.enabled) return null;
  const container = _containerFromCtx({
    agencyId,
    actor,
    storage: makePluginStorage(install.id),
  } as never);
  return container?.prospects ?? null;
}

/**
 * The gate, as a question. Throws with the service's own person-readable
 * message when the prospect cannot be contacted (opted out, uninspected, or
 * no longer scouting); resolves quietly when contact is allowed or when the
 * id resolves to nothing (an unknown id is not this fence's business — the
 * phone/email suppression resolver still applies).
 */
export async function assertProspectContactable(
  agencyId: string,
  prospectId: string,
  actor: string,
): Promise<void> {
  const prospects = prospectService(agencyId, actor);
  if (!prospects) return;
  const prospect = await prospects.get(prospectId);
  if (!prospect) return;
  if (prospect.status !== "scouting") throw new Error("Only active scouting prospects can be contacted.");
  if (prospect.doNotContact) throw new Error(`${prospect.name || prospect.company || "This prospect"} has opted out of contact.`);
  const required = ["business-verified", "contact-route-verified", "opportunity-confirmed"];
  if (!prospect.inspectedAt || !required.every(check => (prospect.inspectionChecks as string[]).includes(check))) {
    throw new Error("Complete the required scouting inspection before reaching out.");
  }
}

/**
 * The ledger half. Best-effort by design: the provider action has already
 * succeeded by the time this runs, and refusing the response because the log
 * hiccuped would tell the caller a delivered thing failed. The gate above is
 * what enforces; this is what remembers.
 */
export async function recordProspectOutreach(
  agencyId: string,
  prospectId: string,
  channel: "call" | "email",
  outcome: "attempted" | "sent",
  actor: string,
): Promise<void> {
  try {
    const prospects = prospectService(agencyId, actor);
    if (!prospects) return;
    await prospects.recordOutreach(prospectId, { channel, outcome }, actor);
  } catch {
    // Recorded nothing — the outreach form remains the manual fallback.
  }
}
