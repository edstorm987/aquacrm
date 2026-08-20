import type { Contact, Lead } from "./domain";

/**
 * The slice of a foundation `Client` these matchers read. Declared structurally
 * so the plugin doesn't have to import the foundation's `Client` type: the real
 * record is assignable, and so is whatever the `TenantPort` hands back.
 */
export interface ClientIdentityRef {
  ownerEmail?: string;
  metadata?: Record<string, unknown>;
}

function sameEmail(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function clientMatchesLead(client: ClientIdentityRef, lead: Lead): boolean {
  const metadata = client.metadata ?? {};
  return metadata.leadId === lead.id || sameEmail(client.ownerEmail, lead.email);
}

export function clientMatchesContact(client: ClientIdentityRef, contact: Contact): boolean {
  const metadata = client.metadata ?? {};
  if (metadata.contactId === contact.id) return true;
  if (
    contact.promotedFromLeadId
    && metadata.promotedFromLeadId === contact.promotedFromLeadId
  ) {
    return true;
  }
  return sameEmail(client.ownerEmail, contact.email);
}
