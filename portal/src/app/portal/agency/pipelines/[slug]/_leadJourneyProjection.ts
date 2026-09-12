import type { LeadProspectAcquisition } from "@/built-ins/modules/leads-pipeline/src/lib/domain";

import type { LeadJourneyEventView } from "./_leadTypes";

const MIGRATED_LEAD_CONTACT_NOTE_PREFIX = "migrated_lead_contact_";

/**
 * Render-only projection of the structured Prospect backlink into Journey.
 *
 * Keeping this pure lets both Journey entry routes show the same named audit
 * without exposing raw user ids or teaching the browser how to forge history.
 */
export function acquisitionJourneyEvents(
  acquisition: LeadProspectAcquisition,
  actorLabelFor: (actorUserId?: string) => string | undefined,
): LeadJourneyEventView[] {
  const prefix = `journey:prospect:${acquisition.prospectId}`;
  const events: LeadJourneyEventView[] = [{
    id: `${prefix}:qualified`,
    type: "prospect-qualified",
    at: acquisition.qualifiedAt,
    actorLabel: actorLabelFor(acquisition.qualifiedByUserId),
    source: acquisition.source,
    note: "The Prospect dossier, research and outreach history were attached to this lead.",
  }];

  if (acquisition.research.researchUpdatedAt) {
    const detail = [
      acquisition.research.opportunity && `Opportunity: ${acquisition.research.opportunity}`,
      acquisition.research.researchNotes && `Research: ${acquisition.research.researchNotes}`,
      acquisition.research.nextStep && `Next step: ${acquisition.research.nextStep}`,
    ].filter(Boolean).join(" · ");
    events.push({
      id: `${prefix}:research:${acquisition.research.researchUpdatedAt}`,
      type: "research-updated",
      at: acquisition.research.researchUpdatedAt,
      actorLabel: actorLabelFor(acquisition.research.researchUpdatedBy),
      note: detail || "The acquisition research dossier was refreshed.",
    });
  }

  for (const note of acquisition.notes) {
    // The original Lead contact event already remains in Journey. This stable
    // dossier copy makes the history visible at the Research/Outreach desks,
    // but projecting it again would show one real interaction twice.
    if (note.id.startsWith(MIGRATED_LEAD_CONTACT_NOTE_PREFIX)) continue;
    events.push({
      id: `${prefix}:note:${note.id}`,
      type: "prospect-note-added",
      at: note.at,
      actorLabel: actorLabelFor(note.actorUserId),
      note: note.body,
    });
  }

  for (const followUp of acquisition.followUps) {
    events.push({
      id: `${prefix}:follow-up:${followUp.id}:scheduled`,
      type: "follow-up-scheduled",
      at: followUp.createdAt,
      actorLabel: actorLabelFor(followUp.createdBy),
      channel: followUp.channel,
      note: followUp.reason,
      scheduledFor: followUp.dueAt,
    });
    if (followUp.resolvedAt) {
      events.push({
        id: `${prefix}:follow-up:${followUp.id}:resolved`,
        type: "follow-up-resolved",
        at: followUp.resolvedAt,
        actorLabel: actorLabelFor(followUp.resolvedBy),
        note: followUp.resolutionNote || (followUp.status === "completed" ? "Completed." : "Skipped."),
      });
    }
  }

  return events;
}
