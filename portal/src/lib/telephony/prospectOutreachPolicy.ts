import { normalisePhone } from "@/lib/telephony/phoneNumbers";

export interface ProspectContactTarget {
  prospectId?: string;
  phone?: string;
  email?: string;
}

export interface ProspectContactRecord {
  id: string;
  status: "scouting" | "qualified" | "dismissed";
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
 * phone/email belongs to or bypass the dossier's safety state.
 */
export function resolveContactableScoutingProspect(
  prospects: readonly ProspectContactRecord[],
  target: ProspectContactTarget,
): ProspectContactRecord | undefined {
  let prospect: ProspectContactRecord | undefined;
  if (target.prospectId) {
    prospect = prospects.find(candidate => candidate.id === target.prospectId);
    if (!prospect) throw new Error("The scouting prospect no longer exists.");
    if (!matchesRecipient(prospect, target)) {
      throw new Error("The recipient does not match this scouting prospect.");
    }
  } else {
    const matches = prospects
      .filter(candidate => candidate.status === "scouting" && matchesRecipient(candidate, target));
    if (!matches.length) return undefined;
    if (matches.length > 1) {
      throw new Error("More than one active scouting prospect uses this contact route. Open the intended dossier first.");
    }
    [prospect] = matches;
  }

  if (prospect.status !== "scouting") throw new Error("Only active scouting prospects can be contacted.");
  if (prospect.doNotContact) throw new Error(`${prospect.name || prospect.company || "This prospect"} has opted out of contact.`);
  const required = ["business-verified", "contact-route-verified", "opportunity-confirmed"];
  if (!prospect.inspectedAt || !required.every(check => prospect.inspectionChecks.includes(check))) {
    throw new Error("Complete the required scouting inspection before reaching out.");
  }
  return prospect;
}
