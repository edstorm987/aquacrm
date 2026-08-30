import { notFound } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { getClientForAgency } from "@/server/tenants";
import {
  derivePersonState,
  getPerson,
  personDisplayName,
} from "@/server/persons";
import {
  getOrganisation,
  listOrganisationPeople,
  organisationCandidatesForPerson,
  searchOrganisations,
} from "@/server/organisations";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { personInteractions } from "@/lib/server/personInteractions";

import { ContactCard } from "./_ContactCard";

/**
 * One route for every state a person can be in. The card decides which face
 * to show from `derivePersonState`, so a link to a person keeps working as
 * they move from enquiry to contact to lead to client — the URL never
 * changes underneath an alert, a bookmark or a search result.
 */
export default async function ContactCardPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const { personId } = await params;

  const person = getPerson(session.agencyId, personId);
  if (!person) notFound();

  const state = derivePersonState(person);
  const organisation = person.organisationId
    ? getOrganisation(session.agencyId, person.organisationId)
    : null;

  // Pending company questions, so the operator can answer them here rather
  // than being sent somewhere else to do it.
  const candidates = organisationCandidatesForPerson(session.agencyId, person);

  const colleagues = organisation
    ? listOrganisationPeople(session.agencyId, organisation.id)
        .filter(colleague => colleague.id !== person.id)
        .map(colleague => ({
          id: colleague.id,
          name: personDisplayName(colleague),
          jobTitle: colleague.jobTitle,
        }))
    : [];

  const clients = (person.facets.clientIds ?? [])
    .map(clientId => getClientForAgency(session.agencyId, clientId))
    .filter((client): client is NonNullable<typeof client> => Boolean(client))
    .map(client => ({ id: client.id, name: client.name, stage: client.stage }));

  // Read before deciding: the card cannot ask for a classification while
  // hiding the message it is asking about.
  // …and it must not present a partial story as the whole one: a refused
  // enquiry read is reported, never rendered as "nothing recorded" (issues #57).
  const interactionsRead = await personInteractions(session.agencyId, person.id)
    .catch(() => ({ interactions: [], enquiriesAvailable: false }));

  return (
    <ContactCard
      interactions={interactionsRead.interactions}
      interactionsComplete={interactionsRead.enquiriesAvailable}
      person={person}
      state={state}
      displayName={personDisplayName(person)}
      organisation={organisation ? { id: organisation.id, name: organisation.name, domain: organisation.domain } : null}
      organisationCandidates={candidates}
      colleagues={colleagues}
      clients={clients}
      allOrganisations={searchOrganisations(session.agencyId, "", 200)
        .map(entry => ({ id: entry.id, name: entry.name, domain: entry.domain }))}
    />
  );
}
