import "server-only";

// Subject access and portability — GDPR Articles 15 and 20.
//
// Erasure was the only subject right this app could perform: you could delete
// somebody's data but you could not give it to them, which
// `compliancePosture.ts` recorded as `gdpr.dsar-access: missing`. This is that
// gap closed.
//
// ── Why it searches EVERYTHING rather than a list of places ───────────────
//
// The obvious implementation classifies each of `PortalState`'s ~90 collections
// as "holds personal data" or "does not", and searches the first group. That
// design fails silently and in the worst direction: anything mis-classified, or
// any collection added later and never classified, is simply absent from the
// export — and the person is told "this is everything we hold about you".
//
// A wrong subject-access response is worse than none. It is a false statement
// made under a legal obligation.
//
// So there is no list. Every collection is walked, and the question is asked of
// each record instead: does this reference the subject? That moves the risk from
// "did somebody remember to classify 90 collections" to "does the matcher know
// the ways a person is referenced" — a far smaller surface owned in one place.
//
// ── Scope, and the other breach: OVER-disclosure (SEC-006) ────────────────
//
// Two ways this can breach, not one:
//   1. Under-disclosure — telling a person "this is everything" while an
//      unrecognised reference shape or unwalked collection hid records. The
//      completeness design above is the answer to that.
//   2. OVER-disclosure — handing a person records that are not theirs. This
//      happens the moment a SHARED identifier is treated as identifying: a
//      household phone, an `info@` inbox, a switchboard line. `PersonPhone`
//      already carries `shared` for exactly this reason ("never identifies a
//      person without a compatible name"). Two people can hold the same number.
//
// So a record is only EXPORTED when it is attributable to the subject by an
// AUTHORITATIVE reference: their exact person id / relationship id, or an
// email/phone that is EXCLUSIVE to them within this agency (held by no one else
// and not flagged shared). A record that references the subject ONLY through a
// shared/co-held identifier is AMBIGUOUS — it might be the other holder's — so
// it is counted and surfaced for a human, never placed in the export.
//
// And a record that IS the subject's can still carry a third party's contact
// details (a meeting with two attendees, a note naming someone else). Those
// third-party emails/phones are REDACTED from the exported copy — the subject
// gets their own record and their own identifiers, not everyone else's.
//
// Tenant scope still holds above all of this: a record belonging to another
// agency is never exported, and a match carrying no `agencyId` at all is counted
// and reported rather than included — visible, never silently dropped.

import { getState } from "@/server/storage";
import type { PortalState } from "@/server/types";

export interface SubjectAccessSubject {
  personId: string;
  name?: string;
  emails: string[];
  phones: string[];
}

export interface SubjectAccessResult {
  subject: SubjectAccessSubject;
  generatedAt: number;
  /** Collection name → the records in it authoritatively attributable to this
   * person, with any third-party identifiers redacted. */
  found: Record<string, unknown[]>;
  /** Every collection actually walked — the proof of coverage. */
  searchedCollections: string[];
  totalRecords: number;
  /**
   * Matches that carry no `agencyId`, per collection. Not included in `found`,
   * because they cannot be shown to belong to this tenant — but surfaced so a
   * human can decide, rather than the export quietly deciding for them.
   */
  unscopedMatches: Record<string, number>;
  /**
   * SEC-006: in-agency records that matched ONLY through a shared/co-held
   * identifier (a shared phone, an inbox two people hold). They cannot be
   * attributed to this subject alone, so they are surfaced for review rather
   * than exported as theirs — the over-disclosure counterpart of
   * `unscopedMatches`.
   */
  sharedIdentifierMatches: Record<string, number>;
}

/** Emails and phones compare loosely; ids compare exactly. */
function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}
function normalisePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}
function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}
function looksLikePhone(value: string): boolean {
  return /\d{7,}/.test(value);
}

/**
 * The keys a record may reference the subject through. Split into two sets so a
 * match can be classed as authoritative or merely shared:
 *   - `ids`     — exact person id / relationship id (always identifying);
 *   - `emails`  — normalised addresses that authorise inclusion;
 *   - `phones`  — normalised numbers that authorise inclusion.
 */
interface ReferenceKeys {
  ids: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
}

function referencesByKeys(value: unknown, keys: ReferenceKeys, depth = 0): boolean {
  if (depth > 8 || value == null) return false;

  if (typeof value === "string") {
    if (keys.ids.has(value)) return true;
    if (looksLikeEmail(value) && keys.emails.has(normaliseEmail(value))) return true;
    // Only test phone shapes; a bare number would match far too much.
    if (looksLikePhone(value) && keys.phones.has(normalisePhone(value))) return true;
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => referencesByKeys(entry, keys, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .some((entry) => referencesByKeys(entry, keys, depth + 1));
  }
  return false;
}

function agencyOf(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const value = (record as { agencyId?: unknown }).agencyId;
  return typeof value === "string" ? value : undefined;
}

interface PersonLike {
  id?: unknown;
  agencyId?: unknown;
  emails?: Array<{ value?: unknown; raw?: unknown }>;
  phones?: Array<{ value?: unknown; raw?: unknown; shared?: unknown }>;
}

/**
 * Which of this subject's identifiers are EXCLUSIVE to them within the agency.
 *
 * An identifier is exclusive when no other person in the same agency holds it,
 * and — for phones — it is not flagged `shared` on anyone. Only exclusive
 * identifiers authorise inclusion; the rest are treated as ambiguous.
 */
function partitionIdentifiers(
  state: PortalState,
  agencyId: string,
  subjectPersonId: string,
  subjectEmails: string[],
  subjectPhones: string[],
): {
  exclusiveEmails: Set<string>;
  exclusivePhones: Set<string>;
  sharedEmails: Set<string>;
  sharedPhones: Set<string>;
} {
  const emailOwners = new Map<string, Set<string>>();
  const phoneOwners = new Map<string, Set<string>>();
  const sharedFlagged = new Set<string>();

  const persons = (state as unknown as { persons?: Record<string, PersonLike> }).persons ?? {};
  for (const [personId, person] of Object.entries(persons)) {
    if (!person || typeof person !== "object") continue;
    if (typeof person.agencyId !== "string" || person.agencyId !== agencyId) continue;
    for (const email of person.emails ?? []) {
      for (const raw of [email?.value, email?.raw]) {
        if (typeof raw !== "string" || !raw) continue;
        const key = normaliseEmail(raw);
        (emailOwners.get(key) ?? emailOwners.set(key, new Set()).get(key)!).add(personId);
      }
    }
    for (const phone of person.phones ?? []) {
      for (const raw of [phone?.value, phone?.raw]) {
        if (typeof raw !== "string" || !raw) continue;
        const key = normalisePhone(raw);
        (phoneOwners.get(key) ?? phoneOwners.set(key, new Set()).get(key)!).add(personId);
        if (phone?.shared === true) sharedFlagged.add(key);
      }
    }
  }

  const exclusiveEmails = new Set<string>();
  const sharedEmails = new Set<string>();
  for (const raw of subjectEmails) {
    const key = normaliseEmail(raw);
    const owners = emailOwners.get(key);
    if (owners && owners.size === 1 && owners.has(subjectPersonId)) exclusiveEmails.add(key);
    else sharedEmails.add(key);
  }

  const exclusivePhones = new Set<string>();
  const sharedPhones = new Set<string>();
  for (const raw of subjectPhones) {
    const key = normalisePhone(raw);
    const owners = phoneOwners.get(key);
    const exclusive = owners && owners.size === 1 && owners.has(subjectPersonId) && !sharedFlagged.has(key);
    if (exclusive) exclusivePhones.add(key);
    else sharedPhones.add(key);
  }

  return { exclusiveEmails, exclusivePhones, sharedEmails, sharedPhones };
}

/**
 * Redact a third party's identifiers from a copy of one of the subject's own
 * records. The subject's own emails/phones stay; any OTHER email/phone found in
 * the record is masked, because the subject's access right does not extend to
 * someone else's contact details that happen to sit in the same row.
 */
// An email anywhere in a string (free text or a whole field).
const EMAIL_SUBSTRING = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// A phone only when the WHOLE trimmed string is one — phone characters only,
// 7–20 of them. This deliberately never fires on a record id, hash, timestamp
// or any free-text field that merely contains a run of digits, which an
// "any 7 digits" rule would wrongly redact.
const WHOLE_PHONE = /^[+()\d\s.\-]{7,20}$/;

function redactThirdParties(
  value: unknown,
  subjectEmails: Set<string>,
  subjectPhones: Set<string>,
  depth = 0,
): unknown {
  if (depth > 12 || value == null) return value;
  if (typeof value === "string") {
    // Mask any third-party email — including one embedded in free text — while
    // leaving the subject's own addresses intact.
    const emailMasked = value.replace(EMAIL_SUBSTRING, (match) =>
      subjectEmails.has(normaliseEmail(match)) ? match : "[redacted:third-party-email]",
    );
    const trimmed = emailMasked.trim();
    if (WHOLE_PHONE.test(trimmed)) {
      const normalised = normalisePhone(trimmed);
      if (normalised.replace(/\D/g, "").length >= 7 && !subjectPhones.has(normalised)) {
        return "[redacted:third-party-phone]";
      }
    }
    return emailMasked;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactThirdParties(entry, subjectEmails, subjectPhones, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactThirdParties(entry, subjectEmails, subjectPhones, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Everything this agency holds about one person.
 *
 * Returns `null` when the person does not exist in this agency — the same
 * "scope, then find" shape the rest of the app uses, so a person id from
 * another tenant is simply not found rather than found and then refused.
 */
export function collectSubjectAccessExport(agencyId: string, personId: string): SubjectAccessResult | null {
  const state = getState();
  const person = state.persons?.[personId];
  if (!person || person.agencyId !== agencyId) return null;

  // `emails`/`phones` are PersonEmail/PersonPhone records, not strings. `raw`
  // is kept alongside `value` because a person may have been recorded under a
  // differently-formatted address, and a search that only knew the normalised
  // one would miss records written before normalisation.
  const emails = (person.emails ?? []).flatMap(entry => [entry.value, entry.raw]).filter((v): v is string => Boolean(v));
  const phones = (person.phones ?? []).flatMap(entry => [entry.value, entry.raw]).filter((v): v is string => Boolean(v));

  const { exclusiveEmails, exclusivePhones, sharedEmails, sharedPhones } =
    partitionIdentifiers(state, agencyId, personId, emails, phones);

  // Only exact ids and EXCLUSIVE identifiers authorise inclusion.
  const authoritativeKeys: ReferenceKeys = {
    ids: new Set([personId, ...(person.relationshipId ? [person.relationshipId] : [])]),
    emails: exclusiveEmails,
    phones: exclusivePhones,
  };
  // Shared/co-held identifiers only ever make a match AMBIGUOUS.
  const ambiguousKeys: ReferenceKeys = {
    ids: new Set<string>(),
    emails: sharedEmails,
    phones: sharedPhones,
  };
  // The subject's full identifier set — what redaction must PRESERVE.
  const subjectEmailSet = new Set(emails.map(normaliseEmail));
  const subjectPhoneSet = new Set(phones.map(normalisePhone));

  const found: Record<string, unknown[]> = {};
  const unscopedMatches: Record<string, number> = {};
  const sharedIdentifierMatches: Record<string, number> = {};
  const searchedCollections: string[] = [];
  let totalRecords = 0;

  for (const [collectionName, collection] of Object.entries(state as unknown as Record<string, unknown>)) {
    searchedCollections.push(collectionName);
    if (!collection || typeof collection !== "object") continue;

    const records = Array.isArray(collection) ? collection : Object.values(collection);
    const matches: unknown[] = [];
    for (const record of records) {
      const authoritative = referencesByKeys(record, authoritativeKeys);
      // A record with no authoritative link but a shared-identifier link is
      // ambiguous — surfaced, never exported.
      const ambiguous = !authoritative && referencesByKeys(record, ambiguousKeys);
      if (!authoritative && !ambiguous) continue;

      const owner = agencyOf(record);
      if (owner === undefined) {
        unscopedMatches[collectionName] = (unscopedMatches[collectionName] ?? 0) + 1;
        continue;
      }
      if (owner !== agencyId) continue;

      if (ambiguous) {
        sharedIdentifierMatches[collectionName] = (sharedIdentifierMatches[collectionName] ?? 0) + 1;
        continue;
      }
      matches.push(redactThirdParties(record, subjectEmailSet, subjectPhoneSet));
    }
    if (matches.length) {
      found[collectionName] = matches;
      totalRecords += matches.length;
    }
  }

  return {
    subject: {
      personId,
      name: person.name,
      emails,
      phones,
    },
    generatedAt: Date.now(),
    found,
    searchedCollections,
    totalRecords,
    unscopedMatches,
    sharedIdentifierMatches,
  };
}

/**
 * The export as the file a person is handed.
 *
 * JSON rather than CSV: Article 20 asks for a "structured, commonly used and
 * machine-readable" format, and the records here are nested — flattening them
 * into columns would lose the structure the right is meant to preserve.
 */
export function subjectAccessExportJson(result: SubjectAccessResult): string {
  return JSON.stringify(
    {
      subject: result.subject,
      generatedAt: new Date(result.generatedAt).toISOString(),
      recordCount: result.totalRecords,
      collectionsSearched: result.searchedCollections.length,
      // Named explicitly so the reader can see the export knows about them.
      recordsNotAttributableToThisAgency: result.unscopedMatches,
      // SEC-006: records that matched only through a shared/co-held identifier
      // and so could not be attributed to this subject alone.
      recordsMatchedOnlyBySharedIdentifier: result.sharedIdentifierMatches,
      data: result.found,
    },
    null,
    2,
  );
}

/** Exported for the coverage test — the set a search must have walked. */
export function portalStateCollectionNames(state: PortalState): string[] {
  return Object.keys(state as unknown as Record<string, unknown>);
}
