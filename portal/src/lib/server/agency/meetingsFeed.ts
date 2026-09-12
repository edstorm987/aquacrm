import "server-only";

// Shared server projections over the canonical Lead + Contact meeting records.
// `loadUpcomingMeetings` supplies compact operational prompts; the focused
// Meetings route uses `loadJourneyMeetingPeople` for the complete editable
// workbench. Both retain explicit promotion lineage and never infer identity
// from a shared email address.

import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { getInstall } from "@/server/pluginInstalls";
import { getUserById } from "@/server/users";
import { isLeadJourneyEligible } from "@/lib/enquiries/enquiryClassification";
import { timestampFromValue } from "@/lib/shared/formatDateTime";
import {
  workspaceElementAtLeast,
  workspaceElementLevel,
  type WorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";
import {
  selectOperationalUpcomingMeetings,
  type UpcomingMeeting,
} from "@/app/portal/agency/leads-pipeline/_UpcomingMeetings";
import type { JourneyMeetingPerson } from "@/app/portal/clients/_JourneyMeetingsWorkspace";

interface MeetingSourceRecord {
  id: string;
  personId?: string;
  promotedFromLeadId?: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  nextMeetingAt?: number;
  meetingLink?: string;
  meetingNotes?: string;
  meetingMode?: UpcomingMeeting["mode"];
  meetingLocation?: string;
  meetingStatus?: UpcomingMeeting["status"];
  meetingConfirmedAt?: number;
  meetingReminderAt?: number;
  meetingReminderSentAt?: number;
  meetingAttempts?: Array<{
    id: string;
    at: number;
    actorUserId?: string;
    channel: NonNullable<JourneyMeetingPerson["meetingAttempts"]>[number]["channel"];
    outcome: NonNullable<JourneyMeetingPerson["meetingAttempts"]>[number]["outcome"];
    notes?: string;
  }>;
  salesPresentations?: UpcomingMeeting["salesPresentations"];
  callRecordingUrl?: string;
  sessionNotes?: string;
}

interface MeetingContactSource extends MeetingSourceRecord {
  type: "lead" | "customer" | "account" | "vendor" | "employee" | "other";
}

const JOURNEY_CONTACT_TYPES = new Set<MeetingContactSource["type"]>(["lead", "customer", "account"]);

/** A writable combined workbench needs both halves of the relationship data. */
export function canOperateJourneyMeetings(access: WorkspaceElementAccess): boolean {
  return workspaceElementAtLeast(workspaceElementLevel(access, "growth.leads"), "use")
    && workspaceElementAtLeast(workspaceElementLevel(access, "growth.contacts"), "use");
}

/**
 * Every active future Journey Lead or Contact meeting, mapped to the shape the
 * shared `UpcomingMeetings` card renders, de-duplicated and sorted soonest first.
 *
 * Returns `[]` — never throws, and never writes — when the leads module is not
 * installed or enabled. This is a SECONDARY read surface (the Meetings page and
 * the Sales focus home), so it deliberately does NOT install or enable the
 * module the way the leads pipeline itself does: activating a tool belongs to
 * the surface you open to use it, not to a landing that happens to read from it.
 * A missing feed is an empty surface, not a provisioning write on every render.
 */
export async function loadUpcomingMeetings(agencyId: string, referenceNow = Date.now()): Promise<UpcomingMeeting[]> {
  const install = getInstall({ agencyId }, "leads-pipeline");
  if (!install?.enabled) return [];

  const storage = makePluginStorage(install.id);
  const container = leadsContainerFor({ agencyId, storage: storage as never });
  const [leadList, contactList] = await Promise.all([
    container.leads.list(),
    container.contacts.list(),
  ]);

  return deriveOperationalMeetings({
    leads: leadList.filter(isLeadJourneyEligible),
    contacts: contactList,
    referenceNow,
  });
}

/**
 * Load the complete meeting workbench, not just its future reminder feed.
 *
 * The returned projection contains active, historical, terminal, and as-yet
 * unscheduled Journey people so the focused Meetings route can book, prepare,
 * reschedule, and close the same records as Owner Journey. Actor ids stay on
 * the server and are resolved only when they belong to this agency.
 */
export async function loadJourneyMeetingPeople(agencyId: string): Promise<JourneyMeetingPerson[]> {
  const install = getInstall({ agencyId }, "leads-pipeline");
  if (!install?.enabled) return [];

  const storage = makePluginStorage(install.id);
  const container = leadsContainerFor({ agencyId, storage: storage as never });
  const [leadList, contactList] = await Promise.all([
    container.leads.list(),
    container.contacts.list(),
  ]);

  return deriveJourneyMeetingPeople({
    leads: leadList.filter(isLeadJourneyEligible),
    contacts: contactList,
    actorLabelFor: actorUserId => {
      if (!actorUserId) return undefined;
      const actor = getUserById(actorUserId);
      if (!actor || !actor.agencyIds.includes(agencyId)) return "Former team member";
      return actor.name.trim() || actor.email;
    },
  });
}

/**
 * Project the canonical Lead and Contact records into the shared Journey
 * meeting editor. A promoted Contact replaces only its explicitly linked Lead;
 * matching email addresses are never treated as identity evidence.
 */
export function deriveJourneyMeetingPeople({
  leads,
  contacts,
  actorLabelFor,
}: {
  leads: MeetingSourceRecord[];
  contacts: MeetingContactSource[];
  actorLabelFor: (actorUserId?: string) => string | undefined;
}): JourneyMeetingPerson[] {
  const meetingContacts = contacts.filter(contact => JOURNEY_CONTACT_TYPES.has(contact.type));
  const claimedLeadIds = new Set(meetingContacts.flatMap(contact => contact.promotedFromLeadId ? [contact.promotedFromLeadId] : []));

  return [
    ...meetingContacts.map(contact => toJourneyMeetingPerson(contact, "contact", actorLabelFor)),
    ...leads
      .filter(lead => !claimedLeadIds.has(lead.id))
      .map(lead => toJourneyMeetingPerson(lead, "lead", actorLabelFor)),
  ];
}

/**
 * Produce one operational meeting per relationship. Promoted Contacts take
 * precedence over their source Lead when both still carry the copied meeting;
 * no record is written or mirrored into another store.
 */
export function deriveOperationalMeetings({
  leads,
  contacts,
  referenceNow,
}: {
  leads: MeetingSourceRecord[];
  contacts: MeetingContactSource[];
  referenceNow: number;
}): UpcomingMeeting[] {
  const contactMeetings = selectOperationalUpcomingMeetings(
    contacts
      .filter(contact => JOURNEY_CONTACT_TYPES.has(contact.type))
      .map(contact => toUpcomingMeeting(contact, "contact", referenceNow)),
    { limit: Number.POSITIVE_INFINITY, referenceNow },
  );
  const claimedLeadIds = new Set(contactMeetings.flatMap(meeting => meeting.promotedFromLeadId ? [meeting.promotedFromLeadId] : []));
  const leadMeetings = selectOperationalUpcomingMeetings(
    leads
      // Email is not relationship identity: shared inboxes are common and two
      // unrelated meetings may legitimately use the same address. Only the
      // explicit promotion lineage proves that a Contact supersedes a Lead.
      .filter(lead => !claimedLeadIds.has(lead.id))
      .map(lead => toUpcomingMeeting(lead, "lead", referenceNow)),
    { limit: Number.POSITIVE_INFINITY, referenceNow },
  );

  return [...contactMeetings, ...leadMeetings].sort((left, right) => left.meetingAt - right.meetingAt);
}

function toUpcomingMeeting(
  record: MeetingSourceRecord,
  kind: UpcomingMeeting["kind"],
  referenceNow: number,
): UpcomingMeeting & { promotedFromLeadId?: string } {
  const meetingConfirmedAt = timestampFromValue(record.meetingConfirmedAt);
  const meetingReminderAt = timestampFromValue(record.meetingReminderAt);
  const meetingReminderSentAt = timestampFromValue(record.meetingReminderSentAt);
  return {
    id: record.id,
    kind,
    name: record.name,
    email: record.email,
    phone: record.phone,
    company: record.company,
    meetingAt: timestampFromValue(record.nextMeetingAt) ?? Number.NaN,
    meetingLink: record.meetingLink,
    notes: record.meetingNotes,
    mode: record.meetingMode,
    location: record.meetingLocation,
    status: record.meetingStatus,
    confirmed: record.meetingStatus === "confirmed" || meetingConfirmedAt !== undefined,
    reminderDue: meetingReminderAt !== undefined && meetingReminderSentAt === undefined && meetingReminderAt <= referenceNow,
    salesPresentations: record.salesPresentations,
    preparationHref: kind === "lead"
      ? `/portal/agency/pipelines/leads?lead=${encodeURIComponent(record.id)}#lead-record`
      : record.personId
        ? `/portal/agency/contacts/${encodeURIComponent(record.personId)}`
        : "/portal/clients?view=journey",
    progressHref: "/portal/clients?view=journey",
    promotedFromLeadId: record.promotedFromLeadId,
  };
}

function toJourneyMeetingPerson(
  record: MeetingSourceRecord,
  kind: JourneyMeetingPerson["kind"],
  actorLabelFor: (actorUserId?: string) => string | undefined,
): JourneyMeetingPerson {
  return {
    id: record.id,
    kind,
    name: record.name,
    email: record.email,
    phone: record.phone,
    company: record.company,
    serviceNames: [],
    nextMeetingAt: record.nextMeetingAt,
    meetingLink: record.meetingLink,
    meetingNotes: record.meetingNotes,
    meetingMode: record.meetingMode,
    meetingLocation: record.meetingLocation,
    meetingStatus: record.meetingStatus,
    meetingConfirmedAt: record.meetingConfirmedAt,
    meetingReminderAt: record.meetingReminderAt,
    meetingReminderSentAt: record.meetingReminderSentAt,
    meetingAttempts: record.meetingAttempts?.map(attempt => ({
      id: attempt.id,
      at: attempt.at,
      actorLabel: actorLabelFor(attempt.actorUserId),
      channel: attempt.channel,
      outcome: attempt.outcome,
      notes: attempt.notes,
    })),
    salesPresentations: record.salesPresentations,
    callRecordingUrl: record.callRecordingUrl,
    sessionNotes: record.sessionNotes,
  };
}
