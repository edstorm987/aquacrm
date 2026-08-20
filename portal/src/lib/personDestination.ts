import type { Person, PersonState } from "@/server/types";

/**
 * Where clicking a person should take you.
 *
 * The rule, stated once so every list obeys it:
 *
 *   contact / enquiry → the contact card
 *   lead              → the lead card
 *   client            → their internal client workspace
 *
 * Kept as a single helper rather than an href built at each call site, because
 * a person's state changes underneath the links that point at them. A list
 * that hard-codes the contact card keeps sending you there long after they
 * became a client.
 */
export function personDestination(
  person: Pick<Person, "id" | "facets">,
  state: PersonState,
): string {
  if (state === "client") {
    const clientId = person.facets.clientIds?.[0];
    // Fall through to the card when the state says client but no workspace id
    // survived — a dead link is worse than the card it came from.
    if (clientId) return `/portal/clients/${encodeURIComponent(clientId)}`;
  }
  if (state === "lead" && person.facets.leadId) {
    return `/portal/agency/pipelines/leads?lead=${encodeURIComponent(person.facets.leadId)}`;
  }
  return `/portal/agency/contacts/${encodeURIComponent(person.id)}`;
}

/**
 * The card itself, regardless of state.
 *
 * Used where the destination must be the card specifically — resolving a
 * classification, for instance, which happens there and nowhere else.
 */
export function personCardHref(personId: string): string {
  return `/portal/agency/contacts/${encodeURIComponent(personId)}`;
}
