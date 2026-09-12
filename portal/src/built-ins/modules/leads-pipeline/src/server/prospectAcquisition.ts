import type {
  Lead,
  LeadProspectAcquisitionInput,
  Prospect,
} from "../lib/domain";
import type { UserId } from "../lib/tenancy";
import type { LeadsPipelineContainer } from "./index";

type AcquisitionContainer = Pick<LeadsPipelineContainer, "leads" | "prospects">;

/** The Prospect is canonical; the Lead copy is a server-maintained Journey projection. */
export function leadProspectAcquisition(prospect: Prospect): LeadProspectAcquisitionInput {
  return {
    prospectId: prospect.id,
    source: prospect.source,
    capturedAt: prospect.capturedAt,
    prospectUpdatedAt: prospect.updatedAt,
    profile: {
      name: prospect.name,
      company: prospect.company,
      email: prospect.email,
      phone: prospect.phone,
      website: prospect.website,
      address: prospect.address,
      googlePlaceId: prospect.googlePlaceId,
      googleMapsUrl: prospect.googleMapsUrl,
      instagramUrl: prospect.instagramUrl,
      facebookUrl: prospect.facebookUrl,
      linkedinUrl: prospect.linkedinUrl,
      niche: prospect.niche,
      tags: [...prospect.tags],
    },
    research: {
      foundAt: prospect.foundAt,
      opportunity: prospect.opportunity,
      researchNotes: prospect.researchNotes,
      nextStep: prospect.nextStep,
      qualificationState: prospect.qualificationState,
      fitScore: prospect.fitScore,
      preferredChannel: prospect.preferredChannel,
      doNotContact: prospect.doNotContact,
      nextContactAt: prospect.nextContactAt,
      nextContactReason: prospect.nextContactReason,
      lastContactedAt: prospect.lastContactedAt,
      inspectionChecks: [...prospect.inspectionChecks],
      inspectedAt: prospect.inspectedAt,
      researchUpdatedBy: prospect.researchUpdatedBy,
      researchUpdatedAt: prospect.researchUpdatedAt,
    },
    outreachAttempts: prospect.outreachAttempts.map(item => ({ ...item })),
    followUps: prospect.followUps.map(item => ({ ...item })),
    notes: prospect.notes.map(item => ({ ...item })),
  };
}

async function activeLinkedLead(
  container: AcquisitionContainer,
  prospect: Prospect,
): Promise<Lead | undefined> {
  if (prospect.status === "scouting") return undefined;
  if (prospect.status !== "qualified" || !prospect.qualifiedLeadId) {
    throw new Error("This acquisition record is no longer active.");
  }
  const lead = await container.leads.get(prospect.qualifiedLeadId);
  if (!lead || lead.archivedAt || lead.convertedAt) {
    throw new Error("The Journey lead linked to this acquisition record is not active.");
  }
  return lead;
}

/**
 * Validate the server-owned Prospect -> Lead edge before mutation, then refresh
 * the Lead projection after it. A later focused-workspace load runs the same
 * idempotent attachment, repairing the narrow storage-failure window between
 * the canonical Prospect write and this projection write.
 */
export async function mutateProspectAndConverge(
  container: AcquisitionContainer,
  prospectId: string,
  actor: UserId,
  mutate: () => Promise<Prospect | null>,
): Promise<Prospect | null> {
  const existing = await container.prospects.get(prospectId);
  if (!existing) return null;
  const linkedLead = await activeLinkedLead(container, existing);
  const updated = await mutate();
  if (!updated) return null;
  if (!linkedLead) return updated;
  if (updated.status !== "qualified" || updated.qualifiedLeadId !== linkedLead.id) {
    throw new Error("The acquisition dossier link changed during the update.");
  }
  const projected = await container.leads.attachProspectAcquisition(
    linkedLead.id,
    leadProspectAcquisition(updated),
    actor,
  );
  if (!projected) throw new Error("The Journey projection could not be refreshed.");
  return updated;
}

/**
 * Server-only backfill/repair used by focused acquisition desks. It creates at
 * most one dossier per active Lead, then idempotently attaches the latest
 * dossier projection so refreshes can repair a prior partial write.
 */
export async function ensureAcquisitionDossierForLead(
  container: AcquisitionContainer,
  lead: Lead,
  actor: UserId,
): Promise<Prospect> {
  const prospect = await container.prospects.ensureAcquisitionDossierForLead(lead, actor);
  const projected = await container.leads.attachProspectAcquisition(
    lead.id,
    leadProspectAcquisition(prospect),
    actor,
  );
  if (!projected) throw new Error("The acquisition dossier could not be linked to Journey.");
  return prospect;
}
