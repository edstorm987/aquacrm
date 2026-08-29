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
// "did somebody remember to classify 90 collections, and the next one, and the
// one after" to "does the matcher know the ways a person is referenced" — a far
// smaller surface, and one this module owns in a single place below.
//
// ── Scope ────────────────────────────────────────────────────────────────
//
// Records are kept only when they belong to the caller's agency. A subject
// access response that leaked another tenant's records would be a breach
// committed in the act of complying with a subject right. Matches carrying no
// `agencyId` at all cannot be proven to belong here, so they are COUNTED and
// reported rather than included — visible, never silently dropped.

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
  /** Collection name → the records in it that reference this person. */
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
}

/** Emails and phones compare loosely; ids compare exactly. */
function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}
function normalisePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

interface SubjectKeys {
  personId: string;
  relationshipId?: string;
  emails: Set<string>;
  phones: Set<string>;
}

/**
 * Does this value reference the subject?
 *
 * Recursive, because a reference is as often nested (`scope: { personId }`,
 * `assignee: { email }`) as it is a top-level field — the same lesson the
 * erasure sweep learned on 2026-08-27 when grants and requests referenced a
 * client through `scope: { kind: "client", id }` and survived a top-level-only
 * pass.
 */
function referencesSubject(value: unknown, keys: SubjectKeys, depth = 0): boolean {
  if (depth > 8 || value == null) return false;

  if (typeof value === "string") {
    if (value === keys.personId) return true;
    if (keys.relationshipId && value === keys.relationshipId) return true;
    if (value.includes("@") && keys.emails.has(normaliseEmail(value))) return true;
    // Only test phone shapes; a bare number would match far too much.
    if (/[\d]{7,}/.test(value) && keys.phones.has(normalisePhone(value))) return true;
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(entry => referencesSubject(entry, keys, depth + 1));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .some(entry => referencesSubject(entry, keys, depth + 1));
  }

  return false;
}

function agencyOf(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const value = (record as { agencyId?: unknown }).agencyId;
  return typeof value === "string" ? value : undefined;
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
  const keys: SubjectKeys = {
    personId,
    relationshipId: person.relationshipId,
    emails: new Set(emails.map(normaliseEmail)),
    phones: new Set(phones.map(normalisePhone)),
  };

  const found: Record<string, unknown[]> = {};
  const unscopedMatches: Record<string, number> = {};
  const searchedCollections: string[] = [];
  let totalRecords = 0;

  for (const [collectionName, collection] of Object.entries(state as unknown as Record<string, unknown>)) {
    searchedCollections.push(collectionName);
    if (!collection || typeof collection !== "object") continue;

    const records = Array.isArray(collection) ? collection : Object.values(collection);
    const matches: unknown[] = [];
    for (const record of records) {
      if (!referencesSubject(record, keys)) continue;
      const owner = agencyOf(record);
      if (owner === undefined) {
        unscopedMatches[collectionName] = (unscopedMatches[collectionName] ?? 0) + 1;
        continue;
      }
      if (owner !== agencyId) continue;
      matches.push(record);
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
