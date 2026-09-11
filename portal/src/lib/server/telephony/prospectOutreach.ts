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
import {
  resolveContactableScoutingProspect,
  type ProspectContactTarget,
} from "@/lib/telephony/prospectOutreachPolicy";

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
 * no longer scouting). The actual phone/email recipient is authoritative:
 * a browser cannot pair Alice's recipient with Bob's inspected id, and
 * omitting the id still finds an active Scouting dossier when one owns the
 * recipient. The resolved id is returned so delivery is logged to the same
 * dossier the gate inspected.
 */
export async function assertProspectContactable(
  agencyId: string,
  actor: string,
  target: ProspectContactTarget,
): Promise<string | undefined> {
  const prospects = prospectService(agencyId, actor);
  if (!prospects) {
    if (target.prospectId) throw new Error("The scouting prospect is not available.");
    return undefined;
  }

  const prospect = resolveContactableScoutingProspect(await prospects.list(), target);
  return prospect?.id;
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
