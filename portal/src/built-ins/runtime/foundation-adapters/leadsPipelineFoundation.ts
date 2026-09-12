import "server-only";
// Leads-pipeline plugin foundation registration (T1 R037 closes the
// 5-step "Foundation pending" punch-list T2 R027 left).
//
// Registers tenant + activity + event-bus + pluginInstall ports
// (shared via `_foundationPorts.ts`) plus two plugin-specific ports
// declared in `@/lib/server/leadsPipelinePorts`:
//   • emailEnqueuePort — adapter onto @aqua/plugin-email-sender
//   • pipelinePort     — adapter onto T1 R034 pipelines.ts
//
// Then subscribes the plugin's pipeline event. Anonymous public-funnel rows do
// not enter this adapter through the event bus; the public-funnel promotion
// port calls the explicit bridge below only after trusted authority.

import {
  registerLeadsPipelineFoundation,
  EVENT_SUBSCRIPTIONS,
  promoteFunnelCaptureToLead,
  handlePipelineCardMoved,
  containerFor as leadsContainerFor,
} from "@aqua/plugin-leads-pipeline/server";
import {
  tenantPort,
  activityPort,
  eventBusPort,
  pluginInstallStorePort,
} from "./_foundationPorts";
import {
  emailEnqueuePort,
  personIdentityPort,
  pipelinePort,
} from "@/lib/server/leadsPipelinePorts";
import { subscribeForPlugin } from "@/server/eventBus";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { findPersonByIdentity } from "@/server/persons";
import { getState, mutate } from "@/server/storage";

// Match the plugin's manifest id (chapter #157 / R037 follow-up):
// the foundation registry validator regex /^[a-z][a-z0-9-]*$/ rejects
// `@aqua/plugin-...`. Manifest id = "leads-pipeline"; npm package name
// = "@aqua/plugin-leads-pipeline" (latter still imported above).
const PLUGIN_ID = "leads-pipeline";

// Seeding a converted client with its pre-client history registers here so
// it is live wherever the leads foundation is.
import "./personClientSeeding";

let registered = false;

export function ensureLeadsPipelineFoundationRegistered(): void {
  if (registered) return;
  registerLeadsPipelineFoundation({
    tenant: tenantPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    emailEnqueue: emailEnqueuePort,
    pipeline: pipelinePort,
    personIdentity: personIdentityPort,
  } as unknown as Parameters<typeof registerLeadsPipelineFoundation>[0]);
  registered = true;
}

ensureLeadsPipelineFoundationRegistered();

// ─── EVENT_SUBSCRIPTIONS — bind handlers per agency install ───────────────
//
// The plugin exports a declarative list of event names + matching
// handler functions (chapter #157). For each entry, register a
// tenant-filtered subscriber that builds the per-(agency) container
// then invokes the handler with the appropriate service slice.

interface CardMovedPayload {
  cardId: string;
  cardKind: "lead" | "client" | "deal" | "custom";
  leadId?: string;
  fromColumn: string;
  toColumn: string;
  agencyId: string;
}

// Sanity assert: the plugin's declarative array stays in sync.
const expectedEvents = ["pipelines.card.moved"] as const;
for (const ev of expectedEvents) {
  if (!(EVENT_SUBSCRIPTIONS as readonly string[]).includes(ev)) {
    console.warn(`[leads-pipeline] EVENT_SUBSCRIPTIONS missing expected entry "${ev}"`);
  }
}

function containerForAgency(agencyId: string) {
  const install = getInstall({ agencyId }, PLUGIN_ID);
  if (!install || !install.enabled) return null;
  const storage = makePluginStorage(install.id);
  return leadsContainerFor({ agencyId, storage: storage as never });
}

export async function promoteVerifiedFunnelCapture(input: {
  agencyId: string;
  captureId: string;
  email: string;
  source: string;
  actorUserId: string;
  profile?: { name?: string; phone?: string; company?: string };
}): Promise<{
  leadId: string;
  personId: string;
  prospectId?: string;
  pipelineCardId?: string;
  leadOwned: boolean;
  personOwned: boolean;
  prospectOwned: boolean;
  pipelineCardOwned: boolean;
}> {
  const container = containerForAgency(input.agencyId);
  if (!container) throw new Error("leads_pipeline_promotion_unavailable");
  const existingLead = await container.leads.getByEmail(input.email);
  const existingPerson = findPersonByIdentity(input.agencyId, {
    emails: [input.email],
    phones: [input.profile?.phone],
    name: input.profile?.name,
  });
  const existingProspect = existingLead
    ? await container.prospects.getByQualifiedLeadId(existingLead.id)
    : null;
  const existingCardId = existingLead?.pipelineCardId;
  const lineage = await promoteFunnelCaptureToLead(container.leads, {
    agencyId: input.agencyId as never,
    captureId: input.captureId,
    email: input.email,
    source: input.source,
    actorUserId: input.actorUserId as never,
    name: input.profile?.name,
    phone: input.profile?.phone,
    company: input.profile?.company,
  }, container.prospects);
  if (!lineage.personId) throw new Error("funnel_promotion_person_lineage_missing");
  return {
    ...lineage,
    personId: lineage.personId,
    leadOwned: !existingLead,
    personOwned: !existingPerson,
    prospectOwned: Boolean(lineage.prospectId) && !existingProspect,
    pipelineCardOwned: Boolean(lineage.pipelineCardId) && !existingCardId,
  };
}

function exactReference(value: unknown, fields: ReadonlySet<string>, ids: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(item => exactReference(item, fields, ids));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (fields.has(key)) {
      if (typeof child === "string" && ids.has(child)) return true;
      if (Array.isArray(child) && child.some(item => typeof item === "string" && ids.has(item))) return true;
    }
    if (exactReference(child, fields, ids)) return true;
  }
  return false;
}

const ACQUISITION_REFERENCE_FIELDS = new Set([
  "captureId", "captureIds", "leadId", "leadIds", "personId", "personIds",
  "prospectId", "prospectIds", "pipelineCardId", "pipelineCardIds", "contactId", "contactIds",
]);

/**
 * Erase the exact CRM graph created by one Public Funnel promotion.
 *
 * The caller holds the Public Funnel durable state transaction. Every
 * validation happens before the single mutation below; a thrown validation or
 * durable flush failure therefore leaves both the capture and its CRM graph
 * available for an idempotent retry. Rows that pre-dated this promotion are
 * never deleted. A Person that later acquired another Client/enquiry/contact
 * basis is preserved with only the disappearing acquisition facets detached.
 */
export async function eraseVerifiedFunnelCapturePromotion(input: {
  agencyId: string;
  captureId: string;
  promotion: {
    leadId: string;
    personId: string;
    prospectId?: string;
    pipelineCardId?: string;
    leadOwned: boolean;
    personOwned: boolean;
    prospectOwned: boolean;
    pipelineCardOwned: boolean;
  };
  erasureSubject?: { clientId: string; personId?: string };
}): Promise<{ recordsErased: number; sharedIdentityPreserved: boolean }> {
  const install = getInstall({ agencyId: input.agencyId }, PLUGIN_ID);
  if (!install) throw new Error("leads_pipeline_promotion_erasure_unavailable");
  const state = getState();
  const slice = state.pluginData[install.id] ?? {};
  const promotion = input.promotion;
  const erasureClientId = input.erasureSubject?.clientId;
  if (input.erasureSubject?.personId && input.erasureSubject.personId !== promotion.personId) {
    throw new Error("public_funnel_promotion_erasure_subject_mismatch");
  }
  const lead = slice[`lead:${promotion.leadId}`] as {
    id?: string;
    agencyId?: string;
    personId?: string;
    clientId?: string;
    convertedClientId?: string;
    email?: string;
    phone?: string;
    pipelineCardId?: string;
    customFields?: Record<string, unknown>;
  } | undefined;
  const leadAlreadyAnonymisedForClient = Boolean(lead
    && erasureClientId
    && (lead.clientId === erasureClientId || lead.convertedClientId === erasureClientId)
    && !lead.personId
    && !lead.email
    && !lead.phone
    && !lead.customFields);
  if (lead) {
    if (lead.id !== promotion.leadId
      || lead.agencyId !== input.agencyId
      || (!leadAlreadyAnonymisedForClient && (
        lead.personId !== promotion.personId
        || lead.customFields?.publicFunnelCaptureId !== input.captureId
      ))) {
      throw new Error("public_funnel_promotion_lead_lineage_mismatch");
    }
    if (promotion.leadOwned && (
      (lead.clientId && lead.clientId !== erasureClientId)
      || (lead.convertedClientId && lead.convertedClientId !== erasureClientId)
    )) {
      throw new Error("public_funnel_promotion_requires_client_erasure");
    }
  } else if (promotion.leadOwned) {
    // A previous interrupted retry may already have removed an owned Lead, but
    // only if every remaining owned derivative is also absent. The final
    // mutation below is still idempotent.
    const hasOwnedDerivative = Boolean(
      (promotion.prospectOwned && promotion.prospectId && slice[`prospect:${promotion.prospectId}`])
      || (promotion.pipelineCardOwned && promotion.pipelineCardId && state.pipelineCards[promotion.pipelineCardId])
      || (promotion.personOwned && state.persons[promotion.personId]),
    );
    if (hasOwnedDerivative) throw new Error("public_funnel_promotion_lead_lineage_missing");
  }

  const prospect = promotion.prospectId
    ? slice[`prospect:${promotion.prospectId}`] as { id?: string; agencyId?: string; qualifiedLeadId?: string } | undefined
    : undefined;
  if (prospect && (prospect.id !== promotion.prospectId
    || prospect.agencyId !== input.agencyId
    || prospect.qualifiedLeadId !== promotion.leadId)) {
    throw new Error("public_funnel_promotion_prospect_lineage_mismatch");
  }
  if (promotion.prospectOwned && promotion.prospectId && !prospect && lead && !leadAlreadyAnonymisedForClient) {
    throw new Error("public_funnel_promotion_prospect_lineage_missing");
  }

  const card = promotion.pipelineCardId ? state.pipelineCards[promotion.pipelineCardId] : undefined;
  if (card) {
    const pipeline = state.pipelines[card.pipelineId];
    const cardLeadId = card.kind === "lead"
      ? (card.lead as unknown as { leadId?: string }).leadId
      : undefined;
    if (!pipeline
      || pipeline.agencyId !== input.agencyId
      || card.kind !== "lead"
      || cardLeadId !== promotion.leadId) {
      throw new Error("public_funnel_promotion_card_lineage_mismatch");
    }
  }
  if (promotion.pipelineCardOwned && promotion.pipelineCardId && !card && lead) {
    throw new Error("public_funnel_promotion_card_lineage_missing");
  }

  const person = state.persons[promotion.personId];
  if (person && person.agencyId !== input.agencyId) {
    throw new Error("public_funnel_promotion_person_lineage_mismatch");
  }
  if (promotion.personOwned && !person && lead) {
    throw new Error("public_funnel_promotion_person_lineage_missing");
  }

  const exactContacts = Object.entries(slice)
    .filter(([key, value]) => key.startsWith("contact:")
      && value
      && typeof value === "object"
      && (value as { agencyId?: string }).agencyId === input.agencyId
      && (value as { promotedFromLeadId?: string }).promotedFromLeadId === promotion.leadId
      && (value as { personId?: string }).personId === promotion.personId)
    .map(([key, value]) => ({
      key,
      row: value as { id: string; email?: string; clientId?: string; personId?: string },
    }));
  if (exactContacts.some(item => item.row.clientId && item.row.clientId !== erasureClientId)) {
    throw new Error("public_funnel_promotion_requires_client_erasure");
  }

  const otherLeadOrContactReferences = Object.entries(slice).some(([key, value]) => {
    if ((!key.startsWith("lead:") && !key.startsWith("contact:"))
      || !value
      || typeof value !== "object") return false;
    if (key === `lead:${promotion.leadId}` || exactContacts.some(item => item.key === key)) return false;
    return (value as { personId?: string }).personId === promotion.personId;
  });
  const exactContactIds = new Set(exactContacts.map(item => item.row.id));
  const personHasIndependentBasis = Boolean(person && (
    !promotion.personOwned
    || (person.facets.clientIds ?? []).some(clientId => clientId !== erasureClientId)
    || (person.facets.enquiryIds?.length ?? 0) > 0
    || (person.facets.leadId && person.facets.leadId !== promotion.leadId)
    || (person.facets.contactId && !exactContactIds.has(person.facets.contactId))
    || Object.values(state.clients).some(client => client.agencyId === input.agencyId
      && client.id !== erasureClientId
      && client.personId === person.id)
    || otherLeadOrContactReferences
    || person.organisationId
    || person.organisationLinks.length > 0
    || (person.record?.length ?? 0) > 0
    || person.notes
    || person.customFields
    || person.jobTitle
    || !["unclassified", "sales"].includes(person.classification)
  ));

  let recordsErased = 0;
  mutate(draft => {
    const pluginSlice = draft.pluginData[install.id] ?? {};
    const removedIds = new Set<string>([
      input.captureId,
      ...(promotion.leadOwned ? [promotion.leadId] : []),
      ...(promotion.personOwned && !personHasIndependentBasis ? [promotion.personId] : []),
      ...(promotion.prospectOwned && promotion.prospectId ? [promotion.prospectId] : []),
      ...(promotion.pipelineCardOwned && promotion.pipelineCardId ? [promotion.pipelineCardId] : []),
      ...exactContactIds,
    ]);

    if (promotion.leadOwned && pluginSlice[`lead:${promotion.leadId}`]) {
      delete pluginSlice[`lead:${promotion.leadId}`];
      recordsErased += 1;
      const leadIndex = pluginSlice["leads/index"];
      if (Array.isArray(leadIndex)) {
        pluginSlice["leads/index"] = leadIndex.filter(id => id !== promotion.leadId);
      }
      for (const [key, value] of Object.entries(pluginSlice)) {
        if ((key.startsWith("leads/email/") || key.startsWith("leads/phone/"))
          && value === promotion.leadId) {
          delete pluginSlice[key];
          recordsErased += 1;
        }
      }
    } else if (lead && pluginSlice[`lead:${promotion.leadId}`]) {
      const retained = pluginSlice[`lead:${promotion.leadId}`] as typeof lead;
      const customFields = { ...(retained.customFields ?? {}) };
      if (customFields.publicFunnelCaptureId === input.captureId) {
        delete customFields.publicFunnelCaptureId;
        pluginSlice[`lead:${promotion.leadId}`] = {
          ...retained,
          customFields: Object.keys(customFields).length ? customFields : undefined,
        };
      }
    }

    if (promotion.prospectOwned && promotion.prospectId && pluginSlice[`prospect:${promotion.prospectId}`]) {
      delete pluginSlice[`prospect:${promotion.prospectId}`];
      recordsErased += 1;
      const prospectIndex = pluginSlice["prospects/index"];
      if (Array.isArray(prospectIndex)) {
        pluginSlice["prospects/index"] = prospectIndex.filter(id => id !== promotion.prospectId);
      }
      for (const [key, value] of Object.entries(pluginSlice)) {
        if (key.startsWith("prospects/lead/") && value === promotion.prospectId) {
          delete pluginSlice[key];
          recordsErased += 1;
        }
      }
    }

    for (const contact of exactContacts) {
      if (!pluginSlice[contact.key]) continue;
      delete pluginSlice[contact.key];
      recordsErased += 1;
      const contactIndex = pluginSlice["contacts/index"];
      if (Array.isArray(contactIndex)) {
        pluginSlice["contacts/index"] = contactIndex.filter(id => id !== contact.row.id);
      }
      for (const [key, value] of Object.entries(pluginSlice)) {
        if (key.startsWith("contacts/email/") && value === contact.row.id) {
          delete pluginSlice[key];
          recordsErased += 1;
        }
      }
    }

    if (promotion.pipelineCardOwned && promotion.pipelineCardId && draft.pipelineCards[promotion.pipelineCardId]) {
      delete draft.pipelineCards[promotion.pipelineCardId];
      recordsErased += 1;
    }

    const heldPerson = draft.persons[promotion.personId];
    if (heldPerson) {
      if (promotion.personOwned && !personHasIndependentBasis) {
        delete draft.persons[promotion.personId];
        recordsErased += 1;
      } else {
        heldPerson.facets = {
          ...heldPerson.facets,
          leadId: heldPerson.facets.leadId === promotion.leadId ? undefined : heldPerson.facets.leadId,
          contactId: heldPerson.facets.contactId && exactContactIds.has(heldPerson.facets.contactId)
            ? undefined
            : heldPerson.facets.contactId,
          clientIds: erasureClientId
            ? (heldPerson.facets.clientIds ?? []).filter(clientId => clientId !== erasureClientId)
            : heldPerson.facets.clientIds,
        };
        heldPerson.updatedAt = Date.now();
      }
    }

    const removedActivityIds = new Set<string>();
    draft.activity = draft.activity.filter(entry => {
      const owned = entry.agencyId === input.agencyId
        && (entry.category === "leads" || entry.category === "public-funnel")
        && exactReference(entry.metadata, ACQUISITION_REFERENCE_FIELDS, removedIds);
      if (owned) {
        removedActivityIds.add(entry.id);
        recordsErased += 1;
      }
      return !owned;
    });
    for (const [id, event] of Object.entries(draft.clientRecordLedger)) {
      if (event.sourceType === "activity" && removedActivityIds.has(event.sourceId)) {
        delete draft.clientRecordLedger[id];
        recordsErased += 1;
      }
    }
    for (const [id, review] of Object.entries(draft.identityResolutionReviews)) {
      if (review.agencyId !== input.agencyId) continue;
      if ((promotion.leadOwned && review.leadId === promotion.leadId)
        || (review.contactId && exactContactIds.has(review.contactId))
        || (promotion.leadOwned && review.resolution.leadId === promotion.leadId)
        || (review.resolution.contactId && exactContactIds.has(review.resolution.contactId))) {
        delete draft.identityResolutionReviews[id];
        recordsErased += 1;
      }
    }
    for (const [id, event] of Object.entries(draft.outbox)) {
      if (event.agencyId !== input.agencyId) continue;
      if (exactReference(event.payload, ACQUISITION_REFERENCE_FIELDS, removedIds)) {
        delete draft.outbox[id];
        recordsErased += 1;
      }
    }
  });

  return { recordsErased, sharedIdentityPreserved: Boolean(person && personHasIndependentBasis) };
}

subscribeForPlugin(PLUGIN_ID, "pipelines.card.moved", async (event) => {
  const payload = event.payload as CardMovedPayload;
  const container = containerForAgency(event.agencyId);
  if (!container) return;
  await handlePipelineCardMoved(container.leads, container.contacts, {
    cardId: payload.cardId,
    cardKind: payload.cardKind,
    leadId: payload.leadId,
    fromColumn: payload.fromColumn,
    toColumn: payload.toColumn,
  });
});
