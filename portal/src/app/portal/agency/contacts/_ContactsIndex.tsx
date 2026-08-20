"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CircleAlert, Search, UserRound } from "lucide-react";

import {
  WEBSITE_ENQUIRY_CLASSIFICATION_LABELS,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiryClassification";
import type { PersonState } from "@/server/types";

interface PersonRow {
  id: string;
  /** Where this person opens — depends on what they are now. */
  href: string;
  name: string;
  state: PersonState;
  classification: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  organisationId?: string;
  pendingCompanyQuestion: boolean;
}

interface CompanyRow {
  id: string;
  name: string;
  state: PersonState;
  classification: string;
  domain?: string;
  peopleCount: number;
}

const STATE_LABELS: Record<PersonState, string> = {
  enquiry: "Enquiry",
  contact: "Contact",
  lead: "Lead",
  client: "Client",
};

type Filter = "all" | "people" | "companies" | "questions";

export function ContactsIndex({ people, companies }: { people: PersonRow[]; companies: CompanyRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const needle = query.trim().toLowerCase();
  const pendingCount = people.filter(person => person.pendingCompanyQuestion).length;

  // Search covers name, role, email, phone and domain — you rarely remember
  // which field you know somebody by.
  const matchedPeople = useMemo(() => people.filter(person => {
    if (filter === "companies") return false;
    if (filter === "questions" && !person.pendingCompanyQuestion) return false;
    if (!needle) return true;
    return [person.name, person.jobTitle, person.email, person.phone]
      .some(value => value?.toLowerCase().includes(needle));
  }), [people, needle, filter]);

  const matchedCompanies = useMemo(() => companies.filter(company => {
    if (filter === "people" || filter === "questions") return false;
    if (!needle) return true;
    return [company.name, company.domain]
      .some(value => value?.toLowerCase().includes(needle));
  }), [companies, needle, filter]);

  const empty = matchedPeople.length === 0 && matchedCompanies.length === 0;

  return (
    <div className="flex flex-col gap-5" data-testid="contacts-index">
      <header className="border-b border-black/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Journey</p>
        <h1 className="mt-1 text-3xl font-semibold text-black/90">Contacts</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
          Every person and company you deal with. A card carries its history as the
          relationship moves from enquiry to contact to lead to client.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/45">
          <span><strong className="text-black/75">{people.length}</strong> {people.length === 1 ? "person" : "people"}</span>
          <span><strong className="text-black/75">{companies.length}</strong> {companies.length === 1 ? "company" : "companies"}</span>
          {pendingCount > 0 ? (
            <span className="text-amber-700"><strong>{pendingCount}</strong> company question{pendingCount === 1 ? "" : "s"} waiting</span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={17} aria-hidden />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name, role, email, number or domain"
            aria-label="Search contacts and companies"
            className="h-11 w-full rounded-md border border-black/12 bg-white pl-10 pr-3 text-sm text-black/80 outline-none focus:border-brand"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filter contacts">
          {([
            ["all", "All"],
            ["people", "People"],
            ["companies", "Companies"],
            ["questions", `Questions${pendingCount ? ` (${pendingCount})` : ""}`],
          ] as Array<[Filter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`h-11 shrink-0 rounded-md px-3.5 text-sm font-semibold ${
                filter === value ? "bg-black text-white" : "border border-black/15 bg-white text-black/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="rounded-lg border border-dashed border-black/15 px-4 py-10 text-center text-sm text-black/50">
          {needle
            ? `Nothing matches “${query.trim()}”.`
            : filter === "questions"
              ? "No company questions waiting."
              : "No contacts yet. They appear here as enquiries arrive."}
        </p>
      ) : null}

      {matchedCompanies.length > 0 ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/45">Companies</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {matchedCompanies.map(company => (
              <li key={company.id}>
                <Link
                  href={`/portal/agency/contacts/companies/${encodeURIComponent(company.id)}`}
                  className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5 hover:border-black/25"
                >
                  <Building2 size={17} className="shrink-0 text-black/35" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-black/85">{company.name}</span>
                    <span className="block truncate text-xs text-black/50">
                      {company.domain ?? "No domain recorded"}
                      {company.peopleCount > 0 ? ` · ${company.peopleCount} ${company.peopleCount === 1 ? "person" : "people"}` : null}
                    </span>
                  </span>
                  <StateBadge state={company.state} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {matchedPeople.length > 0 ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/45">People</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {matchedPeople.map(person => (
              <li key={person.id}>
                <Link
                  href={person.href}
                  className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5 hover:border-black/25"
                >
                  <UserRound size={17} className="shrink-0 text-black/35" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-black/85">{person.name}</span>
                    <span className="block truncate text-xs text-black/50">
                      {[person.jobTitle, person.email ?? person.phone].filter(Boolean).join(" · ") || "No details recorded"}
                    </span>
                  </span>
                  {person.pendingCompanyQuestion ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                      title="A company suggestion is waiting for your decision"
                    >
                      <CircleAlert size={12} aria-hidden /> Company?
                    </span>
                  ) : null}
                  <StateBadge state={person.state} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: PersonState }) {
  const tone = state === "client"
    ? "bg-emerald-100 text-emerald-800"
    : state === "lead"
      ? "bg-blue-100 text-blue-800"
      : state === "contact"
        ? "bg-black/8 text-black/65"
        : "bg-black/5 text-black/45";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {STATE_LABELS[state]}
    </span>
  );
}

export function classificationLabel(value: string): string {
  return WEBSITE_ENQUIRY_CLASSIFICATION_LABELS[value as WebsiteEnquiryClassification] ?? value;
}
