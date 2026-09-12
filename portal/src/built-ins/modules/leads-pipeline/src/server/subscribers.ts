// Cross-plugin event glue. The foundation registers these subscribers
// at boot — they fire when other plugins emit on the shared event bus.
//
// Anonymous public-funnel capture is intentionally NOT a subscription: pending
// rows stay inside that plugin until mailbox proof or an authenticated command
// calls the explicit promotion bridge. The only automatic subscription is:
//
//   `pipelines.card.moved`
//     Payload `{cardId, leadId?, fromColumn, toColumn}` — T1's
//     foundation pipelines service emits this on every column change.
//     We listen for `toColumn === "Won"` on a `lead`-kind card and
//     promote the lead to a Customer Contact (idempotent on email).

import type { AgencyId, UserId } from "../lib/tenancy";
import type { LeadService } from "./leads";
import type { ContactService } from "./contacts";
import type { ProspectService } from "./prospects";
import { ensureAcquisitionDossierForLead } from "./prospectAcquisition";

export interface FunnelCapturePromotionPayload {
  captureId: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  actorUserId?: UserId;
  agencyId: AgencyId;              // funnel emits with the scope, but
                                   // some buses repeat it on the payload.
}

export interface FunnelCapturePromotionLineage {
  leadId: string;
  personId?: string;
  prospectId?: string;
  pipelineCardId?: string;
}

export interface PipelineCardMovedPayload {
  cardId: string;
  cardKind: "lead" | "client" | "deal" | "custom";
  leadId?: string;
  fromColumn: string;
  toColumn: string;
}

export const SYSTEM_ACTOR: UserId = "system";

export async function promoteFunnelCaptureToLead(
  leads: LeadService,
  payload: FunnelCapturePromotionPayload,
  prospects?: ProspectService,
): Promise<FunnelCapturePromotionLineage> {
  const actor = payload.actorUserId ?? SYSTEM_ACTOR;
  const result = await leads.upsert(
    {
      email: payload.email,
      name: payload.name,
      phone: payload.phone,
      company: payload.company,
      source: payload.source ?? "public-funnel",
      relationshipCategory: "inbound-enquiry",
      tags: ["public-funnel"],
      customFields: { publicFunnelCaptureId: payload.captureId },
    },
    actor,
  );
  let prospectId: string | undefined;
  if (prospects) {
    prospectId = (await ensureAcquisitionDossierForLead({ leads, prospects }, result.lead, actor)).id;
  }
  const linked = await leads.get(result.lead.id) ?? result.lead;
  return {
    leadId: linked.id,
    personId: linked.personId,
    prospectId,
    pipelineCardId: linked.pipelineCardId,
  };
}

export async function handlePipelineCardMoved(
  leads: LeadService,
  contacts: ContactService,
  payload: PipelineCardMovedPayload,
): Promise<void> {
  if (payload.cardKind !== "lead") return;
  if (payload.toColumn !== "Won") return;
  if (!payload.leadId) return;
  const lead = await leads.get(payload.leadId);
  if (!lead) return;
  await contacts.promoteLead(lead, SYSTEM_ACTOR);
}

// Declarative manifest the foundation can introspect at boot to wire
// subscriptions without hard-coding the names elsewhere.
export const EVENT_SUBSCRIPTIONS = [
  "pipelines.card.moved",
] as const;
