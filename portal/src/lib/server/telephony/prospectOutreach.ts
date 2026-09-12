import "server-only";

// Server-side prospect outreach: enforce, then record — in the SAME request
// that performs the delivery.
//
// Ed's findings, 2026-08-30: *"Call/email requests can therefore contact an
// opted-out prospect"* and *"delivery and Journey logging are
// separate operations ... navigation/network failure loses history and quota
// progress; device calls always return before onCalled, so they are never
// counted."*
//
// Both had the same root: the fence and the ledger lived in the CLIENT. The
// telephony routes now call this before and after the provider action, so an
// opted-out prospect is refused by the server whatever the UI showed, the
// provider recipient stays bound to the selected dossier, and the attempt is
// on the record the moment the route succeeds —
// including device (tel:) calls, which never had a client callback that fired.

import { _containerFromCtx } from "@/built-ins/modules/leads-pipeline/src/server/foundationAdapter";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { LEADS_PIPELINE_PLUGIN_ID } from "@/lib/server/plugins/ensureLeadsPipelineInstall";
import {
  resolveContactableScoutingProspect,
  type ProspectContactTarget,
} from "@/lib/telephony/prospectOutreachPolicy";
import type { ProspectOutreachReceipt } from "@/lib/telephony/prospectOutreachReceipt";

function acquisitionContainer(agencyId: string, actor: string) {
  const install = getInstall({ agencyId }, LEADS_PIPELINE_PLUGIN_ID);
  if (!install?.enabled) return null;
  return _containerFromCtx({
    agencyId,
    actor,
    storage: makePluginStorage(install.id),
  } as never);
}

/**
 * The gate, as a question. Throws with the service's own person-readable
 * message when the prospect cannot be contacted (opted out, dismissed, or a
 * qualified dossier whose Journey Lead is no longer active). Research is
 * optional; it is not an authorisation boundary. The
 * actual phone/email recipient is authoritative: a browser cannot pair
 * Alice's recipient with Bob's id, and
 * omitting the id still finds only an active Scouting dossier when one owns the
 * recipient. The resolved id is returned so delivery is logged to the same
 * dossier the gate inspected. Explicit qualified dossiers additionally require
 * a current, unarchived and unconverted Lead in this agency-scoped container.
 */
export async function assertProspectContactable(
  agencyId: string,
  actor: string,
  target: ProspectContactTarget,
): Promise<string | undefined> {
  const container = acquisitionContainer(agencyId, actor);
  if (!container) {
    if (target.prospectId) throw new Error("The prospect is not available.");
    return undefined;
  }

  const prospect = resolveContactableScoutingProspect(await container.prospects.list(), target);
  if (prospect?.status === "qualified") {
    const lead = prospect.qualifiedLeadId
      ? await container.leads.get(prospect.qualifiedLeadId)
      : null;
    if (!lead
      || lead.archivedAt !== undefined
      || lead.convertedAt !== undefined
      || Boolean(lead.convertedClientId)
      || lead.currentStageId === "won") {
      throw new Error("This qualified prospect is no longer attached to an active Journey lead.");
    }
  }
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
  attemptId = crypto.randomUUID(),
): Promise<ProspectOutreachReceipt> {
  try {
    const container = acquisitionContainer(agencyId, actor);
    if (!container) return { outreachRecorded: false, outreachAttemptId: attemptId };
    const updated = await container.prospects.recordOutreach(prospectId, { attemptId, channel, outcome }, actor);
    return { outreachRecorded: Boolean(updated), outreachAttemptId: attemptId };
  } catch {
    // The provider action remains successful. Return the stable attempt id so
    // the UI can keep the record selected and the manual outcome can repair
    // the missing ledger row without repeating the provider write.
    return { outreachRecorded: false, outreachAttemptId: attemptId };
  }
}
