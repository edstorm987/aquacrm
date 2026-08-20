/**
 * Everything that has passed between the agency and a person.
 *
 * The contact card asks you to decide what somebody is — sales, supplier,
 * spam — while showing you none of what they actually said. That is not a
 * decision, it is a guess. Interactions puts the enquiry, its form fields and
 * its consent state on the same screen as the buttons that classify it.
 *
 * Deliberately a lightweight ledger, not the full client record: it carries
 * what a pre-client relationship accumulates, and seeds the real client record
 * when they convert.
 */

export type InteractionKind = "enquiry" | "reply" | "call" | "meeting" | "note";

export interface InteractionField {
  label: string;
  value: string;
  /** Fields the operator must see before deciding — consent above all. */
  important?: boolean;
}

export interface PersonInteraction {
  id: string;
  kind: InteractionKind;
  /** When it happened. */
  at: number;
  /** One-line summary for the collapsed row. */
  summary: string;
  /** Free text — the message body, call notes, meeting outcome. */
  body?: string;
  /** Every field the form captured, so nothing is hidden behind a summary. */
  fields: InteractionField[];
  /** Which site or channel it arrived through. */
  source?: string;
  href?: string;
}

export const INTERACTION_LABELS: Record<InteractionKind, string> = {
  enquiry: "Enquiry",
  reply: "Reply sent",
  call: "Call",
  meeting: "Meeting",
  note: "Note",
};

/** Newest first — the last thing that happened is what you need first. */
export function sortInteractions(interactions: PersonInteraction[]): PersonInteraction[] {
  return [...interactions].sort((a, b) => b.at - a.at);
}
