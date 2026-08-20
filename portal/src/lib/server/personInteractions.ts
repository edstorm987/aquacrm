import "server-only";
// Gather everything that has passed between the agency and one person.
//
// Built server-side because the enquiry rows live in Supabase and the person
// record lives in the portal state — the card should not have to know that.

import { getRequestWebsiteEnquiries } from "@/lib/server/websiteEnquiries";
import { getPerson } from "@/server/persons";
import type { PersonInteraction, InteractionField } from "@/lib/inbox/personInteractions";
import { sortInteractions } from "@/lib/inbox/personInteractions";

export async function personInteractions(
  agencyId: string,
  personId: string,
): Promise<PersonInteraction[]> {
  const person = getPerson(agencyId, personId);
  if (!person) return [];

  const knownEmails = new Set((person.emails ?? []).map(entry => entry.value));
  const knownPhones = new Set((person.phones ?? []).map(entry => entry.value));
  const knownEnquiries = new Set(person.facets.enquiryIds ?? []);

  const enquiries = await getRequestWebsiteEnquiries(agencyId).catch(() => []);
  const interactions: PersonInteraction[] = [];

  for (const enquiry of enquiries) {
    // Match on the recorded facet first, then on identity — an enquiry that
    // arrived before the person existed still belongs to them.
    const mine = knownEnquiries.has(enquiry.id)
      || enquiry.personId === personId
      || (enquiry.email ? knownEmails.has(enquiry.email.trim().toLowerCase()) : false)
      || (enquiry.phone ? [...knownPhones].some(value => value.endsWith(enquiry.phone!.replace(/\D/g, "").slice(-9))) : false);
    if (!mine) continue;

    const fields: InteractionField[] = [
      { label: "Name", value: enquiry.name || "—" },
      { label: "Email", value: enquiry.email || "—" },
      { label: "Phone", value: enquiry.phone || "—" },
      { label: "Preferred contact", value: enquiry.contactMethod || "—" },
      { label: "Services asked about", value: enquiry.services.length ? enquiry.services.join(", ") : "—" },
      { label: "Page", value: enquiry.pagePath || "—" },
      { label: "Campaign", value: enquiry.campaign || "—" },
      // Consent decides what you are allowed to do next, so it is never
      // buried among the ordinary fields.
      {
        label: "Consent given",
        value: enquiry.consent === true
          ? `Yes${enquiry.consentPurpose ? ` — ${enquiry.consentPurpose}` : ""}`
          : enquiry.consent === false
            ? "No"
            : "Not recorded",
        important: true,
      },
    ];
    if (enquiry.consentCapturedAt) {
      fields.push({
        label: "Consent captured",
        value: new Date(enquiry.consentCapturedAt).toLocaleString("en-GB"),
        important: true,
      });
    }
    if (enquiry.consentVersion !== undefined) {
      fields.push({ label: "Consent version", value: String(enquiry.consentVersion) });
    }

    interactions.push({
      id: enquiry.id,
      kind: "enquiry",
      at: enquiry.submittedAt,
      summary: enquiry.topic || `Enquiry from ${enquiry.siteName}`,
      body: enquiry.message,
      fields,
      source: enquiry.siteName,
      href: `/portal/agency/inbox?view=all&form=${encodeURIComponent(enquiry.id)}`,
    });

    for (const reply of enquiry.replies) {
      interactions.push({
        id: reply.id,
        kind: "reply",
        at: reply.sentAt,
        summary: `${reply.channel} to ${reply.recipient}`,
        body: reply.message,
        fields: [
          { label: "Channel", value: reply.channel },
          { label: "Status", value: reply.status, important: reply.status === "failed" },
          { label: "Sent via", value: reply.via },
        ],
      });
    }

    for (const call of enquiry.calls) {
      interactions.push({
        id: call.id,
        kind: "call",
        at: call.startedAt,
        summary: `Call with ${call.phone}`,
        body: call.notes,
        fields: [
          { label: "Outcome", value: call.outcome ?? call.status },
          { label: "Duration", value: call.durationSeconds ? `${Math.round(call.durationSeconds / 60)} min` : "—" },
          { label: "Recording", value: call.recording ? "Held, consent confirmed" : "None", important: Boolean(call.recording) },
        ],
      });
    }
  }

  // Hand-recorded meetings, calls and notes sit in the same timeline as the
  // enquiries they relate to — a relationship is one story, not two lists.
  for (const entry of person.record ?? []) {
    const fields: InteractionField[] = [];
    if (entry.location) fields.push({ label: "Where", value: entry.location });
    if (entry.outcome) fields.push({ label: "Outcome", value: entry.outcome, important: true });
    fields.push({ label: "Recorded", value: new Date(entry.createdAt).toLocaleString("en-GB") });

    interactions.push({
      id: entry.id,
      kind: entry.kind === "call" ? "call" : entry.kind === "meeting" ? "meeting" : "note",
      at: entry.at,
      summary: entry.summary,
      body: entry.body,
      fields,
    });
  }

  return sortInteractions(interactions);
}
