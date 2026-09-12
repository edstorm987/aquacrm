import type { Prospect } from "@/built-ins/modules/leads-pipeline/src/lib/domain";

import type { ScoutingProspectView } from "./_ScoutingCommand";

/** One projection shared by Journey and the read-only-on-render Scouting shell. */
export function toScoutingProspectView(
  prospect: Prospect,
  actorLabelFor: (actorUserId?: string) => string | undefined = () => undefined,
): ScoutingProspectView {
  return {
    id: prospect.id,
    status: prospect.status,
    dismissedAt: prospect.dismissedAt,
    dismissedActorLabel: actorLabelFor(prospect.dismissedByUserId),
    restoredAt: prospect.restoredAt,
    restoredActorLabel: actorLabelFor(prospect.restoredByUserId),
    qualifiedLeadId: prospect.qualifiedLeadId,
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
    tags: prospect.tags,
    source: prospect.source,
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
    inspectionChecks: prospect.inspectionChecks,
    inspectedAt: prospect.inspectedAt,
    researchUpdatedAt: prospect.researchUpdatedAt,
    researchActorLabel: actorLabelFor(prospect.researchUpdatedBy),
    followUps: prospect.followUps.map(item => ({
      ...item,
      actorLabel: actorLabelFor(item.createdBy),
      resolverActorLabel: actorLabelFor(item.resolvedBy),
    })),
    outreachAttempts: prospect.outreachAttempts.map(item => ({
      ...item,
      actorLabel: actorLabelFor(item.actorUserId),
      finaliserActorLabel: actorLabelFor(item.finalisedByUserId),
    })),
    notes: prospect.notes.map(item => ({
      ...item,
      actorLabel: actorLabelFor(item.actorUserId),
    })),
    capturedAt: prospect.capturedAt,
    updatedAt: prospect.updatedAt,
  };
}
