import "server-only";

import { getState, mutate } from "./storage";

/**
 * Operator-added contact details for an enquiry (enquiry-detail-card plan,
 * Phase 4 — the "the form didn't give us this, add it manually" affordance).
 *
 * A website form rarely asks everything Aqua's contact record wants — company,
 * job title, and whatever the operator learns on a call. This is where the
 * operator records those by hand, attached to the enquiry, without touching the
 * captured submission (which is a record of what the visitor actually sent) or
 * the live enquiry row.
 *
 * File-backed and agency-scoped, keyed by enquiry id. It deliberately does NOT
 * write to the canonical `Person` yet — that flows on conversion (Create lead /
 * contact) and would edit the shared people model; keeping it enquiry-scoped
 * keeps this slice self-contained and safe. `customFields` gives non-standard
 * details (including imported form fields) a home rather than being lost.
 */

export interface EnquiryContactDetails {
  enquiryId: string;
  agencyId: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  /** Details Aqua has no column of its own for — key → value. */
  customFields: Record<string, string>;
  updatedAt: number;
  updatedBy: string;
}

const MAX_CUSTOM = 30;
const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The operator-added details for an enquiry, agency-scoped (null if none / not this agency's). */
export function getEnquiryContactDetails(agencyId: string, enquiryId: string): EnquiryContactDetails | null {
  const record = getState().enquiryContactDetails?.[enquiryId];
  return record && record.agencyId === agencyId ? record : null;
}

export function saveEnquiryContactDetails(input: {
  agencyId: string;
  enquiryId: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  customFields?: Record<string, string>;
  updatedBy: string;
}): EnquiryContactDetails {
  const enquiryId = (input.enquiryId ?? "").trim();
  if (!enquiryId) throw new Error("Which enquiry these details belong to is required.");
  const existing = getState().enquiryContactDetails?.[enquiryId];
  if (existing && existing.agencyId !== input.agencyId) throw new Error("That enquiry belongs to another workspace.");

  // Keep only clean key/value pairs; blanks and overflow are dropped so the
  // store never fills with junk.
  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.customFields ?? {})) {
    const cleanKey = clip(key, 60);
    const cleanValue = clip(value, 500);
    if (cleanKey && cleanValue && Object.keys(customFields).length < MAX_CUSTOM) customFields[cleanKey] = cleanValue;
  }

  const record: EnquiryContactDetails = {
    enquiryId,
    agencyId: input.agencyId,
    company: clip(input.company, 160) || undefined,
    jobTitle: clip(input.jobTitle, 160) || undefined,
    notes: clip(input.notes, 4000) || undefined,
    customFields,
    updatedAt: Date.now(),
    updatedBy: input.updatedBy,
  };
  mutate(state => {
    state.enquiryContactDetails ??= {};
    state.enquiryContactDetails[enquiryId] = record;
  });
  return record;
}
