import { requireRole } from "@/lib/server/auth";
import {
  derivePersonState,
  listPersons,
  personDisplayName,
  primaryEmail,
  primaryPhone,
} from "@/server/persons";
import {
  deriveOrganisationState,
  listOrganisationPeople,
  listOrganisations,
  organisationCandidatesForPerson,
} from "@/server/organisations";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { personDestination } from "@/lib/personDestination";

import { ContactsIndex } from "./_ContactsIndex";

/**
 * One searchable directory of every card — people and companies together.
 *
 * Deliberately not split into separate "contacts" and "companies" screens:
 * when you are looking for someone you rarely know in advance whether they
 * were filed as a person or as a business.
 */
export default async function ContactsIndexPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);

  const people = listPersons(session.agencyId).map(person => ({
    id: person.id,
    // Resolved server-side so the rule lives in one place, not in each list.
    href: personDestination(person, derivePersonState(person)),
    name: personDisplayName(person),
    state: derivePersonState(person),
    classification: person.classification,
    jobTitle: person.jobTitle,
    email: primaryEmail(person),
    phone: primaryPhone(person),
    organisationId: person.organisationId,
    pendingCompanyQuestion: organisationCandidatesForPerson(session.agencyId, person).length > 0,
  }));

  const companies = listOrganisations(session.agencyId).map(organisation => ({
    id: organisation.id,
    name: organisation.name,
    state: deriveOrganisationState(organisation),
    classification: organisation.classification,
    domain: organisation.domain,
    peopleCount: listOrganisationPeople(session.agencyId, organisation.id).length,
  }));

  return <ContactsIndex people={people} companies={companies} />;
}
