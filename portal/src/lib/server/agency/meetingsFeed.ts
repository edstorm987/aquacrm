import "server-only";

// The booked meetings a caller needs to keep moving — loaded once, server-side,
// so more than one surface can show the same list without each re-deriving it.
//
// Ed asked for a "distinct standalone Meetings surface" for the Sales focus, and
// the Sales focus home shows the same feed. Both read THIS function rather than
// the leads pipeline's own in-component derivation, so the standalone page and
// the pipeline's "Upcoming meetings" card can never drift into two answers.

import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { getInstall } from "@/server/pluginInstalls";
import { isLeadJourneyEligible } from "@/lib/enquiries/enquiryClassification";
import { timestampFromValue } from "@/lib/shared/formatDateTime";
import type { UpcomingMeeting } from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";

/**
 * Every journey lead with a booked meeting, mapped to the shape the shared
 * `UpcomingMeetings` card renders, sorted soonest first.
 *
 * Returns `[]` — never throws, and never writes — when the leads module is not
 * installed or enabled. This is a SECONDARY read surface (the Meetings page and
 * the Sales focus home), so it deliberately does NOT install or enable the
 * module the way the leads pipeline itself does: activating a tool belongs to
 * the surface you open to use it, not to a landing that happens to read from it.
 * A missing feed is an empty surface, not a provisioning write on every render.
 */
export async function loadUpcomingMeetings(agencyId: string): Promise<UpcomingMeeting[]> {
  const install = getInstall({ agencyId }, "leads-pipeline");
  if (!install?.enabled) return [];

  const storage = makePluginStorage(install.id);
  const container = leadsContainerFor({ agencyId, storage: storage as never });
  const leadList = await container.leads.list();
  const now = Date.now();

  return leadList
    .filter(isLeadJourneyEligible)
    .filter(lead => timestampFromValue(lead.nextMeetingAt) !== undefined)
    .map(lead => ({
      id: lead.id,
      kind: "lead" as const,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      meetingAt: timestampFromValue(lead.nextMeetingAt)!,
      meetingLink: lead.meetingLink,
      notes: lead.meetingNotes,
      mode: lead.meetingMode,
      location: lead.meetingLocation,
      status: lead.meetingStatus,
      confirmed: Boolean(lead.meetingConfirmedAt),
      reminderDue: Boolean(lead.meetingReminderAt && !lead.meetingReminderSentAt && lead.meetingReminderAt <= now),
      salesPresentations: lead.salesPresentations,
    }))
    .sort((a, b) => a.meetingAt - b.meetingAt);
}
