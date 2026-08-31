import "server-only";
// Customer companies, and the people who work at them.
//
// A buyer is frequently an organisation rather than one human: a company may
// put an owner, a finance contact and several execs in front of you, and any
// of them may email, book a meeting, or appear on an enquiry. Without this
// they become unrelated records and the relationship scatters.
//
// NOT `TradingCompany`, which is one of Ed's OWN brands and drives
// customer-facing portal branding.
//
// The contract with the operator: this module PROPOSES membership, it never
// assumes it. Confirmation happens on the person's card.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import { emitDurable } from "./outbox";
import { listPersons, personEmailDomains } from "./persons";
import type {
  Organisation,
  Person,
  PersonClassification,
  PersonState,
} from "./types";

function makeId(): string {
  return `org_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim().slice(0, limit);
  return trimmed || undefined;
}

/**
 * Consumer mailbox providers. Two people at `@gmail.com` share a mailbox
 * provider, not an employer — grouping on these would collapse most of the
 * address book into one nonsense company.
 *
 * Deliberately conservative: a domain missing from this list produces a
 * suggestion a human can reject, whereas a domain wrongly absent from it
 * produces a confident wrong grouping.
 */
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk",
  "live.com", "live.co.uk", "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me",
  "gmx.com", "gmx.co.uk", "mail.com", "zoho.com", "yandex.com", "fastmail.com",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "ntlworld.com",
  "blueyonder.co.uk", "tiscali.co.uk", "example.com", "example.org",
]);

export function isGenericEmailDomain(domain: string): boolean {
  return GENERIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

export function normaliseDomain(value: string | undefined): string {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  // Accept a bare domain, an email, or a URL.
  const afterAt = raw.includes("@") ? raw.split("@").at(-1) ?? "" : raw;
  return afterAt
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

// ─── Derived state ────────────────────────────────────────────────────────

/** Mirrors `derivePersonState` so a company card reads the same way. */
export function deriveOrganisationState(organisation: Organisation): PersonState {
  if (organisation.facets.clientIds?.length) return "client";
  if (organisation.classification === "sales") return "lead";
  if (organisation.classification === "unclassified") return "enquiry";
  return "contact";
}

// ─── Reads ────────────────────────────────────────────────────────────────

export function getOrganisation(agencyId: string, organisationId: string): Organisation | null {
  const organisation = getState().organisations[organisationId];
  return organisation && organisation.agencyId === agencyId ? organisation : null;
}

export function listOrganisations(agencyId: string): Organisation[] {
  return Object.values(getState().organisations)
    .filter(organisation => organisation.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findOrganisationByDomain(agencyId: string, domain: string): Organisation | null {
  const normalised = normaliseDomain(domain);
  if (!normalised || isGenericEmailDomain(normalised)) return null;
  return listOrganisations(agencyId).find(organisation => organisation.domain === normalised) ?? null;
}

export function findOrganisationByName(agencyId: string, name: string): Organisation | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return listOrganisations(agencyId).find(organisation =>
    organisation.name.trim().toLowerCase() === needle) ?? null;
}

/** Everyone confirmed as working at this company. */
export function listOrganisationPeople(agencyId: string, organisationId: string): Person[] {
  return listPersons(agencyId).filter(person => person.organisationId === organisationId);
}

/**
 * Free-text search across companies, for the card's link control. Matches
 * name and domain.
 */
export function searchOrganisations(agencyId: string, query: string, limit = 20): Organisation[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return listOrganisations(agencyId).slice(0, limit);
  return listOrganisations(agencyId)
    .filter(organisation =>
      organisation.name.toLowerCase().includes(needle)
      || (organisation.domain ?? "").includes(needle))
    .slice(0, limit);
}

// ─── Writes ───────────────────────────────────────────────────────────────

export interface UpsertOrganisationInput {
  name: string;
  domain?: string;
  website?: string;
  phone?: string;
  classification?: PersonClassification;
  relationshipId?: string;
  source?: string;
  clientIds?: string[];
  enquiryIds?: string[];
}

export interface UpsertOrganisationResult {
  organisation: Organisation;
  created: boolean;
}

/**
 * Match on domain, then exact name, and create or enrich. A generic mailbox
 * domain is never stored — it would match unrelated companies later.
 */
export function upsertOrganisation(agencyId: string, input: UpsertOrganisationInput): UpsertOrganisationResult {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new Error("An organisation name is required.");
  const domainCandidate = normaliseDomain(input.domain);
  const domain = domainCandidate && !isGenericEmailDomain(domainCandidate) ? domainCandidate : undefined;

  const existing = (domain ? findOrganisationByDomain(agencyId, domain) : null)
    ?? findOrganisationByName(agencyId, name);
  const now = Date.now();

  if (existing) {
    const next: Organisation = {
      ...existing,
      name: existing.name || name,
      domain: existing.domain ?? domain,
      website: existing.website ?? clean(input.website, 300),
      phone: existing.phone ?? clean(input.phone, 60),
      classification: input.classification && input.classification !== "unclassified"
        ? input.classification
        : existing.classification,
      facets: {
        clientIds: mergeIds(existing.facets.clientIds, input.clientIds),
        enquiryIds: mergeIds(existing.facets.enquiryIds, input.enquiryIds),
      },
      relationshipId: input.relationshipId?.trim() || existing.relationshipId,
      updatedAt: now,
    };
    mutate(state => { state.organisations[next.id] = next; });
    emitDurable({ name: "organisation.updated", agencyId, source: "server/organisations", payload: { organisationId: next.id } });
    return { organisation: next, created: false };
  }

  const organisation: Organisation = {
    id: makeId(),
    agencyId,
    name,
    domain,
    website: clean(input.website, 300),
    phone: clean(input.phone, 60),
    classification: input.classification ?? "unclassified",
    classificationHistory: [],
    facets: {
      clientIds: mergeIds(undefined, input.clientIds),
      enquiryIds: mergeIds(undefined, input.enquiryIds),
    },
    relationshipId: input.relationshipId?.trim() || undefined,
    source: clean(input.source, 120),
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.organisations[organisation.id] = organisation; });
  emitDurable({ name: "organisation.created", agencyId, source: "server/organisations", payload: { organisationId: organisation.id } });
  return { organisation, created: true };
}

export interface UpdateOrganisationPatch {
  name?: string;
  domain?: string;
  website?: string;
  phone?: string;
  relationshipId?: string;
}

export function updateOrganisation(
  agencyId: string,
  organisationId: string,
  patch: UpdateOrganisationPatch,
): Organisation | null {
  const existing = getOrganisation(agencyId, organisationId);
  if (!existing) return null;
  const domainCandidate = patch.domain !== undefined ? normaliseDomain(patch.domain) : undefined;
  const next: Organisation = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim().slice(0, 200) || existing.name : existing.name,
    domain: domainCandidate !== undefined
      ? (domainCandidate && !isGenericEmailDomain(domainCandidate) ? domainCandidate : undefined)
      : existing.domain,
    website: patch.website !== undefined ? clean(patch.website, 300) : existing.website,
    phone: patch.phone !== undefined ? clean(patch.phone, 60) : existing.phone,
    relationshipId: patch.relationshipId !== undefined
      ? patch.relationshipId.trim() || undefined
      : existing.relationshipId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.organisations[organisationId] = next; });
  emitDurable({ name: "organisation.updated", agencyId, source: "server/organisations", payload: { organisationId } });
  return next;
}

// ─── Membership candidates ────────────────────────────────────────────────

export interface OrganisationCandidate {
  organisationId: string;
  organisationName: string;
  confidence: number;
  reason: string;
}

/**
 * Propose companies for a person, strongest first. Returns candidates only —
 * writing the suggestion and asking the operator is the caller's job.
 *
 * Skips anyone already placed, and anything the operator previously rejected.
 */
export function organisationCandidatesForPerson(
  agencyId: string,
  person: Person,
): OrganisationCandidate[] {
  if (person.organisationId) return [];
  const rejected = new Set(
    (person.organisationLinks ?? [])
      .filter(link => link.status === "rejected")
      .map(link => link.organisationId),
  );

  const candidates = new Map<string, OrganisationCandidate>();

  // Strongest signal: a work email domain matching a known company.
  for (const domain of personEmailDomains(person)) {
    if (isGenericEmailDomain(domain)) continue;
    const match = findOrganisationByDomain(agencyId, domain);
    if (!match || rejected.has(match.id)) continue;
    candidates.set(match.id, {
      organisationId: match.id,
      organisationName: match.name,
      confidence: 0.9,
      reason: `Shares the email domain ${domain}`,
    });
  }

  // Weaker: the free-text company name captured on the record.
  const named = person.company ? findOrganisationByName(agencyId, person.company) : null;
  if (named && !rejected.has(named.id) && !candidates.has(named.id)) {
    candidates.set(named.id, {
      organisationId: named.id,
      organisationName: named.name,
      confidence: 0.6,
      reason: `Company recorded as "${person.company}"`,
    });
  }

  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence);
}

export interface OrganisationSuggestionBatch {
  organisationId: string;
  organisationName: string;
  reason: string;
  people: Person[];
}

/**
 * Group pending membership questions by company, so an import of 200 rows
 * asks "these 6 people are all at Cedar Dental?" once rather than six times.
 */
export function batchOrganisationSuggestions(agencyId: string): OrganisationSuggestionBatch[] {
  const batches = new Map<string, OrganisationSuggestionBatch>();

  for (const person of listPersons(agencyId)) {
    for (const candidate of organisationCandidatesForPerson(agencyId, person)) {
      const batch = batches.get(candidate.organisationId) ?? {
        organisationId: candidate.organisationId,
        organisationName: candidate.organisationName,
        reason: candidate.reason,
        people: [],
      };
      batch.people.push(person);
      batches.set(candidate.organisationId, batch);
    }
  }

  return [...batches.values()].sort((a, b) => b.people.length - a.people.length);
}

// ─── Internals ────────────────────────────────────────────────────────────

function mergeIds(base?: string[], incoming?: string[]): string[] | undefined {
  if (!base?.length && !incoming?.length) return undefined;
  return [...new Set([...(base ?? []), ...(incoming ?? [])])].slice(0, 200);
}
