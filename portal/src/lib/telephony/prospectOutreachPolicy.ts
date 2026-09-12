import { normalisePhone } from "@/lib/telephony/phoneNumbers";

export interface ProspectContactTarget {
  prospectId?: string;
  phone?: string;
  email?: string;
}

export interface ProspectContactRecord {
  id: string;
  status: "scouting" | "qualified" | "dismissed";
  qualifiedLeadId?: string;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  doNotContact?: boolean;
  inspectionChecks: readonly string[];
  inspectedAt?: number;
}

function matchesRecipient(prospect: ProspectContactRecord, target: ProspectContactTarget): boolean {
  const requestedPhone = target.phone ? normalisePhone(target.phone) : null;
  const requestedEmail = target.email?.trim().toLowerCase() || undefined;
  return Boolean(requestedPhone && normalisePhone(prospect.phone) === requestedPhone)
    || Boolean(requestedEmail && prospect.email?.trim().toLowerCase() === requestedEmail);
}

/**
 * Resolve the dossier from the recipient the provider will actually contact.
 * The optional browser id may narrow the choice, but can never change who the
 * phone/email belongs to or bypass the dossier's suppression state. Research
 * and inspection remain useful evidence, but they are not authorisation: an
 * operator may contact a newly scouted or previously researched prospect.
 * An explicit id may also identify a qualified dossier; the server bridge then
 * proves that its linked Journey Lead is still active before provider use.
 * Recipient-only resolution deliberately remains scouting-only so historic
 * qualified dossiers cannot shadow an ordinary Contact call or email.
 */
export function resolveContactableScoutingProspect(
  prospects: readonly ProspectContactRecord[],
  target: ProspectContactTarget,
): ProspectContactRecord | undefined {
  let prospect: ProspectContactRecord | undefined;
  if (target.prospectId) {
    prospect = prospects.find(candidate => candidate.id === target.prospectId);
    if (!prospect) throw new Error("The selected prospect no longer exists.");
    if (!matchesRecipient(prospect, target)) {
      throw new Error("The recipient does not match this prospect.");
    }
  } else {
    // Never auto-select a qualified dossier by recipient. Its Lead lifecycle is
    // only checked for an explicit Prospect action, and old converted dossiers
    // must not block generic/contact telephony for the same address or number.
    const matches = prospects
      .filter(candidate => candidate.status === "scouting" && matchesRecipient(candidate, target));
    if (!matches.length) return undefined;
    if (matches.length > 1) {
      throw new Error("More than one active scouting prospect uses this contact route. Open the intended dossier first.");
    }
    [prospect] = matches;
  }

  if (prospect.status !== "scouting" && prospect.status !== "qualified") {
    throw new Error("Only active scouting or qualified prospects can be contacted.");
  }
  if (prospect.doNotContact) throw new Error(`${prospect.name || prospect.company || "This prospect"} has opted out of contact.`);
  return prospect;
}
