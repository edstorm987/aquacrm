import type { Contact, Lead, Prospect } from "./domain";

export type ClientAcquisitionLineageField = "personId" | "leadId" | "contactId" | "prospectId";
export type ClientAcquisitionLineageConflictReason =
  | "missing"
  | "foreign-client"
  | "one-way-edge"
  | "conflicting-person";

export interface ClientAcquisitionLineageConflict {
  field: ClientAcquisitionLineageField;
  id: string;
  reason: ClientAcquisitionLineageConflictReason;
}

export interface ClientAcquisitionLineageRef {
  id: string;
  agencyId: string;
  personId?: string;
  metadata?: Record<string, unknown>;
}

export interface ClientAcquisitionPersonRef {
  id: string;
  agencyId: string;
  facets: {
    clientIds?: string[];
    leadId?: string;
    contactId?: string;
  };
}

export interface ValidatedClientAcquisitionLineage {
  personIds: Set<string>;
  leadIds: Set<string>;
  contactIds: Set<string>;
  prospectIds: Set<string>;
  conflicts: ClientAcquisitionLineageConflict[];
}

interface ClientAcquisitionRows {
  persons: readonly ClientAcquisitionPersonRef[];
  leads: readonly Lead[];
  contacts: readonly Contact[];
  prospects: readonly Prospect[];
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id && id.length <= 160 ? id : undefined;
}

function prospectHintIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  return [
    cleanId(row.prospectId),
    cleanId(row.acquisitionProspectId),
    ...(Array.isArray(row.prospectIds) ? row.prospectIds.map(cleanId) : []),
  ].filter((id): id is string => Boolean(id));
}

/**
 * Resolve the exact acquisition records owned by one Client.
 *
 * Free-form Client metadata is never authority. Its old lineage-looking keys
 * are checked only for consistency so a forged, dangling or stale id fails
 * closed instead of deleting or admitting somebody else's record.
 * `metadata.linkedContacts` is deliberately ignored: it is a contact book,
 * not the CRM identity graph.
 */
export function resolveValidatedClientAcquisitionLineage(
  client: ClientAcquisitionLineageRef,
  rows: ClientAcquisitionRows,
): ValidatedClientAcquisitionLineage {
  const personIds = new Set<string>();
  const leadIds = new Set<string>();
  const contactIds = new Set<string>();
  const prospectIds = new Set<string>();
  const conflicts: ClientAcquisitionLineageConflict[] = [];
  const conflictKeys = new Set<string>();
  const addConflict = (
    field: ClientAcquisitionLineageField,
    id: string,
    reason: ClientAcquisitionLineageConflictReason,
  ) => {
    const key = `${field}:${id}:${reason}`;
    if (conflictKeys.has(key)) return;
    conflictKeys.add(key);
    conflicts.push({ field, id, reason });
  };

  const people = new Map(rows.persons.map(person => [person.id, person]));
  const leads = new Map(rows.leads.map(lead => [lead.id, lead]));
  const contacts = new Map(rows.contacts.map(contact => [contact.id, contact]));
  const prospects = new Map(rows.prospects.map(prospect => [prospect.id, prospect]));
  const leadClaimsForeignClient = (lead: Lead): boolean =>
    lead.agencyId !== client.agencyId
    || Boolean(lead.clientId && lead.clientId !== client.id)
    || Boolean(lead.convertedClientId && lead.convertedClientId !== client.id);
  const contactClaimsForeignClient = (contact: Contact): boolean =>
    contact.agencyId !== client.agencyId
    || Boolean(contact.clientId && contact.clientId !== client.id);

  const requestedPersonId = cleanId(client.personId);
  const person = requestedPersonId ? people.get(requestedPersonId) : undefined;
  if (requestedPersonId) {
    if (!person || person.agencyId !== client.agencyId) {
      addConflict("personId", requestedPersonId, "missing");
    } else if (!(person.facets.clientIds ?? []).includes(client.id)) {
      addConflict("personId", requestedPersonId, "one-way-edge");
    } else {
      personIds.add(person.id);
    }
  }

  for (const lead of rows.leads) {
    if (lead.agencyId !== client.agencyId) continue;
    if (lead.clientId === client.id || lead.convertedClientId === client.id) {
      leadIds.add(lead.id);
      if (leadClaimsForeignClient(lead)) addConflict("leadId", lead.id, "foreign-client");
      if (person && lead.personId && lead.personId !== person.id) {
        addConflict("leadId", lead.id, "conflicting-person");
      }
    }
  }
  for (const contact of rows.contacts) {
    if (contact.agencyId !== client.agencyId) continue;
    if (contact.clientId === client.id) {
      contactIds.add(contact.id);
      if (contactClaimsForeignClient(contact)) addConflict("contactId", contact.id, "foreign-client");
      if (person && contact.personId && contact.personId !== person.id) {
        addConflict("contactId", contact.id, "conflicting-person");
      }
    }
  }

  if (personIds.size > 0 && person) {
    const facetLeadId = cleanId(person.facets.leadId);
    if (facetLeadId) {
      const lead = leads.get(facetLeadId);
      if (!lead || lead.agencyId !== client.agencyId) {
        addConflict("leadId", facetLeadId, "missing");
      } else if (leadClaimsForeignClient(lead)) {
        addConflict("leadId", facetLeadId, "foreign-client");
      } else if (lead.personId !== person.id) {
        addConflict("leadId", facetLeadId, "one-way-edge");
      } else {
        leadIds.add(lead.id);
      }
    }
    const facetContactId = cleanId(person.facets.contactId);
    if (facetContactId) {
      const contact = contacts.get(facetContactId);
      if (!contact || contact.agencyId !== client.agencyId) {
        addConflict("contactId", facetContactId, "missing");
      } else if (contactClaimsForeignClient(contact)) {
        addConflict("contactId", facetContactId, "foreign-client");
      } else if (contact.personId !== person.id) {
        addConflict("contactId", facetContactId, "one-way-edge");
      } else {
        contactIds.add(contact.id);
      }
    }
  }

  // Promotion is a server-owned relationship. Close it in both directions so
  // a converted Lead and its Contact are treated as one acquisition record.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const contact of rows.contacts) {
      const promotedLeadId = cleanId(contact.promotedFromLeadId);
      if (!promotedLeadId) continue;
      const lead = leads.get(promotedLeadId);
      const closesFromLead = leadIds.has(promotedLeadId) && !contactIds.has(contact.id);
      const closesFromContact = contactIds.has(contact.id) && !leadIds.has(promotedLeadId);
      if (!closesFromLead && !closesFromContact) continue;
      if (!lead || lead.agencyId !== client.agencyId) {
        addConflict("leadId", promotedLeadId, "missing");
        continue;
      }
      if (contactClaimsForeignClient(contact)) {
        addConflict("contactId", contact.id, "foreign-client");
        continue;
      }
      if (leadClaimsForeignClient(lead)) {
        addConflict("leadId", lead.id, "foreign-client");
        continue;
      }
      if ((person && contact.personId && contact.personId !== person.id)
        || (contact.personId && lead.personId && contact.personId !== lead.personId)) {
        addConflict("contactId", contact.id, "conflicting-person");
        continue;
      }
      if (person && lead.personId && lead.personId !== person.id) {
        addConflict("leadId", lead.id, "conflicting-person");
        continue;
      }
      if (closesFromLead) {
        contactIds.add(contact.id);
        expanded = true;
      }
      if (closesFromContact) {
        leadIds.add(promotedLeadId);
        expanded = true;
      }
    }
  }

  // A Prospect edge is valid only when both canonical rows point at each
  // other. A one-way projection is corruption to review, not erasure authority.
  for (const leadId of leadIds) {
    const lead = leads.get(leadId);
    if (!lead) continue;
    const projectedIds = new Set((lead.prospectAcquisitions ?? [])
      .map(acquisition => cleanId(acquisition.prospectId))
      .filter((id): id is string => Boolean(id)));
    for (const prospectId of projectedIds) {
      const prospect = prospects.get(prospectId);
      if (!prospect || prospect.agencyId !== client.agencyId) {
        addConflict("prospectId", prospectId, "missing");
      } else if (prospect.qualifiedLeadId !== leadId) {
        addConflict("prospectId", prospectId, "one-way-edge");
      } else {
        prospectIds.add(prospect.id);
      }
    }
    for (const prospect of rows.prospects) {
      if (prospect.agencyId !== client.agencyId || prospect.qualifiedLeadId !== leadId) continue;
      if (!projectedIds.has(prospect.id)) addConflict("prospectId", prospect.id, "one-way-edge");
      else prospectIds.add(prospect.id);
    }
  }

  const metadata = client.metadata ?? {};
  const metadataCustomFields = metadata.customFields && typeof metadata.customFields === "object"
    && !Array.isArray(metadata.customFields)
    ? metadata.customFields as Record<string, unknown>
    : undefined;
  const hints: Array<[ClientAcquisitionLineageField, string, Set<string>]> = [];
  for (const id of [cleanId(metadata.leadId), cleanId(metadata.promotedFromLeadId)]) {
    if (id) hints.push(["leadId", id, leadIds]);
  }
  const contactId = cleanId(metadata.contactId);
  if (contactId) hints.push(["contactId", contactId, contactIds]);
  for (const id of [...prospectHintIds(metadata), ...prospectHintIds(metadataCustomFields)]) {
    hints.push(["prospectId", id, prospectIds]);
  }
  for (const [field, id, validated] of hints) {
    if (validated.has(id)) continue;
    const exists = field === "leadId" ? leads.has(id)
      : field === "contactId" ? contacts.has(id)
        : prospects.has(id);
    if (!exists) {
      addConflict(field, id, "missing");
      continue;
    }
    const foreign = field === "leadId"
      ? (() => {
          const lead = leads.get(id)!;
          return Boolean((lead.clientId && lead.clientId !== client.id)
            || (lead.convertedClientId && lead.convertedClientId !== client.id));
        })()
      : field === "contactId"
        ? Boolean(contacts.get(id)!.clientId && contacts.get(id)!.clientId !== client.id)
        : Boolean(prospects.get(id)!.qualifiedLeadId && !leadIds.has(prospects.get(id)!.qualifiedLeadId!));
    addConflict(field, id, foreign ? "foreign-client" : "one-way-edge");
  }

  return { personIds, leadIds, contactIds, prospectIds, conflicts };
}
