import type { Client } from "@/server/types";
import type { Contact, Lead } from "./domain";

function sameEmail(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function clientMatchesLead(client: Client, lead: Lead): boolean {
  const metadata = client.metadata ?? {};
  return metadata.leadId === lead.id || sameEmail(client.ownerEmail, lead.email);
}

export function clientMatchesContact(client: Client, contact: Contact): boolean {
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
