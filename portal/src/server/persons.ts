import "server-only";
// Canonical people. One `Person` per real human, with `Lead`, `Contact` and
// `Client` hanging off it as facets.
//
// The rule this module exists to enforce: reclassifying somebody must never
// destroy their history. Before this, classifying a sales lead as a supplier
// called `leads.delete()` — a real `storage.del()` — taking the meeting
// notes, call recording, sales presentations and journey events with it.
// Here, classification changes state on the Person and the facets are kept.
//
// Every list/get accepts `agencyId` and filters on it, per the pool-model
// scoping contract in `04-architecture.md §6`.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import { emitDurable } from "./outbox";
import { normaliseIdentityEmail, normaliseIdentityPhone } from "@/lib/server/identityResolution";
import type {
  IdentityResolutionSource,
  Person,
  PersonClassification,
  PersonEmail,
  PersonFacets,
  PersonPhone,
  PersonRecordEntry,
  PersonState,
} from "./types";

function makeId(): string {
  return `per_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim().slice(0, limit);
  return trimmed || undefined;
}

// ─── Derived state ────────────────────────────────────────────────────────

/**
 * The face the card leads with. Always computed, never stored, so it cannot
 * drift out of sync with the records that back it.
 *
 * A retained `leadId` on someone reclassified away from sales deliberately
 * reads as `contact`, not `lead` — the sales history survives, but they are
 * no longer in the sales journey.
 */
export function derivePersonState(person: Person): PersonState {
  if (person.facets.clientIds?.length) return "client";
  if (person.classification === "sales" && person.facets.leadId) return "lead";
  // "enquiry" means UNDECIDED. Once an operator has classified somebody they
  // are at least a contact, whether or not a facet record exists yet —
  // otherwise a classified person with a name, role and company still reads
  // as a raw enquiry, which is plainly wrong on the card.
  if (person.classification !== "unclassified") return "contact";
  if (person.facets.contactId || person.facets.leadId) return "contact";
  return "enquiry";
}

/** Whether this person belongs in the sales Journey. */
export function isJourneyPerson(person: Person): boolean {
  const state = derivePersonState(person);
  return state === "lead" || state === "client";
}

export function personDisplayName(person: Person): string {
  return person.name?.trim()
    || person.company?.trim()
    || primaryEmail(person)
    || primaryPhone(person)
    || "Unnamed person";
}

/** The address to use by default — the one flagged primary, else the first. */
export function primaryEmail(person: Person): string | undefined {
  const entries = person.emails ?? [];
  return (entries.find(entry => entry.isPrimary) ?? entries[0])?.value;
}

export function primaryPhone(person: Person): string | undefined {
  const entries = person.phones ?? [];
  return (entries.find(entry => entry.isPrimary) ?? entries[0])?.value;
}

/** Email domains this person is known by, for organisation grouping. */
export function personEmailDomains(person: Person): string[] {
  return [...new Set(
    (person.emails ?? [])
      .map(entry => entry.value.split("@").at(-1) ?? "")
      .filter(Boolean),
  )];
}

// ─── Reads ────────────────────────────────────────────────────────────────

export function getPerson(agencyId: string, personId: string): Person | null {
  const person = getState().persons[personId];
  return person && person.agencyId === agencyId ? person : null;
}

export function listPersons(agencyId: string): Person[] {
  return Object.values(getState().persons)
    .filter(person => person.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface PersonIdentity {
  emails?: (string | undefined)[];
  phones?: (string | undefined)[];
  /** Used only to reject a phone-only match between clearly different people. */
  name?: string;
}

/**
 * Find an existing person by any known email, then any known phone. Someone
 * who first arrives on a work address and later emails from a personal one
 * must resolve to the same person, so every stored value is considered — not
 * just the primary.
 *
 * Deliberately a scan: identity values are normalised at write time and the
 * agency population is small. If this ever gets hot, add an index alongside
 * `persons` rather than denormalising keys onto another aggregate.
 */
export function findPersonByIdentity(agencyId: string, identity: PersonIdentity): Person | null {
  const emails = normaliseAll(identity.emails, normaliseIdentityEmail);
  const phones = normaliseAll(identity.phones, normaliseIdentityPhone);
  if (!emails.length && !phones.length) return null;

  // Identity ownership must not change merely because a card was edited most
  // recently. Oldest-first also gives legacy duplicate data a stable owner
  // until an operator reviews it.
  const candidates = listPersons(agencyId)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  if (emails.length) {
    const match = candidates.find(person =>
      (person.emails ?? []).some(entry => emails.includes(entry.value)));
    if (match) return match;
  }
  if (phones.length) {
    const identifyingMatches = candidates.filter(person =>
      !namesConflict(person.name, identity.name)
      && (person.phones ?? []).some(entry => !entry.shared && phones.includes(entry.value)));
    // A shared number is NOT proof of a shared person. A company switchboard,
    // a reception line or a couple's landline would otherwise collapse every
    // person behind it into one record — and merging is far harder to undo
    // than leaving two records that can be linked later.
    //
    // So a phone match is only trusted when the names do not actively
    // disagree. Same number and no name, or same number and the same name, is
    // still a match.
    if (identifyingMatches.length === 1) return identifyingMatches[0];

    // Once a number is known to be shared it is not identity by itself. The
    // number plus one unambiguous compatible name can still reconnect a
    // repeated import to the right colleague, though, instead of creating a
    // fresh card every time that switchboard appears.
    if (identity.name?.trim()) {
      const sharedMatches = candidates.filter(person =>
        person.name?.trim()
        && !namesConflict(person.name, identity.name)
        && (person.phones ?? []).some(entry => entry.shared && phones.includes(entry.value)));
      if (sharedMatches.length === 1) return sharedMatches[0];
    }
  }
  return null;
}

/**
 * Whether two names clearly describe different people.
 *
 * Deliberately conservative: only an explicit disagreement counts. A missing
 * name is not a disagreement, or a record captured without one would never
 * match anything.
 */
function namesConflict(a: string | undefined, b: string | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return false;
  // First names matching is enough to treat as the same person — "Ruth" and
  // "Ruth Adeyemi" are not a conflict.
  const [leftFirst] = left.split(/\s+/);
  const [rightFirst] = right.split(/\s+/);
  if (leftFirst && leftFirst === rightFirst) return false;
  return true;
}

function normaliseAll(
  values: (string | undefined)[] | undefined,
  normalise: (value: string | undefined) => string,
): string[] {
  // Call with exactly one argument. `.map(normalise)` would pass
  // (value, index, array), and `normaliseIdentityPhone(value, countryCode)`
  // then reads the index as its default country code — at index 0 that is
  // falsy, so "07305 410203" normalises to "+07305410203" on lookup while
  // buildPhones stored "+447305410203". Nothing ever matched, and every
  // upsert created a duplicate.
  return [...new Set((values ?? []).map(value => normalise(value)).filter(Boolean))];
}

/** Find the person a given facet record belongs to. */
export function findPersonByFacet(
  agencyId: string,
  facet: { leadId?: string; contactId?: string; clientId?: string; enquiryId?: string },
): Person | null {
  return listPersons(agencyId).find(person => {
    if (facet.leadId && person.facets.leadId === facet.leadId) return true;
    if (facet.contactId && person.facets.contactId === facet.contactId) return true;
    if (facet.clientId && person.facets.clientIds?.includes(facet.clientId)) return true;
    if (facet.enquiryId && person.facets.enquiryIds?.includes(facet.enquiryId)) return true;
    return false;
  }) ?? null;
}

// ─── Writes ───────────────────────────────────────────────────────────────

export interface UpsertPersonInput {
  emails?: (string | undefined)[];
  phones?: (string | undefined)[];
  name?: string;
  company?: string;
  jobTitle?: string;
  source?: string;
  relationshipId?: string;
  classification?: PersonClassification;
  facets?: PersonFacets;
}

export interface UpsertPersonResult {
  person: Person;
  created: boolean;
}

/**
 * Match on identity and create or enrich. Never overwrites a known value with
 * an empty one, and never downgrades a decided classification back to
 * `unclassified` — a later record arriving with less information must not
 * erase what an operator already decided.
 */
export function upsertPerson(agencyId: string, input: UpsertPersonInput): UpsertPersonResult {
  let emails = buildEmails(input.emails);
  let phones = buildPhones(input.phones);

  // Match on identity first, then fall back to the facet records supplied.
  //
  // The facet fallback is load-bearing, not a nicety: an enquiry with no
  // email AND no phone matches nothing by identity, so without it every call
  // creates a fresh person. `synchroniseWebsiteEnquiryIdentities` runs on
  // each inbox render, which turned that into unbounded duplication — 42
  // copies of a handful of people.
  const existing = findPersonByIdentity(agencyId, { emails: input.emails, phones: input.phones, name: input.name })
    ?? (input.facets ? findPersonByFacet(agencyId, {
      leadId: input.facets.leadId,
      contactId: input.facets.contactId,
      clientId: input.facets.clientIds?.[0],
      enquiryId: input.facets.enquiryIds?.[0],
    }) : null);
  const identitySettlement = settleIncomingIdentityOwnership(
    agencyId,
    existing?.id,
    input.name,
    emails,
    phones,
  );
  ({ emails, phones } = identitySettlement);
  const now = Date.now();

  if (existing) {
    const next: Person = {
      ...existing,
      // New addresses are added, never replaced — a second email on an
      // existing person is extra identity, not a correction.
      emails: mergeIdentityValues(existing.emails, emails),
      phones: mergeIdentityValues(
        markPhoneValuesShared(existing.phones, identitySettlement.sharedPhoneValues),
        phones,
      ),
      name: clean(input.name, 160) ?? existing.name,
      company: clean(input.company, 160) ?? existing.company,
      jobTitle: clean(input.jobTitle, 120) ?? existing.jobTitle,
      source: existing.source ?? clean(input.source, 120),
      relationshipId: input.relationshipId?.trim() || existing.relationshipId,
      classification: input.classification && input.classification !== "unclassified"
        ? input.classification
        : existing.classification,
      facets: mergeFacets(existing.facets, input.facets),
      updatedAt: now,
    };
    // A re-upsert that changes NOTHING must not write.
    //
    // This is a read-path function: `listOperationalAlerts` calls it while
    // building the attention feed, and that feed is built by the agency layout
    // AND the agency page — so it runs on every agency render. Writing
    // unconditionally meant every page load re-persisted the whole PortalState
    // blob with a fresh `updatedAt`, and emitted a durable `person.updated`
    // event PER ENQUIRY PER RENDER: an outbox full of announcements that
    // nothing had actually happened, plus a `updatedAt` that recorded when the
    // page was last looked at rather than when the person last changed.
    //
    // Compared on everything except `updatedAt` itself, which is the field the
    // write would set. The phone-sharing sweep is a real state change of its
    // own, so its presence forces the write through.
    const settled = identitySettlement.sharedPhoneValues.size > 0;
    const substantive = JSON.stringify({ ...next, updatedAt: 0 }) !== JSON.stringify({ ...existing, updatedAt: 0 });
    if (!settled && !substantive) return { person: existing, created: false };

    mutate(state => {
      markOtherPhoneOwnersShared(
        state.persons,
        agencyId,
        identitySettlement.sharedPhoneValues,
        next.id,
        now,
      );
      state.persons[next.id] = next;
    });
    // Emit the durable `person.updated` ONLY when THIS person actually changed.
    //
    // `settled` (a shared-phone sweep) forces the write above so the OTHER owners
    // of a shared number get marked, but that sweep is idempotent after the first
    // pass. Emitting on `settled` alone meant every agency render — which calls
    // this via `listOperationalAlerts` for each enquiry contact — announced
    // `person.updated` for people who had not changed. That flooded the outbox
    // (2,800+ no-op events in a day → ~40% of the state blob, bloating every
    // write). `mutate()` already no-ops when nothing changed; the emit must match.
    if (substantive) {
      emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId: next.id } });
    }
    return { person: next, created: false };
  }

  const person: Person = {
    id: makeId(),
    agencyId,
    emails,
    phones,
    name: clean(input.name, 160),
    company: clean(input.company, 160),
    jobTitle: clean(input.jobTitle, 120),
    organisationLinks: [],
    classification: input.classification ?? "unclassified",
    classificationHistory: [],
    facets: mergeFacets({}, input.facets),
    relationshipId: input.relationshipId?.trim() || undefined,
    source: clean(input.source, 120),
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => {
    markOtherPhoneOwnersShared(
      state.persons,
      agencyId,
      identitySettlement.sharedPhoneValues,
      person.id,
      now,
    );
    state.persons[person.id] = person;
  });
  emitDurable({ name: "person.created", agencyId, source: "server/persons", payload: { personId: person.id } });
  return { person, created: true };
}

// ─── Identity values ──────────────────────────────────────────────────────

export function addPersonEmail(
  agencyId: string,
  personId: string,
  value: string,
  options: { label?: string; isPrimary?: boolean } = {},
): Person | null {
  const normalised = normaliseIdentityEmail(value);
  if (!normalised) return null;
  return addIdentityValue(agencyId, personId, "emails", {
    value: normalised,
    raw: value.trim(),
    label: clean(options.label, 40),
    isPrimary: options.isPrimary,
  });
}

export function addPersonPhone(
  agencyId: string,
  personId: string,
  value: string,
  options: { label?: string; isPrimary?: boolean } = {},
): Person | null {
  const normalised = normaliseIdentityPhone(value);
  if (!normalised) return null;
  return addIdentityValue(agencyId, personId, "phones", {
    value: normalised,
    raw: value.trim(),
    label: clean(options.label, 40),
    isPrimary: options.isPrimary,
  });
}

export class IdentityInUseError extends Error {
  constructor(public readonly conflictingPersonId: string, message: string) {
    super(message);
    this.name = "IdentityInUseError";
  }
}

export interface EditIdentityInput {
  value?: string;
  label?: string;
  isPrimary?: boolean;
}

/**
 * Correct an existing address or number in place — a typo in a web form, a
 * misheard digit on a call.
 *
 * Changing the value changes the identity key, so this refuses when the new
 * value already belongs to somebody else rather than silently creating a
 * second card for the same human or stealing an identity from another record.
 */
export function editPersonEmail(
  agencyId: string,
  personId: string,
  currentValue: string,
  patch: EditIdentityInput,
): Person | null {
  return editIdentityValue(agencyId, personId, "emails", currentValue, patch, normaliseIdentityEmail);
}

export function editPersonPhone(
  agencyId: string,
  personId: string,
  currentValue: string,
  patch: EditIdentityInput,
): Person | null {
  return editIdentityValue(agencyId, personId, "phones", currentValue, patch, normaliseIdentityPhone);
}

export function removePersonEmail(agencyId: string, personId: string, value: string): Person | null {
  return removeIdentityValue(agencyId, personId, "emails", normaliseIdentityEmail(value));
}

export function removePersonPhone(agencyId: string, personId: string, value: string): Person | null {
  return removeIdentityValue(agencyId, personId, "phones", normaliseIdentityPhone(value));
}

function editIdentityValue(
  agencyId: string,
  personId: string,
  field: "emails" | "phones",
  currentValue: string,
  patch: EditIdentityInput,
  normalise: (value: string | undefined) => string,
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const current = existing[field] ?? [];
  const index = current.findIndex(entry => entry.value === currentValue);
  if (index < 0) return existing;

  const nextValue = patch.value !== undefined ? normalise(patch.value) : currentValue;
  if (!nextValue) throw new Error("That value could not be read.");

  if (nextValue !== currentValue) {
    if (current.some((entry, i) => i !== index && entry.value === nextValue)) {
      throw new Error("This contact already has that value.");
    }
    const owner = findIdentityValueOwner(agencyId, field, nextValue, personId);
    if (owner) {
      throw new IdentityInUseError(
        owner.id,
        `${personDisplayName(owner)} already uses that ${field === "emails" ? "email address" : "number"}.`,
      );
    }
  }

  const updated = current.map((entry, i) => i === index
    ? {
        ...entry,
        value: nextValue,
        raw: patch.value !== undefined ? patch.value.trim() : entry.raw,
        label: patch.label !== undefined ? clean(patch.label, 40) : entry.label,
        isPrimary: patch.isPrimary ?? entry.isPrimary,
      }
    : patch.isPrimary ? { ...entry, isPrimary: false } : entry);

  const next: Person = { ...existing, [field]: updated, updatedAt: Date.now() };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

function removeIdentityValue(
  agencyId: string,
  personId: string,
  field: "emails" | "phones",
  value: string,
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const current = existing[field] ?? [];
  const remaining = current.filter(entry => entry.value !== value);
  if (remaining.length === current.length) return existing;

  // Promote a replacement when the primary was the one removed, so the card
  // never ends up with entries but no primary.
  const lostPrimary = current.find(entry => entry.value === value)?.isPrimary;
  const settled = lostPrimary && remaining.length
    ? remaining.map((entry, index) => ({ ...entry, isPrimary: index === 0 }))
    : remaining;

  const next: Person = { ...existing, [field]: settled, updatedAt: Date.now() };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

function addIdentityValue(
  agencyId: string,
  personId: string,
  field: "emails" | "phones",
  entry: PersonEmail | PersonPhone,
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const current = existing[field] ?? [];
  if (current.some(item => item.value === entry.value)) return existing;
  const owner = findIdentityValueOwner(agencyId, field, entry.value, personId);
  if (owner) {
    throw new IdentityInUseError(
      owner.id,
      `${personDisplayName(owner)} already uses that ${field === "emails" ? "email address" : "number"}.`,
    );
  }
  const next: Person = {
    ...existing,
    [field]: entry.isPrimary
      ? [...current.map(item => ({ ...item, isPrimary: false })), entry]
      : [...current, entry],
    updatedAt: Date.now(),
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

// ─── Recorded meetings, calls and notes ───────────────────────────────────

export interface AddPersonRecordInput {
  kind: PersonRecordEntry["kind"];
  summary: string;
  body?: string;
  location?: string;
  outcome?: string;
  at?: number;
  createdBy?: string;
}

/**
 * Record something that happened with this person.
 *
 * Held on the Person rather than on a lead or contact facet so it survives
 * reclassification — the whole point of the Person layer. A meeting held while
 * they were a "lead" is still a meeting once they are a "supplier".
 */
export function addPersonRecord(
  agencyId: string,
  personId: string,
  input: AddPersonRecordInput,
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const summary = clean(input.summary, 240);
  if (!summary) throw new Error("A summary is required.");

  const now = Date.now();
  const entry: PersonRecordEntry = {
    id: `pre_${crypto.randomBytes(8).toString("hex")}`,
    kind: input.kind,
    // A meeting can be logged after the fact, so the caller may supply when it
    // actually happened rather than when it was typed up.
    at: input.at ?? now,
    summary,
    body: clean(input.body, 4000),
    location: clean(input.location, 240),
    outcome: clean(input.outcome, 240),
    createdBy: input.createdBy,
    createdAt: now,
  };

  const next: Person = {
    ...existing,
    record: [...(existing.record ?? []), entry],
    updatedAt: now,
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

/** Remove a recorded entry. A mis-typed note should not be permanent. */
export function deletePersonRecord(agencyId: string, personId: string, entryId: string): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const remaining = (existing.record ?? []).filter(entry => entry.id !== entryId);
  if (remaining.length === (existing.record ?? []).length) return existing;
  const next: Person = { ...existing, record: remaining, updatedAt: Date.now() };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

// ─── Organisation membership ──────────────────────────────────────────────

/**
 * Propose a company for this person. Records the suggestion only — the link
 * is not live until a human confirms it on the card.
 *
 * Never re-proposes a company the operator already rejected, and never
 * overrides a confirmed link.
 */
export function suggestPersonOrganisation(
  agencyId: string,
  personId: string,
  organisationId: string,
  options: { confidence?: number; reason?: string } = {},
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  if (existing.organisationId) return existing;
  const links = existing.organisationLinks ?? [];
  if (links.some(link => link.organisationId === organisationId
    && (link.status === "rejected" || link.status === "confirmed"))) return existing;

  const remaining = links.filter(link => link.organisationId !== organisationId);
  const next: Person = {
    ...existing,
    organisationLinks: [...remaining, {
      organisationId,
      status: "suggested",
      confidence: options.confidence,
      reason: clean(options.reason, 240),
      suggestedAt: Date.now(),
    }],
    updatedAt: Date.now(),
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

/**
 * The human decision. `confirmed` makes the link live; `rejected` is retained
 * so the same guess is not proposed again.
 */
export function decidePersonOrganisation(
  agencyId: string,
  personId: string,
  organisationId: string,
  decision: "confirmed" | "rejected",
  by?: string,
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const now = Date.now();
  const links = (existing.organisationLinks ?? []).filter(link => link.organisationId !== organisationId);
  const prior = (existing.organisationLinks ?? []).find(link => link.organisationId === organisationId);

  const next: Person = {
    ...existing,
    organisationId: decision === "confirmed"
      ? organisationId
      : existing.organisationId === organisationId ? undefined : existing.organisationId,
    organisationLinks: [...links, {
      organisationId,
      status: decision,
      confidence: prior?.confidence,
      reason: prior?.reason,
      suggestedAt: prior?.suggestedAt,
      decidedAt: now,
      decidedBy: by,
    }],
    updatedAt: now,
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

/** People whose proposed company is still awaiting a human decision. */
export function listPendingOrganisationSuggestions(agencyId: string): Person[] {
  return listPersons(agencyId).filter(person =>
    !person.organisationId
    && (person.organisationLinks ?? []).some(link => link.status === "suggested"));
}

export interface UpdatePersonPatch {
  // Addresses and numbers are managed through addPersonEmail/addPersonPhone
  // so normalisation and primary handling stay in one place.
  name?: string;
  company?: string;
  jobTitle?: string;
  isPrimaryContact?: boolean;
  notes?: string;
  customFields?: Record<string, string>;
  relationshipId?: string;
}

export function updatePerson(agencyId: string, personId: string, patch: UpdatePersonPatch): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const next: Person = {
    ...existing,
    name: patch.name !== undefined ? clean(patch.name, 160) : existing.name,
    company: patch.company !== undefined ? clean(patch.company, 160) : existing.company,
    jobTitle: patch.jobTitle !== undefined ? clean(patch.jobTitle, 120) : existing.jobTitle,
    isPrimaryContact: patch.isPrimaryContact ?? existing.isPrimaryContact,
    notes: patch.notes !== undefined ? clean(patch.notes, 4000) : existing.notes,
    customFields: patch.customFields !== undefined
      ? { ...existing.customFields, ...patch.customFields }
      : existing.customFields,
    relationshipId: patch.relationshipId !== undefined
      ? patch.relationshipId.trim() || undefined
      : existing.relationshipId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

/**
 * Attach a facet record. Additive by design — attaching a contact does not
 * remove a retained lead, which is what makes reclassification survivable.
 */
export function attachPersonFacet(agencyId: string, personId: string, facets: PersonFacets): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  const next: Person = {
    ...existing,
    facets: mergeFacets(existing.facets, facets),
    updatedAt: Date.now(),
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({ name: "person.updated", agencyId, source: "server/persons", payload: { personId } });
  return next;
}

export interface ClassifyPersonInput {
  classification: PersonClassification;
  by?: string;
  note?: string;
  sourceType?: IdentityResolutionSource;
  sourceId?: string;
}

/**
 * Record a classification decision. Appends to history rather than replacing
 * it, so "what did we think they were, and when did that change?" stays
 * answerable. A no-op re-classification is not recorded.
 */
export function classifyPerson(
  agencyId: string,
  personId: string,
  input: ClassifyPersonInput,
): Person | null {
  const existing = getPerson(agencyId, personId);
  if (!existing) return null;
  if (existing.classification === input.classification) return existing;

  const now = Date.now();
  const next: Person = {
    ...existing,
    classification: input.classification,
    classifiedAt: now,
    classifiedBy: input.by,
    classificationHistory: [
      ...existing.classificationHistory.slice(-99),
      {
        from: existing.classification,
        to: input.classification,
        at: now,
        by: input.by,
        note: clean(input.note, 400),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    ],
    updatedAt: now,
  };
  mutate(state => { state.persons[personId] = next; });
  emitDurable({
    name: "person.classified",
    agencyId,
    source: "server/persons",
    payload: { personId, from: existing.classification, to: input.classification },
  });
  return next;
}

// ─── Internals ────────────────────────────────────────────────────────────

function buildEmails(values?: (string | undefined)[]): PersonEmail[] {
  const seen = new Set<string>();
  const built: PersonEmail[] = [];
  for (const raw of values ?? []) {
    const value = normaliseIdentityEmail(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    built.push({ value, raw: raw?.trim(), isPrimary: built.length === 0 });
  }
  return built;
}

function buildPhones(values?: (string | undefined)[]): PersonPhone[] {
  const seen = new Set<string>();
  const built: PersonPhone[] = [];
  for (const raw of values ?? []) {
    const value = normaliseIdentityPhone(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    built.push({ value, raw: raw?.trim(), isPrimary: built.length === 0 });
  }
  return built;
}

function settleIncomingIdentityOwnership(
  agencyId: string,
  targetPersonId: string | undefined,
  incomingName: string | undefined,
  emails: PersonEmail[],
  phones: PersonPhone[],
): { emails: PersonEmail[]; phones: PersonPhone[]; sharedPhoneValues: Set<string> } {
  for (const email of emails) {
    const owner = findIdentityValueOwner(agencyId, "emails", email.value, targetPersonId);
    if (owner) {
      throw new IdentityInUseError(
        owner.id,
        `${personDisplayName(owner)} already uses that email address. Review that card before combining people.`,
      );
    }
  }

  const sharedPhoneValues = new Set<string>();
  const settledPhones = phones.map(phone => {
    const owners = identityValueOwners(agencyId, "phones", phone.value, targetPersonId);
    if (!owners.length) return phone;
    const identifyingOwners = owners.filter(owner =>
      (owner.phones ?? []).some(entry => entry.value === phone.value && !entry.shared));
    if (!identifyingOwners.length) {
      sharedPhoneValues.add(phone.value);
      return { ...phone, shared: true };
    }

    const compatibleOwner = identifyingOwners.find(owner => !namesConflict(owner.name, incomingName));
    if (compatibleOwner) {
      throw new IdentityInUseError(
        compatibleOwner.id,
        `${personDisplayName(compatibleOwner)} already uses that number. Review that card before combining people.`,
      );
    }

    // Different named people behind one number means a switchboard/shared
    // line, not person identity. Validation only records that decision here;
    // the upsert applies every affected card in its one final mutation. A
    // later conflicting value therefore cannot leave an earlier phone half
    // converted when this operation fails.
    sharedPhoneValues.add(phone.value);
    return { ...phone, shared: true };
  });

  return { emails, phones: settledPhones, sharedPhoneValues };
}

function markPhoneValuesShared(
  phones: PersonPhone[] | undefined,
  values: Set<string>,
): PersonPhone[] {
  return (phones ?? []).map(entry => values.has(entry.value) ? { ...entry, shared: true } : entry);
}

function markOtherPhoneOwnersShared(
  persons: Record<string, Person>,
  agencyId: string,
  values: Set<string>,
  targetPersonId: string,
  now: number,
): void {
  if (!values.size) return;
  for (const person of Object.values(persons)) {
    if (person.agencyId !== agencyId || person.id === targetPersonId) continue;
    if (!(person.phones ?? []).some(entry => values.has(entry.value) && !entry.shared)) continue;
    persons[person.id] = {
      ...person,
      phones: markPhoneValuesShared(person.phones, values),
      updatedAt: now,
    };
  }
}

function findIdentityValueOwner(
  agencyId: string,
  field: "emails" | "phones",
  value: string,
  excludePersonId?: string,
): Person | null {
  return identityValueOwners(agencyId, field, value, excludePersonId)[0] ?? null;
}

function identityValueOwners(
  agencyId: string,
  field: "emails" | "phones",
  value: string,
  excludePersonId?: string,
): Person[] {
  return Object.values(getState().persons)
    .filter(person => person.agencyId === agencyId && person.id !== excludePersonId)
    .filter(person => (person[field] ?? []).some(entry => entry.value === value))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

function mergeIdentityValues<T extends PersonEmail | PersonPhone>(base: T[] | undefined, incoming: T[]): T[] {
  const merged = [...(base ?? [])];
  for (const entry of incoming) {
    if (merged.some(item => item.value === entry.value)) continue;
    // An address discovered later never steals primary from an established one.
    merged.push({ ...entry, isPrimary: merged.length === 0 });
  }
  return merged;
}

function mergeFacets(base: PersonFacets, incoming?: PersonFacets): PersonFacets {
  if (!incoming) return { ...base };
  return {
    leadId: incoming.leadId ?? base.leadId,
    contactId: incoming.contactId ?? base.contactId,
    clientIds: mergeIds(base.clientIds, incoming.clientIds),
    enquiryIds: mergeIds(base.enquiryIds, incoming.enquiryIds),
  };
}

function mergeIds(base?: string[], incoming?: string[]): string[] | undefined {
  if (!base?.length && !incoming?.length) return undefined;
  return [...new Set([...(base ?? []), ...(incoming ?? [])])].slice(0, 200);
}
