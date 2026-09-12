import { samePhoneNumber } from "@/lib/telephony/phoneNumbers";

export interface ContactRecipientRecord {
  agencyId: string;
  clientId?: string;
  email?: string;
  phone?: string;
}

export interface ContactRecipientScope {
  agencyId: string;
  clientId?: string;
}

export type ContactRecipientTarget =
  | { channel: "call"; phone: string }
  | { channel: "email"; email: string };

/**
 * Prove that a browser-supplied contact id names the exact recipient and
 * belongs to the route's tenant before that id is trusted by an audit or
 * idempotency key.
 */
export function contactMatchesRecipient(
  contact: ContactRecipientRecord,
  scope: ContactRecipientScope,
  target: ContactRecipientTarget,
): boolean {
  if (contact.agencyId !== scope.agencyId) return false;
  if (scope.clientId && contact.clientId !== scope.clientId) return false;

  if (target.channel === "call") {
    return samePhoneNumber(contact.phone, target.phone);
  }

  const contactEmail = contact.email?.trim().toLowerCase();
  const recipientEmail = target.email.trim().toLowerCase();
  return Boolean(contactEmail && recipientEmail && contactEmail === recipientEmail);
}
