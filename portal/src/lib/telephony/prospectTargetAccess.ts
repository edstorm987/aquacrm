import type { Role, OutboundCommunicationSubjectReferences } from "@/server/types";

/**
 * Prospect work belongs to the owner/manager Sales desks. A browser can omit
 * `prospectId`, or select a linked Contact/Lead instead, so this policy is
 * deliberately applied to the canonical subject after server-side resolution.
 */
export function agencyRoleMayContactResolvedSubject(
  role: Role,
  subject: OutboundCommunicationSubjectReferences,
): boolean {
  return role !== "agency-staff" || !subject.prospectId;
}
