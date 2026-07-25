// Cross-plugin event glue. The foundation registers these subscribers
// at boot — they fire when other plugins emit on the shared event bus.
//
// Two subscriptions:
//
//   `public-funnel.lead.captured`
//     Payload `{email, name?, phone?, source}` — public-funnel (T2 R021)
//     emits this when an HC / Resources tool captures a lead. We
//     upsert the Lead row + (when wired) drop a card on the leads
//     pipeline's "New" column.
//
//   `pipelines.card.moved`
//     Payload `{cardId, leadId?, fromColumn, toColumn}` — T1's
//     foundation pipelines service emits this on every column change.
//     We listen for `toColumn === "Won"` on a `lead`-kind card and
//     promote the lead to a Customer Contact (idempotent on email).

import type { AgencyId, UserId } from "../lib/tenancy";
import type { LeadService } from "./leads";
import type { ContactService } from "./contacts";

export interface FunnelLeadCapturedPayload {
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source: string;
  agencyId: AgencyId;              // funnel emits with the scope, but
                                   // some buses repeat it on the payload.
}

export interface PipelineCardMovedPayload {
  cardId: string;
  cardKind: "lead" | "client" | "deal" | "custom";
  leadId?: string;
  fromColumn: string;
  toColumn: string;
}

export const SYSTEM_ACTOR: UserId = "system";

export async function handleFunnelLeadCaptured(
  leads: LeadService,
  payload: FunnelLeadCapturedPayload,
): Promise<void> {
  await leads.upsert(
    {
      email: payload.email,
      name: payload.name,
      phone: payload.phone,
      company: payload.company,
      source: payload.source ?? "public-funnel",
      tags: ["public-funnel"],
    },
    SYSTEM_ACTOR,
  );
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
  "public-funnel.lead.captured",
  "pipelines.card.moved",
] as const;
