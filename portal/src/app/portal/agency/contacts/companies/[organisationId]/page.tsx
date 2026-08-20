import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, CircleAlert, UserRound } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { WEBSITE_ENQUIRY_CLASSIFICATION_LABELS, type WebsiteEnquiryClassification } from "@/lib/enquiries/enquiryClassification";
import { getClientForAgency } from "@/server/tenants";
import {
  derivePersonState,
  listPersons,
  personDisplayName,
  primaryEmail,
} from "@/server/persons";
import {
  deriveOrganisationState,
  getOrganisation,
  listOrganisationPeople,
  organisationCandidatesForPerson,
} from "@/server/organisations";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

/**
 * The company card — every person at one company under one roof, so a
 * relationship spread across ten individuals stops being ten unrelated
 * records.
 *
 * Read-only by design for now: membership decisions belong on the person's
 * card, where the evidence for that specific person is visible. Deciding in
 * bulk from here would mean confirming links without seeing why each was
 * proposed.
 */
export default async function CompanyCardPage({
  params,
}: {
  params: Promise<{ organisationId: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const { organisationId } = await params;

  const organisation = getOrganisation(session.agencyId, organisationId);
  if (!organisation) notFound();

  const state = deriveOrganisationState(organisation);
  const people = listOrganisationPeople(session.agencyId, organisation.id);

  // People the system thinks belong here but nobody has confirmed yet.
  const proposed = listPersons(session.agencyId).filter(person =>
    organisationCandidatesForPerson(session.agencyId, person)
      .some(candidate => candidate.organisationId === organisation.id));

  const clients = (organisation.facets.clientIds ?? [])
    .map(clientId => getClientForAgency(session.agencyId, clientId))
    .filter((client): client is NonNullable<typeof client> => Boolean(client));

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/portal/agency/contacts"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-black/55 hover:text-black/80"
      >
        <ArrowLeft size={15} aria-hidden /> All contacts
      </Link>

      <header className="border-b border-black/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Company · {state}</p>
        <h1 className="mt-1 flex items-center gap-2.5 text-3xl font-semibold text-black/90">
          <Building2 size={26} className="shrink-0 text-black/30" aria-hidden />
          {organisation.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-black/55">
          {organisation.domain ? <span>{organisation.domain}</span> : null}
          {organisation.website ? (
            <a
              href={organisation.website}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-black/20 underline-offset-2"
            >
              Website
            </a>
          ) : null}
          <span>
            {WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[organisation.classification as WebsiteEnquiryClassification]}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-lg border border-black/10 bg-white p-4">
          <h2 className="text-sm font-semibold text-black/80">
            People at this company ({people.length})
          </h2>
          {people.length === 0 ? (
            <p className="mt-2 text-sm text-black/50">
              Nobody confirmed here yet. Confirm somebody&rsquo;s company on their card and they
              will appear.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {people.map(person => (
                <li key={person.id}>
                  <Link
                    href={`/portal/agency/contacts/${encodeURIComponent(person.id)}`}
                    className="flex items-center gap-3 rounded-md border border-black/10 px-3 py-2.5 hover:border-black/25"
                  >
                    <UserRound size={16} className="shrink-0 text-black/35" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-black/85">
                        {personDisplayName(person)}
                        {person.isPrimaryContact ? (
                          <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                            main contact
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-black/50">
                        {[person.jobTitle, primaryEmail(person)].filter(Boolean).join(" · ") || "No details recorded"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-black/8 px-2 py-0.5 text-[11px] font-semibold capitalize text-black/65">
                      {derivePersonState(person)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {proposed.length > 0 ? (
            <div className="mt-4 border-t border-black/8 pt-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <CircleAlert size={13} aria-hidden />
                Possibly here — {proposed.length} awaiting your decision
              </h3>
              <p className="mt-1 text-[11px] text-black/45">
                Open a card to see why it was suggested, then confirm or reject it there.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {proposed.map(person => (
                  <li key={person.id}>
                    <Link
                      href={`/portal/agency/contacts/${encodeURIComponent(person.id)}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/75 hover:bg-black/5"
                    >
                      <UserRound size={14} className="shrink-0 text-black/35" aria-hidden />
                      <span className="truncate">{personDisplayName(person)}</span>
                      {person.jobTitle ? (
                        <span className="truncate text-xs text-black/45">{person.jobTitle}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="flex flex-col gap-5">
          <section className="rounded-lg border border-black/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-black/80">Client workspaces</h2>
            {clients.length === 0 ? (
              <p className="mt-2 text-sm text-black/50">No client workspace yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {clients.map(client => (
                  <li key={client.id}>
                    <Link
                      href={`/portal/clients/${encodeURIComponent(client.id)}`}
                      className="block truncate rounded-md px-2 py-1.5 text-black/75 hover:bg-black/5"
                    >
                      {client.name}
                      <span className="text-xs text-black/45"> · {client.stage}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
