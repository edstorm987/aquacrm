import "server-only";

// GDPR subject-access export. Selection is deliberately based on typed
// ownership fields, never on arbitrary recursive value equality. Every state
// collection is still walked: unknown subject-linked shapes are counted for
// review instead of disappearing from the completeness statement.

import { phoneMatchKey } from "@/lib/telephony/phoneNumbers";
import { getState } from "@/server/storage";
import type { Client, Person, SubjectRequest } from "@/server/types";

export const SUBJECT_ACCESS_REQUIRED_SIDECARS = ["devTeamWorkspaceFiles"] as const;

export const MAX_SUBJECT_ACCESS_RECORDS = 50_000;
export const MAX_SUBJECT_ACCESS_VALUES = 500_000;
export const MAX_SUBJECT_ACCESS_CHARACTERS = 5_000_000;
export const MAX_SUBJECT_ACCESS_STRING_CHARACTERS = 100_000;
export const MAX_SUBJECT_ACCESS_EXPORT_BYTES = 1_000_000;

const MAX_SCOPE_DEPTH = 6;
const MAX_REVIEW_SCAN_DEPTH = 8;

type JsonRecord = Record<string, unknown>;
type CountMap = Record<string, number>;

export type SubjectAccessIncompleteReason =
  | "record-limit"
  | "value-limit"
  | "character-limit"
  | "string-limit"
  | "output-size-limit"
  | "accessor-value"
  | "invalid-stored-value";

export interface SubjectAccessSubject {
  personId: string;
  name?: string;
  emails: string[];
  phones: string[];
  clientIds: string[];
  relationshipIds: string[];
  facetIds: string[];
}

export interface SubjectAccessReviewTotals {
  recordsNotAttributableToThisAgency: number;
  unclassifiedSubjectMentions: number;
  ambiguousOwnership: number;
  coMingledThirdPartyPii: number;
  recordsBeyondInspectionDepth: number;
  unsupportedCollections: number;
  omittedFields: number;
}

export interface SubjectAccessResult {
  subject: SubjectAccessSubject;
  generatedAt: number;
  found: Record<string, unknown[]>;
  searchedCollections: string[];
  totalRecords: number;
  unscopedMatches: CountMap;
  unclassifiedMatches: CountMap;
  ambiguousMatches: CountMap;
  /** Compatibility name retained for callers that displayed shared identifiers. */
  sharedIdentifierMatches: CountMap;
  coMingledPiiMatches: CountMap;
  depthLimitMatches: CountMap;
  redactedFields: CountMap;
  unsupportedCollectionMatches: CountMap;
  omittedFields: CountMap;
  reviewTotals: SubjectAccessReviewTotals;
  incompleteReasons: SubjectAccessIncompleteReason[];
  work: {
    recordsVisited: number;
    valuesVisited: number;
    charactersInspected: number;
    matcherCharactersInspected: number;
    serializedBytes: number;
  };
}

export class SubjectAccessExportIncompleteError extends Error {
  constructor(public readonly reasons: SubjectAccessIncompleteReason[]) {
    super("subject_access_export_incomplete");
    this.name = "SubjectAccessExportIncompleteError";
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

interface TraversalMeter {
  maxValues: number;
  result: SubjectAccessResult;
  materialised: WeakMap<object, MaterialisedValue>;
}

interface MaterialisedValue {
  value: unknown;
  unsafe: boolean;
}

interface StoredDataEntries {
  entries: Array<[string, unknown]>;
  nonDataKeys: Set<string>;
  complete: boolean;
}

/** Enumerate stored JSON data without invoking accessors on a poisoned value. */
function* ownDataEntries(value: object): IterableIterator<[string, unknown]> {
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable && "value" in descriptor) yield [key, descriptor.value];
  }
}

function ownDataValue(record: JsonRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && descriptor.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

/** Defensive check for already-materialised values; never reads the property. */
function hasEnumerableAccessor(value: object): boolean {
  return Object.keys(value).some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && !("value" in descriptor));
  });
}

function addCount(target: CountMap, collection: string, amount = 1): void {
  target[collection] = (target[collection] ?? 0) + amount;
}

function sumCounts(target: CountMap): number {
  return Object.values(target).reduce((sum, value) => sum + value, 0);
}

function addIncomplete(result: SubjectAccessResult, reason: SubjectAccessIncompleteReason): void {
  if (!result.incompleteReasons.includes(reason)) result.incompleteReasons.push(reason);
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

function digitsOnly(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 48 && code <= 57) result += value[index];
  }
  return result;
}

function copyScalarFields(
  source: JsonRecord,
  fields: readonly string[],
  collection: string,
  context: ExportContext,
): JsonRecord {
  const out: JsonRecord = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(source, field);
    if (!descriptor || ("value" in descriptor && descriptor.value === undefined)) continue;
    if (!descriptor.enumerable || !("value" in descriptor)) {
      markStoredValueIssue(context, collection, "accessor-value");
      continue;
    }
    const value = descriptor.value;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      out[field] = value;
      continue;
    }
    if (typeof value === "string") {
      if (textHasRestrictedPii(value, context, false)) {
        out[field] = "[redacted:restricted-identifier]";
        addCount(context.result.redactedFields, collection);
        addCount(context.result.coMingledPiiMatches, collection);
      } else {
        out[field] = value;
      }
      continue;
    }
    // A recognised scalar with an object/function/symbol/NaN runtime value is
    // corrupt authoritative state, not an absent optional. Silent omission
    // would let the generated manifest claim automatic completeness.
    markStoredValueIssue(context, collection, "invalid-stored-value");
  }
  return out;
}

interface IdentifierPartition {
  exclusiveEmails: Set<string>;
  exclusivePhones: Set<string>;
  ambiguousEmails: Set<string>;
  ambiguousPhones: Set<string>;
  allSubjectEmails: Set<string>;
  allSubjectPhones: Set<string>;
  displayedEmails: string[];
  displayedPhones: string[];
}

function partitionIdentifiers(
  persons: readonly Person[],
  agencyId: string,
  person: Person,
  meter: TraversalMeter,
): IdentifierPartition {
  const emailOwners = new Map<string, Set<string>>();
  const phoneOwners = new Map<string, Set<string>>();
  const sharedPhones = new Set<string>();

  for (const candidate of persons) {
    if (!meterTraversalValue(candidate, meter)) break;
    if (candidate.agencyId !== agencyId) continue;
    const candidateEmails = Array.isArray(candidate.emails) ? candidate.emails : [];
    if (candidate.emails !== undefined && !Array.isArray(candidate.emails)) {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
    }
    for (const rawEntry of candidateEmails) {
      if (!meterTraversalValue(rawEntry, meter)) break;
      const entry = asRecord(rawEntry);
      const value = entry ? ownDataValue(entry, "value") : undefined;
      const storedRaw = entry ? ownDataValue(entry, "raw") : undefined;
      if (typeof value !== "string") {
        markStoredValueIssue(meter, "persons", "invalid-stored-value");
        continue;
      }
      const equivalentRaw = typeof storedRaw === "string" && normaliseEmail(storedRaw) === normaliseEmail(value) ? storedRaw : undefined;
      for (const raw of [value, equivalentRaw]) {
        if (!meterTraversalValue(raw, meter)) break;
        if (!raw) continue;
        const key = normaliseEmail(raw);
        let owners = emailOwners.get(key);
        if (!owners) emailOwners.set(key, owners = new Set());
        owners.add(candidate.id);
      }
    }
    const candidatePhones = Array.isArray(candidate.phones) ? candidate.phones : [];
    if (candidate.phones !== undefined && !Array.isArray(candidate.phones)) {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
    }
    for (const rawEntry of candidatePhones) {
      if (!meterTraversalValue(rawEntry, meter)) break;
      const entry = asRecord(rawEntry);
      const value = entry ? ownDataValue(entry, "value") : undefined;
      const storedRaw = entry ? ownDataValue(entry, "raw") : undefined;
      if (typeof value !== "string") {
        markStoredValueIssue(meter, "persons", "invalid-stored-value");
        continue;
      }
      const valueKey = phoneMatchKey(value);
      const equivalentRaw = typeof storedRaw === "string" && phoneMatchKey(storedRaw) === valueKey ? storedRaw : undefined;
      for (const raw of [value, equivalentRaw]) {
        if (!meterTraversalValue(raw, meter)) break;
        if (!raw) continue;
        const key = phoneMatchKey(raw);
        if (!key) continue;
        let owners = phoneOwners.get(key);
        if (!owners) phoneOwners.set(key, owners = new Set());
        owners.add(candidate.id);
        if (ownDataValue(entry!, "shared") === true) sharedPhones.add(key);
      }
    }
  }

  const allSubjectEmails = new Set<string>();
  const allSubjectPhones = new Set<string>();
  const displayedEmails: string[] = [];
  const displayedPhones: string[] = [];
  const displayedEmailValues = new Set<string>();
  const displayedPhoneValues = new Set<string>();
  const exclusiveEmails = new Set<string>();
  const exclusivePhones = new Set<string>();
  const ambiguousEmails = new Set<string>();
  const ambiguousPhones = new Set<string>();

  const subjectEmails = Array.isArray(person.emails) ? person.emails : [];
  if (person.emails !== undefined && !Array.isArray(person.emails)) markStoredValueIssue(meter, "persons", "invalid-stored-value");
  for (const rawEntry of subjectEmails) {
    if (!meterTraversalValue(rawEntry, meter)) break;
    const entry = asRecord(rawEntry);
    const value = entry ? ownDataValue(entry, "value") : undefined;
    const storedRaw = entry ? ownDataValue(entry, "raw") : undefined;
    if (typeof value !== "string") {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      continue;
    }
    const equivalentRaw = typeof storedRaw === "string" && normaliseEmail(storedRaw) === normaliseEmail(value) ? storedRaw : undefined;
    for (const raw of [value, equivalentRaw]) {
      if (!meterTraversalValue(raw, meter)) break;
      if (!raw) continue;
      const key = normaliseEmail(raw);
      allSubjectEmails.add(key);
      const owners = emailOwners.get(key);
      if (owners?.size === 1 && owners.has(person.id)) {
        exclusiveEmails.add(key);
        if (!displayedEmailValues.has(raw)) {
          displayedEmailValues.add(raw);
          displayedEmails.push(raw);
        }
      } else {
        ambiguousEmails.add(key);
      }
    }
  }
  const subjectPhones = Array.isArray(person.phones) ? person.phones : [];
  if (person.phones !== undefined && !Array.isArray(person.phones)) markStoredValueIssue(meter, "persons", "invalid-stored-value");
  for (const rawEntry of subjectPhones) {
    if (!meterTraversalValue(rawEntry, meter)) break;
    const entry = asRecord(rawEntry);
    const value = entry ? ownDataValue(entry, "value") : undefined;
    const storedRaw = entry ? ownDataValue(entry, "raw") : undefined;
    if (typeof value !== "string") {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      continue;
    }
    const valueKey = phoneMatchKey(value);
    const equivalentRaw = typeof storedRaw === "string" && phoneMatchKey(storedRaw) === valueKey ? storedRaw : undefined;
    for (const raw of [value, equivalentRaw]) {
      if (!meterTraversalValue(raw, meter)) break;
      if (!raw) continue;
      const key = phoneMatchKey(raw);
      if (!key) continue;
      allSubjectPhones.add(key);
      const owners = phoneOwners.get(key);
      if (owners?.size === 1 && owners.has(person.id) && !sharedPhones.has(key)) {
        exclusivePhones.add(key);
        if (!displayedPhoneValues.has(raw)) {
          displayedPhoneValues.add(raw);
          displayedPhones.push(raw);
        }
      } else {
        ambiguousPhones.add(key);
      }
    }
  }

  return {
    exclusiveEmails,
    exclusivePhones,
    ambiguousEmails,
    ambiguousPhones,
    allSubjectEmails,
    allSubjectPhones,
    displayedEmails,
    displayedPhones,
  };
}

interface SubjectLineage {
  clientIds: Set<string>;
  conflictingClientIds: Set<string>;
  relationshipIds: Set<string>;
  facetIds: Set<string>;
}

function deriveLineage(
  clients: readonly Client[],
  agencyId: string,
  person: Person,
  meter: TraversalMeter,
): SubjectLineage {
  const clientIds = new Set<string>();
  const conflictingClientIds = new Set<string>();
  const relationshipIds = new Set<string>();
  const facetIds = new Set<string>();
  if (typeof person.relationshipId === "string" && person.relationshipId) relationshipIds.add(person.relationshipId);
  else if (person.relationshipId !== undefined) markStoredValueIssue(meter, "persons", "invalid-stored-value");
  const facets = asRecord(person.facets) ?? Object.create(null) as JsonRecord;
  if (person.facets !== undefined && !asRecord(person.facets)) markStoredValueIssue(meter, "persons", "invalid-stored-value");
  const enquiryIds = ownDataValue(facets, "enquiryIds");
  const facetValues: unknown[] = [ownDataValue(facets, "leadId"), ownDataValue(facets, "contactId")];
  for (const value of facetValues) {
    if (!meterTraversalValue(value, meter)) break;
    if (typeof value === "string" && value) facetIds.add(value);
    else if (value !== undefined) markStoredValueIssue(meter, "persons", "invalid-stored-value");
  }
  if (Array.isArray(enquiryIds)) {
    for (const value of enquiryIds) {
      if (!meterTraversalValue(value, meter)) break;
      if (typeof value === "string" && value) facetIds.add(value);
      else if (value !== undefined) markStoredValueIssue(meter, "persons", "invalid-stored-value");
    }
  } else if (enquiryIds !== undefined) {
    markStoredValueIssue(meter, "persons", "invalid-stored-value");
  }

  const clientsById = new Map<string, Client>();
  for (const client of clients) {
    if (!meterTraversalValue(client, meter)) break;
    if (typeof client.id === "string") clientsById.set(client.id, client);
    else markStoredValueIssue(meter, "clients", "invalid-stored-value");
  }
  const facetClientIds = ownDataValue(facets, "clientIds");
  const clientIdValues = Array.isArray(facetClientIds) ? facetClientIds : [];
  if (facetClientIds !== undefined && !Array.isArray(facetClientIds)) markStoredValueIssue(meter, "persons", "invalid-stored-value");
  for (const rawClientId of clientIdValues) {
    if (!meterTraversalValue(rawClientId, meter)) break;
    if (typeof rawClientId !== "string" || !rawClientId) {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      continue;
    }
    const clientId = rawClientId;
    const client = clientsById.get(clientId);
    if (client && (client.agencyId !== agencyId || (client.personId && client.personId !== person.id))) {
      conflictingClientIds.add(clientId);
      continue;
    }
    // A missing row can be a deleted/archived workspace, but the canonical
    // Person facet itself remains exact ownership evidence.
    clientIds.add(clientId);
    if (client?.relationshipId) relationshipIds.add(client.relationshipId);
  }

  for (const client of clients) {
    if (!meterTraversalValue(client, meter)) break;
    if (client.agencyId !== agencyId) continue;
    if (client.personId === person.id) {
      clientIds.add(client.id);
      if (client.relationshipId) relationshipIds.add(client.relationshipId);
    }
  }
  for (const client of clients) {
    if (!meterTraversalValue(client, meter)) break;
    if (client.agencyId !== agencyId || !client.relationshipId || !relationshipIds.has(client.relationshipId)) continue;
    if (client.personId && client.personId !== person.id) conflictingClientIds.add(client.id);
    else clientIds.add(client.id);
  }
  return { clientIds, conflictingClientIds, relationshipIds, facetIds };
}

interface ExportContext {
  agencyId: string;
  person: Person;
  identifiers: IdentifierPartition;
  lineage: SubjectLineage;
  otherPersonNameMatcher: IndexedStringMatcher;
  subjectReferenceMatcher: IndexedStringMatcher;
  subjectPhoneMatcher: IndexedStringMatcher;
  ambiguousEmailMatcher: IndexedStringMatcher;
  ambiguousPhoneMatcher: IndexedStringMatcher;
  maxValues: number;
  result: SubjectAccessResult;
  materialised: WeakMap<object, MaterialisedValue>;
}

interface IndexedMatcherNode {
  next: Map<string, number>;
  failure: number;
  terminal: boolean;
}

interface IndexedStringMatcher {
  readonly nodes: IndexedMatcherNode[];
  readonly caseInsensitive: boolean;
}

function buildIndexedStringMatcher(
  patterns: Iterable<string>,
  meter: Pick<TraversalMeter, "maxValues" | "result">,
  options: { caseInsensitive?: boolean; nameTokens?: boolean } = {},
): IndexedStringMatcher {
  const nodes: IndexedMatcherNode[] = [{ next: new Map(), failure: 0, terminal: false }];
  const unique = new Set<string>();
  const addPattern = (raw: string) => {
    const pattern = options.caseInsensitive ? raw.toLocaleLowerCase("en-GB") : raw;
    if (!pattern || unique.has(pattern)) return;
    unique.add(pattern);
    let nodeIndex = 0;
    for (const character of pattern) {
      let next = nodes[nodeIndex].next.get(character);
      if (next === undefined) {
        next = nodes.length;
        nodes[nodeIndex].next.set(character, next);
        nodes.push({ next: new Map(), failure: 0, terminal: false });
      }
      nodeIndex = next;
    }
    nodes[nodeIndex].terminal = true;
  };

  for (const raw of patterns) {
    if (!meterTraversalValue(raw, meter)) break;
    addPattern(raw);
    if (options.nameTokens) {
      for (const token of raw.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) {
        if (token.length >= 2) addPattern(token);
      }
    }
  }

  const queue: number[] = [];
  for (const child of nodes[0].next.values()) {
    nodes[child].failure = 0;
    queue.push(child);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parent = queue[cursor];
    for (const [character, child] of nodes[parent].next) {
      let failure = nodes[parent].failure;
      while (failure !== 0 && !nodes[failure].next.has(character)) failure = nodes[failure].failure;
      const fallback = nodes[failure].next.get(character);
      nodes[child].failure = fallback !== undefined && fallback !== child ? fallback : 0;
      nodes[child].terminal = nodes[child].terminal || nodes[nodes[child].failure].terminal;
      queue.push(child);
    }
  }
  return { nodes, caseInsensitive: Boolean(options.caseInsensitive) };
}

/** Aho-Corasick lookup: matching cost is linear in the inspected string, not
 * the number of people/identifiers in the tenant. Each lookup is charged to a
 * dedicated hard matcher-character budget alongside stored-value discovery. */
function indexedMatcherHas(
  matcher: IndexedStringMatcher,
  raw: string,
  meter: Pick<TraversalMeter, "maxValues" | "result">,
): boolean {
  if (matcher.nodes.length === 1) return false;
  if (raw.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) {
    addIncomplete(meter.result, "string-limit");
    return false;
  }
  if (meter.result.work.matcherCharactersInspected + raw.length > MAX_SUBJECT_ACCESS_CHARACTERS) {
    addIncomplete(meter.result, "character-limit");
    return false;
  }
  meter.result.work.matcherCharactersInspected += raw.length;
  const value = matcher.caseInsensitive ? raw.toLocaleLowerCase("en-GB") : raw;
  let nodeIndex = 0;
  for (const character of value) {
    while (nodeIndex !== 0 && !matcher.nodes[nodeIndex].next.has(character)) {
      nodeIndex = matcher.nodes[nodeIndex].failure;
    }
    nodeIndex = matcher.nodes[nodeIndex].next.get(character) ?? 0;
    if (matcher.nodes[nodeIndex].terminal) return true;
  }
  return false;
}

interface TypedClaims {
  personIds: Set<string>;
  clientIds: Set<string>;
  relationshipIds: Set<string>;
  depthUnknown: boolean;
}

function meterTraversalValue(value: unknown, context: Pick<TraversalMeter, "maxValues" | "result">): boolean {
  if (context.result.work.valuesVisited >= context.maxValues) {
    addIncomplete(context.result, "value-limit");
    return false;
  }
  context.result.work.valuesVisited += 1;
  if (typeof value !== "string") return true;
  if (value.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) {
    addIncomplete(context.result, "string-limit");
    return false;
  }
  if (context.result.work.charactersInspected + value.length > MAX_SUBJECT_ACCESS_CHARACTERS) {
    addIncomplete(context.result, "character-limit");
    return false;
  }
  context.result.work.charactersInspected += value.length;
  return true;
}

function markStoredValueIssue(
  meter: Pick<TraversalMeter, "result">,
  collection: string,
  reason: Extract<SubjectAccessIncompleteReason, "accessor-value" | "invalid-stored-value">,
): void {
  addIncomplete(meter.result, reason);
  addCount(meter.result.omittedFields, collection);
}

/**
 * Enumerate a stored object without invoking getters. Property-name work is
 * charged before a descriptor is admitted, including descriptors that are
 * rejected because they are accessors.
 */
function storedDataEntries(
  value: object,
  meter: Pick<TraversalMeter, "maxValues" | "result">,
  collection: string,
): StoredDataEntries {
  const entries: Array<[string, unknown]> = [];
  const nonDataKeys = new Set<string>();
  let complete = true;
  for (const key of Object.keys(value)) {
    if (!meterTraversalValue(key, meter)) {
      complete = false;
      break;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    if (!("value" in descriptor)) {
      nonDataKeys.add(key);
      markStoredValueIssue(meter, collection, "accessor-value");
      continue;
    }
    entries.push([key, descriptor.value]);
  }
  return { entries, nonDataKeys, complete };
}

/**
 * Convert stored data into null-prototype objects/ordinary arrays using data
 * descriptors only. Projectors therefore never receive an accessor-bearing
 * value, even when a hostile in-memory adapter supplies one.
 */
function materialiseStoredValue(
  value: unknown,
  meter: TraversalMeter,
  collection: string,
  depth = 0,
  visiting = new WeakSet<object>(),
): MaterialisedValue {
  if (!meterTraversalValue(value, meter)) return { value: undefined, unsafe: true };
  if (value === undefined || value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { value, unsafe: false };
  }
  if (typeof value !== "object") {
    markStoredValueIssue(meter, collection, "invalid-stored-value");
    return { value: undefined, unsafe: true };
  }
  if (depth > MAX_REVIEW_SCAN_DEPTH || visiting.has(value)) {
    addCount(meter.result.depthLimitMatches, collection);
    return { value: undefined, unsafe: true };
  }
  const cached = meter.materialised.get(value);
  if (cached) return cached;

  const output: JsonRecord | unknown[] = Array.isArray(value) ? [] : Object.create(null) as JsonRecord;
  const materialised: MaterialisedValue = { value: output, unsafe: false };
  meter.materialised.set(value, materialised);
  visiting.add(value);
  const descriptors = storedDataEntries(value, meter, collection);
  if (!descriptors.complete || descriptors.nonDataKeys.size > 0) materialised.unsafe = true;
  for (const [key, child] of descriptors.entries) {
    if (Array.isArray(output) && !/^(?:0|[1-9][0-9]*)$/.test(key)) {
      markStoredValueIssue(meter, collection, "invalid-stored-value");
      materialised.unsafe = true;
      continue;
    }
    const cloned = materialiseStoredValue(child, meter, collection, depth + 1, visiting);
    if (cloned.unsafe) materialised.unsafe = true;
    if (cloned.value !== undefined) {
      if (Array.isArray(output)) output[Number(key)] = cloned.value;
      else output[key] = cloned.value;
    }
  }
  visiting.delete(value);
  return materialised;
}

function extractTypedClaims(record: JsonRecord, context: ExportContext): TypedClaims {
  const claims: TypedClaims = {
    personIds: new Set(), clientIds: new Set(), relationshipIds: new Set(), depthUnknown: false,
  };
  const stack: Array<{ value: unknown; depth: number; claimContext: boolean }> = [
    { value: record, depth: 0, claimContext: false },
  ];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const { value, depth, claimContext } = stack.pop()!;
    if (!meterTraversalValue(value, context)) {
      claims.depthUnknown = true;
      break;
    }
    if (value === undefined || value === null || typeof value !== "object") continue;
    if (depth > MAX_SCOPE_DEPTH) {
      claims.depthUnknown = true;
      continue;
    }
    if (seen.has(value as object)) continue;
    seen.add(value as object);
    if (hasEnumerableAccessor(value as object)) claims.depthUnknown = true;
    const data = new Map(ownDataEntries(value as object));
    if (!Array.isArray(value)) {
      for (const key of ["ownerPersonId", "subjectPersonId"]) {
        const claim = data.get(key);
        if (typeof claim === "string" && claim) claims.personIds.add(claim);
      }
      for (const key of ["ownerClientId", "subjectClientId"]) {
        const claim = data.get(key);
        if (typeof claim === "string" && claim) claims.clientIds.add(claim);
      }
      if (depth === 0 || claimContext) {
        const personId = data.get("personId");
        if (typeof personId === "string" && personId) claims.personIds.add(personId);
        const clientId = data.get("clientId");
        if (typeof clientId === "string" && clientId) claims.clientIds.add(clientId);
        const relationshipId = data.get("relationshipId");
        if (typeof relationshipId === "string" && relationshipId) claims.relationshipIds.add(relationshipId);
      }
      const kind = data.get("kind") ?? data.get("type");
      const id = data.get("id");
      if (claimContext && typeof id === "string" && id) {
        if (kind === "person") claims.personIds.add(id);
        if (kind === "client") claims.clientIds.add(id);
        if (kind === "relationship") claims.relationshipIds.add(id);
      }
    }
    for (const [key, child] of data) {
      if (context.result.work.valuesVisited + stack.length >= context.maxValues) {
        addIncomplete(context.result, "value-limit");
        claims.depthUnknown = true;
        break;
      }
      stack.push({
        value: child,
        depth: depth + 1,
        claimContext: claimContext || /(?:^|[-_])(scope|owner|subject|claim)(?:$|[-_])/i.test(key)
          || /^(?:scope|owner|subject|claim)/i.test(key),
      });
    }
  }
  return claims;
}

interface ScanResult {
  mentioned: boolean;
  depthExceeded: boolean;
}

function scanForSubject(value: unknown, context: ExportContext): ScanResult {
  let mentioned = false;
  let depthExceeded = false;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const current = stack.pop()!;
    if (!meterTraversalValue(current.value, context)) break;
    if (current.depth > MAX_REVIEW_SCAN_DEPTH) {
      depthExceeded = true;
      continue;
    }
    if (typeof current.value === "string") {
      const raw = current.value;
      if (indexedMatcherHas(context.subjectReferenceMatcher, raw, context)) mentioned = true;
      const digits = digitsOnly(raw);
      if (digits.length >= 7 && indexedMatcherHas(context.subjectPhoneMatcher, digits, context)) mentioned = true;
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    if (seen.has(current.value as object)) continue;
    seen.add(current.value as object);
    if (hasEnumerableAccessor(current.value as object)) depthExceeded = true;
    for (const [, child] of ownDataEntries(current.value as object)) {
      if (context.result.work.valuesVisited + stack.length >= context.maxValues) {
        addIncomplete(context.result, "value-limit");
        depthExceeded = true;
        break;
      }
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return { mentioned, depthExceeded };
}

type Ownership = "authoritative" | "ambiguous" | "unclassified" | "none";
interface OwnershipClassification { ownership: Ownership; inspectionIncomplete: boolean }

function contactOwnership(record: JsonRecord, context: ExportContext): "exclusive" | "ambiguous" | "none" {
  const emails: string[] = [];
  const phones: string[] = [];
  const addString = (target: string[], value: unknown) => {
    if (typeof value === "string") target.push(value);
    if (Array.isArray(value)) {
      for (const [, item] of ownDataEntries(value)) {
        if (typeof item === "string") target.push(item);
        else {
          const itemRecord = asRecord(item);
          const itemValue = itemRecord ? ownDataValue(itemRecord, "value") : undefined;
          if (typeof itemValue === "string") target.push(itemValue);
        }
      }
    }
  };
  addString(emails, ownDataValue(record, "email"));
  addString(phones, ownDataValue(record, "phone"));
  const contact = asRecord(ownDataValue(record, "contact"));
  if (contact) {
    addString(emails, ownDataValue(contact, "email"));
    addString(emails, ownDataValue(contact, "emailAddress"));
    addString(emails, ownDataValue(contact, "emails"));
    addString(phones, ownDataValue(contact, "phone"));
    addString(phones, ownDataValue(contact, "phoneNumber"));
    addString(phones, ownDataValue(contact, "phones"));
  }
  let exclusive = false;
  let ambiguous = false;
  for (const email of emails) {
    const key = normaliseEmail(email);
    if (context.identifiers.exclusiveEmails.has(key)) exclusive = true;
    if (context.identifiers.ambiguousEmails.has(key)) ambiguous = true;
  }
  for (const phone of phones) {
    const key = phoneMatchKey(phone);
    if (!key) continue;
    if (context.identifiers.exclusivePhones.has(key)) exclusive = true;
    if (context.identifiers.ambiguousPhones.has(key)) ambiguous = true;
  }
  return ambiguous ? "ambiguous" : exclusive ? "exclusive" : "none";
}

function setSome(values: ReadonlySet<string>, predicate: (value: string) => boolean): boolean {
  for (const value of values) if (predicate(value)) return true;
  return false;
}

function classifyOwnership(record: JsonRecord, context: ExportContext): OwnershipClassification {
  const claims = extractTypedClaims(record, context);
  const personConflict = setSome(claims.personIds, id => id !== context.person.id);
  const clientConflict = setSome(claims.clientIds, id => !context.lineage.clientIds.has(id));
  const relationshipConflict = setSome(claims.relationshipIds, id => !context.lineage.relationshipIds.has(id));
  const typedConflict = personConflict || clientConflict || relationshipConflict;
  const contact = contactOwnership(record, context);
  const recordId = ownDataValue(record, "id");
  const id = typeof recordId === "string" ? recordId : undefined;
  const typedMatch = claims.personIds.has(context.person.id)
    || setSome(claims.clientIds, clientId => context.lineage.clientIds.has(clientId))
    || setSome(claims.relationshipIds, relationshipId => context.lineage.relationshipIds.has(relationshipId));
  const recordIdMatch = id === context.person.id
    || (id !== undefined && context.lineage.clientIds.has(id))
    || (id !== undefined && context.lineage.facetIds.has(id));

  // A stronger, explicit ownership claim always vetoes a weak contact match,
  // including stale/missing ids. An uninspectable nested scope also vetoes it.
  if ((typedConflict || claims.depthUnknown) && (typedMatch || recordIdMatch || contact !== "none")) {
    return { ownership: "ambiguous", inspectionIncomplete: claims.depthUnknown };
  }
  if (typedConflict && setSome(claims.clientIds, idValue => context.lineage.conflictingClientIds.has(idValue))) {
    return { ownership: "ambiguous", inspectionIncomplete: claims.depthUnknown };
  }
  if (typedMatch || recordIdMatch) return { ownership: "authoritative", inspectionIncomplete: claims.depthUnknown };
  if (contact === "ambiguous") return { ownership: "ambiguous", inspectionIncomplete: claims.depthUnknown };
  if (contact === "exclusive") return { ownership: "authoritative", inspectionIncomplete: claims.depthUnknown };
  const scan = scanForSubject(record, context);
  return {
    ownership: scan.mentioned ? "unclassified" : "none",
    inspectionIncomplete: claims.depthUnknown || scan.depthExceeded,
  };
}

function noteOmitted(
  collection: string,
  value: unknown,
  context: ExportContext,
  options: { coMingled?: boolean } = {},
): void {
  addCount(context.result.omittedFields, collection);
  if (options.coMingled) addCount(context.result.coMingledPiiMatches, collection);
  const scan = scanForSubject(value, context);
  if (scan.depthExceeded) addCount(context.result.depthLimitMatches, collection);
}

function noteUnknownFields(
  collection: string,
  record: JsonRecord,
  allowed: ReadonlySet<string>,
  context: ExportContext,
): void {
  for (const [key, value] of ownDataEntries(record)) {
    if (allowed.has(key)) continue;
    noteOmitted(collection, value, context, { coMingled: typeof value === "string" || typeof value === "object" });
  }
}

function projectPerson(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "persons";
  const allowed = new Set([
    "id", "agencyId", "emails", "phones", "name", "company", "organisationId", "organisationLinks",
    "jobTitle", "isPrimaryContact", "notes", "record", "customFields", "classification", "classifiedAt",
    "classifiedBy", "classificationHistory", "facets", "relationshipId", "source", "createdAt", "updatedAt",
  ]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, [
    "id", "agencyId", "name", "company", "organisationId", "jobTitle", "isPrimaryContact", "classification",
    "classifiedAt", "classifiedBy", "relationshipId", "source", "createdAt", "updatedAt",
  ], collection, context);

  out.emails = (Array.isArray(record.emails) ? record.emails : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item || typeof item.value !== "string") return [];
    if (!context.identifiers.exclusiveEmails.has(normaliseEmail(item.value))) {
      noteOmitted(collection, item, context, { coMingled: true });
      return [];
    }
    const projected = copyScalarFields(item, ["value", "isPrimary"], collection, context);
    if (typeof item.raw === "string" && normaliseEmail(item.raw) === normaliseEmail(item.value)) projected.raw = item.raw;
    else if (item.raw !== undefined) noteOmitted(collection, item.raw, context, { coMingled: true });
    if (item.label !== undefined) noteOmitted(collection, item.label, context, { coMingled: true });
    return [projected];
  });
  out.phones = (Array.isArray(record.phones) ? record.phones : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item || typeof item.value !== "string") return [];
    const valueKey = phoneMatchKey(item.value);
    if (!valueKey || !context.identifiers.exclusivePhones.has(valueKey)) {
      noteOmitted(collection, item, context, { coMingled: true });
      return [];
    }
    const projected = copyScalarFields(item, ["value", "isPrimary", "shared"], collection, context);
    if (typeof item.raw === "string" && phoneMatchKey(item.raw) === valueKey) projected.raw = item.raw;
    else if (item.raw !== undefined) noteOmitted(collection, item.raw, context, { coMingled: true });
    if (item.label !== undefined) noteOmitted(collection, item.label, context, { coMingled: true });
    return [projected];
  });
  const facets = asRecord(record.facets) ?? {};
  out.facets = {
    ...copyScalarFields(facets, ["leadId", "contactId"], collection, context),
    clientIds: Array.isArray(facets.clientIds) ? facets.clientIds.filter(value => typeof value === "string") : [],
    enquiryIds: Array.isArray(facets.enquiryIds) ? facets.enquiryIds.filter(value => typeof value === "string") : [],
  };
  out.classificationHistory = (Array.isArray(record.classificationHistory) ? record.classificationHistory : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item) return [];
    if (item.note !== undefined) noteOmitted(collection, item.note, context, { coMingled: true });
    return [copyScalarFields(item, ["from", "to", "at", "by", "sourceType", "sourceId"], collection, context)];
  });
  out.organisationLinks = (Array.isArray(record.organisationLinks) ? record.organisationLinks : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item) return [];
    if (item.reason !== undefined) noteOmitted(collection, item.reason, context, { coMingled: true });
    return [copyScalarFields(item, ["organisationId", "status", "confidence", "suggestedAt", "decidedAt", "decidedBy"], collection, context)];
  });
  out.record = (Array.isArray(record.record) ? record.record : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item) return [];
    for (const field of ["summary", "body", "location", "outcome", "createdBy"] as const) {
      if (item[field] !== undefined) noteOmitted(collection, item[field], context, { coMingled: true });
    }
    return [copyScalarFields(item, ["id", "kind", "at", "createdAt"], collection, context)];
  });
  for (const field of ["notes", "customFields"] as const) {
    if (record[field] !== undefined) noteOmitted(collection, record[field], context, { coMingled: true });
  }
  return out;
}

const BRAND_FIELDS = new Set([
  "logoUrl", "primaryColor", "secondaryColor", "accentColor", "fontHeading", "fontBody", "borderRadius",
  "bgElevated", "text", "textMuted", "border", "radiusSm", "radiusMd", "radiusLg",
]);

function projectClient(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "clients";
  const allowed = new Set([
    "id", "agencyId", "relationshipId", "personId", "workspaceLabel", "companyId", "name", "slug", "brand",
    "stage", "ownerEmail", "websiteUrl", "status", "endCustomers", "metadata", "createdAt", "updatedAt",
  ]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, [
    "id", "agencyId", "relationshipId", "personId", "companyId", "slug", "stage",
    "status", "createdAt", "updatedAt",
  ], collection, context);
  projectSafeStringFields(record, out, ["websiteUrl"], collection, context);
  for (const field of ["name", "workspaceLabel"] as const) {
    if (typeof record[field] !== "string") continue;
    if (record[field] === context.person.name || record[field] === context.person.company) out[field] = record[field];
    else noteOmitted(collection, record[field], context, { coMingled: true });
  }
  const brand = asRecord(record.brand);
  if (brand) {
    out.brand = copyScalarFields(brand, [...BRAND_FIELDS], collection, context);
    for (const [key, value] of Object.entries(brand)) {
      if (!BRAND_FIELDS.has(key)) noteOmitted(collection, value, context, { coMingled: true });
    }
  }
  if (typeof record.ownerEmail === "string") {
    if (context.identifiers.exclusiveEmails.has(normaliseEmail(record.ownerEmail))) out.ownerEmail = record.ownerEmail;
    else {
      out.ownerEmail = "[redacted:third-party-email]";
      addCount(context.result.redactedFields, collection);
      addCount(context.result.coMingledPiiMatches, collection);
    }
  }
  for (const field of ["endCustomers", "metadata"] as const) {
    if (record[field] !== undefined) noteOmitted(collection, record[field], context, { coMingled: true });
  }
  return out;
}

function projectContact(contact: JsonRecord, collection: string, context: ExportContext): JsonRecord {
  const out: JsonRecord = {};
  const allowed = new Set(["name", "email", "emailAddress", "phone", "phoneNumber", "address", "postcode"]);
  for (const [key, value] of Object.entries(contact)) {
    if (!allowed.has(key)) {
      noteOmitted(collection, value, context, { coMingled: true });
      continue;
    }
    if (typeof value !== "string") {
      noteOmitted(collection, value, context, { coMingled: true });
      continue;
    }
    if (key === "email" || key === "emailAddress") {
      out[key] = context.identifiers.exclusiveEmails.has(normaliseEmail(value)) ? value : "[redacted:third-party-email]";
    } else if (key === "phone" || key === "phoneNumber") {
      const keyValue = phoneMatchKey(value);
      out[key] = keyValue && context.identifiers.exclusivePhones.has(keyValue) ? value : "[redacted:third-party-phone]";
    } else if (key === "name") {
      out[key] = value === context.person.name ? value : "[redacted:third-party-name]";
    } else {
      out[key] = "[redacted:third-party-address]";
    }
    if (out[key] !== value) {
      addCount(context.result.redactedFields, collection);
      addCount(context.result.coMingledPiiMatches, collection);
    }
  }
  return out;
}

const TASK_STATUSES = new Set(["todo", "in-progress", "done"]);
const TASK_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const TASK_ORIGINS = new Set(["manual", "radar", "advisor", "crm", "inbox"]);
const TASK_BOARD_COLUMNS = new Set(["backlog", "this-week", "doing", "waiting-on-client", "review", "done"]);

function projectEnumStringField(
  record: JsonRecord,
  out: JsonRecord,
  field: string,
  allowed: ReadonlySet<string>,
  collection: string,
  context: ExportContext,
): void {
  const value = ownDataValue(record, field);
  if (value === undefined) return;
  if (typeof value === "string" && allowed.has(value) && !textHasRestrictedPii(value, context, false)) {
    out[field] = value;
    return;
  }
  noteOmitted(collection, value, context, { coMingled: typeof value === "string" || typeof value === "object" });
}

function projectTask(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "tasks";
  const allowed = new Set([
    "id", "agencyId", "personId", "ownerPersonId", "subjectPersonId", "clientId", "ownerClientId", "subjectClientId",
    "relationshipId", "scope", "owner", "contact", "title", "notes", "status", "priority", "startAt", "dueAt",
    "reminderAt", "recurrence", "seriesId", "origin", "sourceId", "sourceHref", "evidence", "evidenceSourceIds",
    "expectedOutcome", "reconciliation", "acceptedAt", "assigneeUserId", "sopIds", "customFields", "revision",
    "clientBoardColumn", "clientBoardOrder", "checklist", "createdBy", "createdAt", "updatedAt", "completedAt",
  ]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, [
    "id", "agencyId", "personId", "ownerPersonId", "subjectPersonId", "clientId", "ownerClientId", "subjectClientId",
    "relationshipId", "startAt", "dueAt", "reminderAt",
    "acceptedAt", "revision", "clientBoardOrder", "createdAt", "updatedAt", "completedAt",
  ], collection, context);
  projectEnumStringField(record, out, "status", TASK_STATUSES, collection, context);
  projectEnumStringField(record, out, "priority", TASK_PRIORITIES, collection, context);
  projectEnumStringField(record, out, "origin", TASK_ORIGINS, collection, context);
  projectEnumStringField(record, out, "clientBoardColumn", TASK_BOARD_COLUMNS, collection, context);
  projectSafeStringFields(record, out, ["seriesId", "sourceId", "sourceHref"], collection, context);
  if (typeof record.title === "string") {
    if (record.title === context.person.name) out.title = record.title;
    else noteOmitted(collection, record.title, context, { coMingled: true });
  }
  const contact = asRecord(record.contact);
  if (contact) out.contact = projectContact(contact, collection, context);
  for (const field of ["scope", "owner", "notes", "recurrence", "evidence", "evidenceSourceIds", "expectedOutcome", "reconciliation", "assigneeUserId", "sopIds", "customFields", "checklist", "createdBy"] as const) {
    if (record[field] !== undefined) noteOmitted(collection, record[field], context, { coMingled: typeof record[field] === "string" || typeof record[field] === "object" });
  }
  return out;
}

const SUBJECT_REQUEST_NUMBER_FIELDS = [
  "receivedAt", "dueAt", "extendedAt", "identityVerifiedAt", "preparedExportAt", "preparedExportGeneratedAt",
  "preparedExportRecordCount", "preparedExportReviewCount", "preparedExportByteLength", "preparedExportReviewResolvedAt",
  "deliveredAt", "fulfilledAt", "refusedAt",
] as const satisfies readonly (keyof SubjectRequest)[];
const SUBJECT_REQUEST_ID_FIELDS = [
  "id", "agencyId", "personId",
] as const satisfies readonly (keyof SubjectRequest)[];
const SUBJECT_REQUEST_DIGEST_FIELDS = [
  "preparedExportDigest", "preparedExportReviewResolvedDigest", "deliveryResultId",
] as const satisfies readonly (keyof SubjectRequest)[];
const SUBJECT_REQUEST_ENUM_FIELDS = ["kind", "deliveryMethod"] as const satisfies readonly (keyof SubjectRequest)[];
const SUBJECT_REQUEST_SAFE_STRING_FIELDS = [
  "identityVerifiedBy", "preparedExportBy", "preparedExportReviewResolvedBy", "preparedExportReviewEvidenceId",
  "deliveredBy", "deliveryEvidenceId", "fulfilledBy", "createdBy",
] as const satisfies readonly (keyof SubjectRequest)[];
const SUBJECT_REQUEST_OMITTED_FIELDS = [
  "extensionReason", "preparedExportJson", "outcome", "refusalReason",
] as const satisfies readonly (keyof SubjectRequest)[];
type HandledSubjectRequestField = typeof SUBJECT_REQUEST_NUMBER_FIELDS[number]
  | typeof SUBJECT_REQUEST_ID_FIELDS[number]
  | typeof SUBJECT_REQUEST_DIGEST_FIELDS[number]
  | typeof SUBJECT_REQUEST_ENUM_FIELDS[number]
  | typeof SUBJECT_REQUEST_SAFE_STRING_FIELDS[number]
  | typeof SUBJECT_REQUEST_OMITTED_FIELDS[number]
  | "subjectLabel";
const SUBJECT_REQUEST_FIELDS_COMPLETE: Exclude<keyof SubjectRequest, HandledSubjectRequestField> extends never ? true : never = true;

const SUBJECT_REQUEST_KINDS = new Set<SubjectRequest["kind"]>([
  "access", "erasure", "rectification", "portability", "objection", "restriction",
]);
const SUBJECT_REQUEST_DELIVERY_METHODS = new Set<NonNullable<SubjectRequest["deliveryMethod"]>>([
  "verified-portal", "secure-email", "in-person", "other",
]);

function projectSubjectRequestTypedFields(record: JsonRecord, out: JsonRecord, context: ExportContext): void {
  const collection = "subjectRequests";
  for (const field of SUBJECT_REQUEST_NUMBER_FIELDS) {
    const value = ownDataValue(record, field);
    if (value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0) out[field] = value;
    else noteOmitted(collection, value, context, { coMingled: typeof value === "string" || typeof value === "object" });
  }
  projectSafeStringFields(record, out, SUBJECT_REQUEST_ID_FIELDS, collection, context);
  for (const field of SUBJECT_REQUEST_DIGEST_FIELDS) {
    const value = ownDataValue(record, field);
    if (value === undefined) continue;
    if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) out[field] = value;
    else noteOmitted(collection, value, context, { coMingled: typeof value === "string" || typeof value === "object" });
  }
  const kind = ownDataValue(record, "kind");
  if (kind !== undefined) {
    if (typeof kind === "string" && SUBJECT_REQUEST_KINDS.has(kind as SubjectRequest["kind"])) out.kind = kind;
    else noteOmitted(collection, kind, context, { coMingled: typeof kind === "string" || typeof kind === "object" });
  }
  const deliveryMethod = ownDataValue(record, "deliveryMethod");
  if (deliveryMethod !== undefined) {
    if (typeof deliveryMethod === "string" && SUBJECT_REQUEST_DELIVERY_METHODS.has(deliveryMethod as NonNullable<SubjectRequest["deliveryMethod"]>)) {
      out.deliveryMethod = deliveryMethod;
    } else noteOmitted(collection, deliveryMethod, context, { coMingled: typeof deliveryMethod === "string" || typeof deliveryMethod === "object" });
  }
}

function projectSubjectRequest(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "subjectRequests";
  const allowed = new Set<string>([
    ...SUBJECT_REQUEST_NUMBER_FIELDS,
    ...SUBJECT_REQUEST_ID_FIELDS,
    ...SUBJECT_REQUEST_DIGEST_FIELDS,
    ...SUBJECT_REQUEST_ENUM_FIELDS,
    ...SUBJECT_REQUEST_SAFE_STRING_FIELDS,
    ...SUBJECT_REQUEST_OMITTED_FIELDS,
    "subjectLabel",
  ]);
  if (!SUBJECT_REQUEST_FIELDS_COMPLETE) throw new Error("unreachable_subject_request_projection");
  noteUnknownFields(collection, record, allowed, context);
  const out: JsonRecord = {};
  projectSubjectRequestTypedFields(record, out, context);
  projectSafeStringFields(record, out, SUBJECT_REQUEST_SAFE_STRING_FIELDS, collection, context);
  if (typeof record.subjectLabel === "string") {
    const label = record.subjectLabel;
    const labelPhone = phoneMatchKey(label);
    if (label === context.person.name || context.identifiers.exclusiveEmails.has(normaliseEmail(label)) || (labelPhone && context.identifiers.exclusivePhones.has(labelPhone))) {
      out.subjectLabel = label;
    } else noteOmitted(collection, label, context, { coMingled: true });
  }
  for (const field of SUBJECT_REQUEST_OMITTED_FIELDS) {
    if (record[field] !== undefined) noteOmitted(collection, record[field], context, { coMingled: true });
  }
  return out;
}

function projectActivity(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "activity";
  const allowed = new Set(["id", "ts", "agencyId", "clientId", "actorUserId", "actorEmail", "category", "action", "message", "metadata"]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, ["id", "ts", "agencyId", "clientId", "category", "action"], collection, context);
  for (const field of ["actorUserId", "actorEmail", "message", "metadata"] as const) {
    if (record[field] !== undefined) noteOmitted(collection, record[field], context, { coMingled: true });
  }
  return out;
}

const LEDGER_SCALAR_FIELDS = [
  "id", "agencyId", "clientId", "sourceType", "occurredAt", "visibility",
  "attention", "createdAt", "updatedAt",
] as const;
const LEDGER_SAFE_STRING_FIELDS = ["sourceId", "group", "eyebrow", "href", "parentSourceId"] as const;

const EMAIL_TOKEN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const UK_SORT_CODE = /(?:^|[^0-9])\d{2}[\s\-/]\d{2}[\s\-/]\d{2}(?:$|[^0-9])/;
const UK_NINO = /\b[A-CEGHJ-PR-TW-Z]{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-D]\b/i;
const UK_POSTCODE = /\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][0-9][0-9A-HJKSTUW]?|[A-PR-UWYZ][A-HK-Y][0-9][0-9ABEHMNPRV-Y]?)\s?[0-9][ABD-HJLNP-UW-Z]{2})\b/i;
const IBAN_TOKEN = /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/i;
const UK_PHONE = /(?:^|[^A-Z0-9_])(?:\+44\s?(?:\(0\)\s?)?|0)(?:\d[\s().-]?){9,10}(?:$|[^A-Z0-9_])/i;
const UK_STREET_ADDRESS = /\b(?:flat|apartment|unit|suite|room)?\s*(?:\d{1,5}[A-Z]?(?:\s*[-/]\s*\d{1,5}[A-Z]?)?)\s+(?:[\p{L}][\p{L}'’.-]*\s+){0,6}(?:road|street|avenue|lane|drive|close|court|way|place|terrace|crescent|gardens?|grove|mews|square|parade|rise|row|walk|hill|view|vale)\b/iu;
const BANK_ACCOUNT_CONTEXT = /\b(?:bank[\s_-]*account|account[\s_-]*(?:number|no)|acct)\s*[:#=-]?\s*\d{8}\b/i;
const BARE_EIGHT_DIGIT = /^\s*(\d{8})\s*$/;

function isCompactCalendarDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function containsBankAccountIdentifier(value: string): boolean {
  if (BANK_ACCOUNT_CONTEXT.test(value)) return true;
  const bare = value.match(BARE_EIGHT_DIGIT)?.[1];
  return Boolean(bare && !isCompactCalendarDate(bare));
}

function exactSubjectString(value: string, context: ExportContext): boolean {
  if (value === context.person.name || value === context.person.company) return true;
  if (context.identifiers.exclusiveEmails.has(normaliseEmail(value))) return true;
  const phone = phoneMatchKey(value);
  return Boolean(phone && context.identifiers.exclusivePhones.has(phone));
}

function textHasRestrictedPii(
  value: string,
  context: ExportContext,
  title: boolean,
  allowExactSubject = true,
): boolean {
  if (value.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) return true;
  const labels = [
    "national insurance", "nationalinsurance", "nino", "ni number", "ni:", "bank account", "account number", "sort code",
    "iban", "swift", "routing number", " postcode", " address",
  ];
  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value && decoded.length <= MAX_SUBJECT_ACCESS_STRING_CHARACTERS) candidates.push(decoded);
  } catch {
    // Invalid percent encoding is inspected verbatim and never widened.
  }
  for (const candidate of candidates) {
    if (allowExactSubject && exactSubjectString(candidate, context)) continue;
    const lower = candidate.toLowerCase();
    if (labels.some(label => lower.includes(label))) return true;
    if (EMAIL_TOKEN.test(candidate)
      || UK_SORT_CODE.test(candidate)
      || UK_NINO.test(candidate)
      || UK_POSTCODE.test(candidate)
      || IBAN_TOKEN.test(candidate)
      || UK_PHONE.test(candidate)
      || UK_STREET_ADDRESS.test(candidate)
      || (!title && containsBankAccountIdentifier(candidate))) return true;
    if (indexedMatcherHas(context.otherPersonNameMatcher, lower, context)) return true;
    const digits = digitsOnly(candidate);
    if (digits.length >= 7 && indexedMatcherHas(context.ambiguousPhoneMatcher, digits, context)) return true;
    if (indexedMatcherHas(context.ambiguousEmailMatcher, lower, context)) return true;
  }
  return false;
}

function projectSafeStringFields(
  record: JsonRecord,
  out: JsonRecord,
  fields: readonly string[],
  collection: string,
  context: ExportContext,
): void {
  for (const field of fields) {
    const value = ownDataValue(record, field);
    if (value === undefined) continue;
    if (typeof value !== "string") {
      noteOmitted(collection, value, context, { coMingled: true });
      continue;
    }
    if (!textHasRestrictedPii(value, context, false)) {
      out[field] = value;
      continue;
    }
    out[field] = "[redacted:restricted-identifier]";
    addCount(context.result.redactedFields, collection);
    addCount(context.result.coMingledPiiMatches, collection);
  }
}

function projectLedger(record: JsonRecord, context: ExportContext): JsonRecord | null {
  const collection = "clientRecordLedger";
  if (record.sourceType !== "invoice" && record.sourceType !== "payment-plan") {
    addCount(context.result.unsupportedCollectionMatches, collection);
    return null;
  }
  const allowed = new Set([...LEDGER_SCALAR_FIELDS, ...LEDGER_SAFE_STRING_FIELDS, "title", "body"]);
  noteUnknownFields(collection, record, allowed, context);
  const title = typeof record.title === "string" ? record.title : "";
  const body = typeof record.body === "string" ? record.body : undefined;
  if (textHasRestrictedPii(title, context, true) || (body !== undefined && textHasRestrictedPii(body, context, false))) {
    addCount(context.result.coMingledPiiMatches, collection);
    return null;
  }
  const out = copyScalarFields(record, LEDGER_SCALAR_FIELDS, collection, context);
  projectSafeStringFields(record, out, LEDGER_SAFE_STRING_FIELDS, collection, context);
  out.title = title;
  if (body !== undefined) out.body = body;
  return out;
}

function projectPluginInstall(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "pluginInstalls";
  const allowed = new Set(["id", "pluginId", "agencyId", "clientId", "enabled", "config", "features", "setupAnswers", "installedAt", "installedBy", "health", "healthCheckedAt"]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, ["id", "pluginId", "agencyId", "clientId", "enabled", "installedAt", "healthCheckedAt"], collection, context);
  const features = asRecord(record.features);
  if (features) out.features = copyScalarFields(features, Object.keys(features), collection, context);
  const health = asRecord(record.health);
  if (health && typeof health.ok === "boolean") out.health = { ok: health.ok };
  for (const field of ["config", "setupAnswers", "installedBy"] as const) {
    if (record[field] !== undefined) noteOmitted(collection, record[field], context, { coMingled: true });
  }
  if (health?.message !== undefined) noteOmitted(collection, health.message, context, { coMingled: true });
  return out;
}

const INVOICE_FIELDS = [
  "id", "agencyId", "companyId", "clientId", "issuedAt", "dueAt", "subtotalCents", "taxCents", "totalCents",
  "currency", "status", "paidAt", "createdAt", "updatedAt",
] as const;
const INVOICE_SAFE_STRING_FIELDS = ["number", "externalRef", "paidVia"] as const;

function projectFinanceInvoice(record: JsonRecord, context: ExportContext): JsonRecord {
  const allowed = new Set([...INVOICE_FIELDS, ...INVOICE_SAFE_STRING_FIELDS, "lineItems", "notes", "issuerSnapshot"]);
  noteUnknownFields("pluginData", record, allowed, context);
  const out = copyScalarFields(record, INVOICE_FIELDS, "pluginData", context);
  projectSafeStringFields(record, out, INVOICE_SAFE_STRING_FIELDS, "pluginData", context);
  for (const field of ["lineItems", "notes", "issuerSnapshot"] as const) {
    if (record[field] !== undefined) noteOmitted("pluginData", record[field], context, { coMingled: true });
  }
  return out;
}

function projectKnownCollection(collection: string, record: JsonRecord, context: ExportContext): JsonRecord | null {
  if (collection === "persons") return projectPerson(record, context);
  if (collection === "clients") return projectClient(record, context);
  if (collection === "tasks") return projectTask(record, context);
  if (collection === "subjectRequests") return projectSubjectRequest(record, context);
  if (collection === "activity") return projectActivity(record, context);
  if (collection === "clientRecordLedger") return projectLedger(record, context);
  if (collection === "pluginInstalls") return projectPluginInstall(record, context);
  addCount(context.result.unsupportedCollectionMatches, collection);
  return null;
}

function inspectEveryEmittedString(value: unknown, collection: string, context: ExportContext): void {
  const stack: Array<{ parent: JsonRecord | unknown[]; key: string | number; value: unknown }> = [];
  const queueChildren = (parent: JsonRecord | unknown[]) => {
    for (const [key, child] of ownDataEntries(parent)) {
      if (!Array.isArray(parent) && textHasRestrictedPii(key, context, false, false)) {
        delete parent[key];
        addCount(context.result.redactedFields, collection);
        addCount(context.result.coMingledPiiMatches, collection);
        addCount(context.result.omittedFields, collection);
        continue;
      }
      stack.push({ parent, key: Array.isArray(parent) ? Number(key) : key, value: child });
    }
  };
  if (value !== null && typeof value === "object") queueChildren(value as JsonRecord | unknown[]);
  const seen = new WeakSet<object>();
  while (stack.length) {
    const current = stack.pop()!;
    if (typeof current.value === "string") {
      if (textHasRestrictedPii(current.value, context, false)) {
        if (Array.isArray(current.parent)) current.parent[current.key as number] = "[redacted:restricted-identifier]";
        else current.parent[current.key as string] = "[redacted:restricted-identifier]";
        addCount(context.result.redactedFields, collection);
        addCount(context.result.coMingledPiiMatches, collection);
      }
      continue;
    }
    if (current.value === null || typeof current.value !== "object" || seen.has(current.value)) continue;
    seen.add(current.value);
    queueChildren(current.value as JsonRecord | unknown[]);
  }
}

function addProjectedRecord(collection: string, projected: unknown, context: ExportContext): void {
  inspectEveryEmittedString(projected, collection, context);
  // Projectors only produce acyclic scalar/object/array shapes. Measure each
  // bounded projection before retaining it, so a huge in-memory state cannot
  // make JSON.stringify allocate an unbounded response and then discover the
  // limit afterwards.
  const stack = [projected];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === "string" && value.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) {
      addIncomplete(context.result, "string-limit");
      return;
    }
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value as object)) {
      addIncomplete(context.result, "output-size-limit");
      return;
    }
    seen.add(value as object);
    for (const child of Array.isArray(value) ? value : Object.values(value as JsonRecord)) stack.push(child);
  }
  const recordJson = JSON.stringify(projected);
  const recordBytes = Buffer.byteLength(recordJson, "utf8") + 1;
  // Leave a fixed budget for the subject, review counts, collection proof and
  // retention/delivery statements that wrap the records.
  if (context.result.work.serializedBytes + recordBytes > MAX_SUBJECT_ACCESS_EXPORT_BYTES - 100_000) {
    addIncomplete(context.result, "output-size-limit");
    return;
  }
  context.result.work.serializedBytes += recordBytes;
  (context.result.found[collection] ??= []).push(projected);
  context.result.totalRecords += 1;
}

function storedDataField(
  record: JsonRecord,
  key: string,
  meter: TraversalMeter,
  collection: string,
): { value: unknown; unsafe: boolean } {
  if (!meterTraversalValue(key, meter)) return { value: undefined, unsafe: true };
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor?.enumerable) return { value: undefined, unsafe: false };
  if (!("value" in descriptor)) {
    markStoredValueIssue(meter, collection, "accessor-value");
    return { value: undefined, unsafe: true };
  }
  if (!meterTraversalValue(descriptor.value, meter)) return { value: undefined, unsafe: true };
  return { value: descriptor.value, unsafe: false };
}

function inspectRecord(collection: string, value: unknown, context: ExportContext): void {
  const rawRecord = asRecord(value);
  if (!rawRecord) {
    const scan = scanForSubject(value, context);
    if (scan.mentioned) addCount(context.result.unclassifiedMatches, collection);
    if (scan.depthExceeded) addCount(context.result.depthLimitMatches, collection);
    return;
  }
  const ownerField = storedDataField(rawRecord, "agencyId", context, collection);
  if (ownerField.unsafe) {
    addCount(context.result.unclassifiedMatches, collection);
    return;
  }
  const ownerAgency = typeof ownerField.value === "string" ? ownerField.value : undefined;
  // Scope before inspection: another tenant's contents must neither enter the
  // export nor consume the tenant-local record budget.
  if (ownerAgency !== undefined && ownerAgency !== context.agencyId) return;
  if (ownerAgency === context.agencyId) {
    if (context.result.work.recordsVisited >= MAX_SUBJECT_ACCESS_RECORDS) {
      addIncomplete(context.result, "record-limit");
      return;
    }
    context.result.work.recordsVisited += 1;
  }
  const materialised = materialiseStoredValue(rawRecord, context, collection);
  const record = asRecord(materialised.value);
  if (!record || materialised.unsafe) {
    if (record) {
      const partialClassification = classifyOwnership(record, context);
      if (partialClassification.ownership !== "none") addCount(context.result.ambiguousMatches, collection);
      else addCount(context.result.unclassifiedMatches, collection);
    } else {
      addCount(context.result.unclassifiedMatches, collection);
    }
    return;
  }
  const classification = classifyOwnership(record, context);
  const ownership = classification.ownership;
  if (classification.inspectionIncomplete) addCount(context.result.depthLimitMatches, collection);
  if (ownership === "none") return;
  if (ownerAgency === undefined) {
    addCount(context.result.unscopedMatches, collection);
    return;
  }
  if (ownerAgency !== context.agencyId) return;
  if (ownership === "ambiguous") {
    addCount(context.result.ambiguousMatches, collection);
    return;
  }
  if (ownership === "unclassified") {
    addCount(context.result.unclassifiedMatches, collection);
    return;
  }
  const projected = projectKnownCollection(collection, record, context);
  if (projected) addProjectedRecord(collection, projected, context);
}

function inspectPluginData(rawPluginData: object, rawPluginInstalls: object | null, context: ExportContext): void {
  const collection = "pluginData";
  const installValues = rawPluginInstalls
    ? new Map(storedDataEntries(rawPluginInstalls, context, "pluginInstalls").entries)
    : new Map<string, unknown>();
  for (const [installId, values] of storedDataEntries(rawPluginData, context, collection).entries) {
    const rawInstall = installValues.get(installId);
    const installRecord = asRecord(rawInstall);
    let install: JsonRecord | null = null;
    if (installRecord) {
      const agencyField = storedDataField(installRecord, "agencyId", context, "pluginInstalls");
      if (agencyField.unsafe) continue;
      if (typeof agencyField.value === "string" && agencyField.value !== context.agencyId) continue;
      const materialisedInstall = materialiseStoredValue(installRecord, context, "pluginInstalls");
      install = asRecord(materialisedInstall.value);
      if (!install || materialisedInstall.unsafe) continue;
    }
    if (!values || typeof values !== "object") continue;
    for (const [key, rawValue] of storedDataEntries(values as object, context, collection).entries) {
      if (!install) {
        const materialisedUnknown = materialiseStoredValue(rawValue, context, collection);
        const scan = scanForSubject(materialisedUnknown.value, context);
        if (scan.mentioned) addCount(context.result.unclassifiedMatches, collection);
        if (scan.depthExceeded || materialisedUnknown.unsafe) addCount(context.result.depthLimitMatches, collection);
        continue;
      }
      if (context.result.work.recordsVisited >= MAX_SUBJECT_ACCESS_RECORDS) {
        addIncomplete(context.result, "record-limit");
        continue;
      }
      context.result.work.recordsVisited += 1;
      const materialisedRecord = materialiseStoredValue(rawValue, context, collection);
      const record = asRecord(materialisedRecord.value);
      if (!record || materialisedRecord.unsafe) {
        addCount(context.result.unclassifiedMatches, collection);
        continue;
      }
      const installClientId = ownDataValue(install, "clientId");
      const installOwnsSubject = typeof installClientId === "string" && context.lineage.clientIds.has(installClientId);
      const classification = record ? classifyOwnership(record, context) : null;
      let ownership: Ownership = classification?.ownership ?? "none";
      if (classification?.inspectionIncomplete) addCount(context.result.depthLimitMatches, collection);
      const recordAgencyId = ownDataValue(record, "agencyId");
      const installAgencyId = ownDataValue(install, "agencyId");
      if (typeof recordAgencyId === "string" && recordAgencyId !== installAgencyId) ownership = "ambiguous";
      if (installOwnsSubject) {
        const claims = extractTypedClaims(record, context);
        if ((typeof recordAgencyId === "string" && recordAgencyId !== installAgencyId)
          || setSome(claims.personIds, id => id !== context.person.id)
          || setSome(claims.clientIds, id => !context.lineage.clientIds.has(id))
          || setSome(claims.relationshipIds, id => !context.lineage.relationshipIds.has(id))
          || claims.depthUnknown) ownership = "ambiguous";
        else ownership = "authoritative";
      }
      if (ownership === "none") continue;
      if (ownership === "ambiguous") {
        addCount(context.result.ambiguousMatches, collection);
        continue;
      }
      if (ownership === "unclassified" || !record) {
        addCount(context.result.unclassifiedMatches, collection);
        continue;
      }
      const installPluginId = ownDataValue(install, "pluginId");
      if (installPluginId !== "agency-finance" || !key.startsWith("invoices/by-id/")) {
        addCount(context.result.unsupportedCollectionMatches, collection);
        continue;
      }
      const projected = projectFinanceInvoice(record, context);
      const projectedReference: JsonRecord = {};
      projectSafeStringFields({ key }, projectedReference, ["key"], collection, context);
      addProjectedRecord(collection, {
        installId,
        pluginId: installPluginId,
        key: projectedReference.key,
        value: projected,
      }, context);
    }
  }
}

function finaliseReviewTotals(result: SubjectAccessResult): void {
  result.sharedIdentifierMatches = { ...result.ambiguousMatches };
  result.reviewTotals = {
    recordsNotAttributableToThisAgency: sumCounts(result.unscopedMatches),
    unclassifiedSubjectMentions: sumCounts(result.unclassifiedMatches),
    ambiguousOwnership: sumCounts(result.ambiguousMatches),
    coMingledThirdPartyPii: sumCounts(result.coMingledPiiMatches),
    recordsBeyondInspectionDepth: sumCounts(result.depthLimitMatches),
    unsupportedCollections: sumCounts(result.unsupportedCollectionMatches),
    omittedFields: sumCounts(result.omittedFields),
  };
}

export function subjectAccessExportReviewCount(result: SubjectAccessResult): number {
  return Object.values(result.reviewTotals).reduce((sum, value) => sum + value, 0);
}

function initialSubjectAccessResult(personId: string, generatedAt: number): SubjectAccessResult {
  return {
    subject: {
      personId,
      emails: [],
      phones: [],
      clientIds: [],
      relationshipIds: [],
      facetIds: [],
    },
    generatedAt,
    found: {},
    searchedCollections: [],
    totalRecords: 0,
    unscopedMatches: {},
    unclassifiedMatches: {},
    ambiguousMatches: {},
    sharedIdentifierMatches: {},
    coMingledPiiMatches: {},
    depthLimitMatches: {},
    redactedFields: {},
    unsupportedCollectionMatches: {},
    omittedFields: {},
    reviewTotals: {
      recordsNotAttributableToThisAgency: 0,
      unclassifiedSubjectMentions: 0,
      ambiguousOwnership: 0,
      coMingledThirdPartyPii: 0,
      recordsBeyondInspectionDepth: 0,
      unsupportedCollections: 0,
      omittedFields: 0,
    },
    incompleteReasons: [],
    work: {
      recordsVisited: 0,
      valuesVisited: 0,
      charactersInspected: 0,
      matcherCharactersInspected: 0,
      serializedBytes: 0,
    },
  };
}

function safeHeaderValues(values: Iterable<string>, collection: string, context: ExportContext): string[] {
  const safe: string[] = [];
  for (const value of values) {
    if (!meterTraversalValue(value, context)) break;
    if (textHasRestrictedPii(value, context, false)) {
      noteOmitted(collection, value, context, { coMingled: true });
      continue;
    }
    safe.push(value);
  }
  return safe;
}

export function collectSubjectAccessExport(
  agencyId: string,
  personId: string,
  options: { generatedAt?: number; maxValues?: number } = {},
): SubjectAccessResult | null {
  const state = getState();
  const result = initialSubjectAccessResult(personId, options.generatedAt ?? Date.now());
  const meter: TraversalMeter = {
    maxValues: Math.max(1, Math.min(MAX_SUBJECT_ACCESS_VALUES, Math.floor(options.maxValues ?? MAX_SUBJECT_ACCESS_VALUES))),
    result,
    materialised: new WeakMap(),
  };
  const root = storedDataEntries(state as unknown as JsonRecord, meter, "portalState");
  const resident = new Map(root.entries);
  const rawPersonsValue = resident.get("persons");
  const rawPersons = asRecord(rawPersonsValue);
  if (!rawPersons) {
    if (root.nonDataKeys.has("persons") || result.incompleteReasons.length) return result;
    if (resident.has("persons")) {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      return result;
    }
    return null;
  }
  const personEntries = storedDataEntries(rawPersons, meter, "persons");
  const rawTargetPerson = new Map(personEntries.entries).get(personId);
  if (rawTargetPerson === undefined) {
    if (personEntries.nonDataKeys.has(personId) || result.incompleteReasons.length) return result;
    return null;
  }
  const rawTargetRecord = asRecord(rawTargetPerson);
  if (!rawTargetRecord) {
    markStoredValueIssue(meter, "persons", "invalid-stored-value");
    return result;
  }
  const targetAgency = storedDataField(rawTargetRecord, "agencyId", meter, "persons");
  if (targetAgency.unsafe) return result;
  if (targetAgency.value !== agencyId) return null;

  const persons: Person[] = [];
  let person: Person | null = null;
  for (const [storedId, rawValue] of personEntries.entries) {
    const rawRecord = asRecord(rawValue);
    if (!rawRecord) {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      continue;
    }
    const storedAgency = storedDataField(rawRecord, "agencyId", meter, "persons");
    if (storedAgency.unsafe || storedAgency.value !== agencyId) continue;
    const materialised = materialiseStoredValue(rawRecord, meter, "persons");
    const safeRecord = asRecord(materialised.value);
    if (!safeRecord) continue;
    const safeId = ownDataValue(safeRecord, "id");
    if (typeof safeId !== "string" || safeId !== storedId) {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      if (storedId === personId) return result;
      continue;
    }
    const safePerson = safeRecord as unknown as Person;
    persons.push(safePerson);
    if (storedId === personId) person = safePerson;
  }
  if (!person) return result;

  const clients: Client[] = [];
  const rawClientsValue = resident.get("clients");
  const rawClients = asRecord(rawClientsValue);
  if (rawClients) {
    const clientEntries = storedDataEntries(rawClients, meter, "clients");
    for (const [storedId, rawValue] of clientEntries.entries) {
      const rawRecord = asRecord(rawValue);
      if (!rawRecord) {
        markStoredValueIssue(meter, "clients", "invalid-stored-value");
        continue;
      }
      const materialised = materialiseStoredValue(rawRecord, meter, "clients");
      const safeRecord = asRecord(materialised.value);
      if (!safeRecord) continue;
      if (ownDataValue(safeRecord, "id") !== storedId) {
        markStoredValueIssue(meter, "clients", "invalid-stored-value");
        continue;
      }
      clients.push(safeRecord as unknown as Client);
    }
  } else if (root.nonDataKeys.has("clients")) {
    addIncomplete(result, "accessor-value");
  } else if (resident.has("clients")) {
    markStoredValueIssue(meter, "clients", "invalid-stored-value");
  }

  const identifiers = partitionIdentifiers(persons, agencyId, person, meter);
  const lineage = deriveLineage(clients, agencyId, person, meter);
  const otherPersonNames: string[] = [];
  for (const candidate of persons) {
    if (!meterTraversalValue(candidate, meter)) break;
    if (candidate.id === person.id || candidate.name === undefined) continue;
    if (typeof candidate.name !== "string") {
      markStoredValueIssue(meter, "persons", "invalid-stored-value");
      continue;
    }
    if (!meterTraversalValue(candidate.name, meter)) break;
    if (candidate.name) otherPersonNames.push(candidate.name);
  }
  const subjectReferencePatterns = [person.id, ...lineage.relationshipIds, ...lineage.facetIds, ...identifiers.allSubjectEmails];
  const subjectPhonePatterns: string[] = [];
  for (const value of identifiers.allSubjectPhones) {
    if (!meterTraversalValue(value, meter)) break;
    const digits = digitsOnly(value);
    if (digits.length >= 7) subjectPhonePatterns.push(digits);
  }
  const ambiguousPhonePatterns = [...identifiers.ambiguousPhones]
    .map(value => digitsOnly(value))
    .filter(value => value.length >= 7);
  const context: ExportContext = {
    agencyId,
    person,
    identifiers,
    lineage,
    otherPersonNameMatcher: buildIndexedStringMatcher(otherPersonNames, meter, { caseInsensitive: true, nameTokens: true }),
    subjectReferenceMatcher: buildIndexedStringMatcher(subjectReferencePatterns, meter, { caseInsensitive: true }),
    subjectPhoneMatcher: buildIndexedStringMatcher(subjectPhonePatterns, meter),
    ambiguousEmailMatcher: buildIndexedStringMatcher(identifiers.ambiguousEmails, meter, { caseInsensitive: true }),
    ambiguousPhoneMatcher: buildIndexedStringMatcher(ambiguousPhonePatterns, meter),
    maxValues: meter.maxValues,
    result,
    materialised: meter.materialised,
  };

  if (textHasRestrictedPii(result.subject.personId, context, false)) {
    result.subject.personId = "[redacted:restricted-identifier]";
    addCount(result.redactedFields, "persons");
    addCount(result.coMingledPiiMatches, "persons");
    addIncomplete(result, "invalid-stored-value");
  }
  if (typeof person.name === "string") result.subject.name = person.name;
  else if (person.name !== undefined) markStoredValueIssue(context, "persons", "invalid-stored-value");
  result.subject.emails = safeHeaderValues(identifiers.displayedEmails, "persons", context);
  result.subject.phones = safeHeaderValues(identifiers.displayedPhones, "persons", context);
  result.subject.clientIds = safeHeaderValues([...lineage.clientIds].sort(), "clients", context);
  result.subject.relationshipIds = safeHeaderValues([...lineage.relationshipIds].sort(), "clients", context);
  result.subject.facetIds = safeHeaderValues([...lineage.facetIds].sort(), "persons", context);

  const rawPluginInstalls = asRecord(resident.get("pluginInstalls"));
  for (const [collection, rawCollection] of root.entries) {
    if (rawCollection === null || typeof rawCollection !== "object") {
      markStoredValueIssue(context, collection, "invalid-stored-value");
      continue;
    }
    if (textHasRestrictedPii(collection, context, false)) {
      markStoredValueIssue(context, "portalState", "invalid-stored-value");
      continue;
    }
    result.searchedCollections.push(collection);
    if (collection === "pluginData") {
      inspectPluginData(rawCollection, rawPluginInstalls, context);
      continue;
    }
    const rows = storedDataEntries(rawCollection, context, collection);
    for (const [, row] of rows.entries) {
      inspectRecord(collection, row, context);
    }
  }
  finaliseReviewTotals(result);
  return result;
}

export function subjectAccessExportJson(result: SubjectAccessResult): string {
  if (result.incompleteReasons.length) {
    throw new SubjectAccessExportIncompleteError([...result.incompleteReasons]);
  }
  const json = JSON.stringify({
    format: "aqua-subject-access-v2",
    generatedAt: new Date(result.generatedAt).toISOString(),
    subject: result.subject,
    records: result.found,
    totalRecords: result.totalRecords,
    collectionsSearched: result.searchedCollections,
    reviewRequired: result.reviewTotals,
    completeness: {
      status: subjectAccessExportReviewCount(result) === 0 ? "automatic-safe-subset-complete" : "human-review-required",
      recordsNotAttributableToThisAgency: result.unscopedMatches,
      unclassifiedSubjectMentions: result.unclassifiedMatches,
      ambiguousOwnership: result.ambiguousMatches,
      coMingledThirdPartyPii: result.coMingledPiiMatches,
      redactedFields: result.redactedFields,
      recordsBeyondInspectionDepth: result.depthLimitMatches,
      unsupportedCollections: result.unsupportedCollectionMatches,
      omittedFields: result.omittedFields,
      loadedSidecars: SUBJECT_ACCESS_REQUIRED_SIDECARS,
      statement: "Every enumerable resident collection backed by stored data descriptors was inspected. Non-data descriptors and bounded-traversal failures make preparation incomplete. Counted review items are excluded from the automatic safe subset.",
    },
    retention: "This point-in-time export does not delete source data or change its configured retention.",
    delivery: "Preparation is not delivery. The request remains open until separate, evidenced delivery is recorded.",
  });
  if (Buffer.byteLength(json, "utf8") > MAX_SUBJECT_ACCESS_EXPORT_BYTES) {
    addIncomplete(result, "output-size-limit");
    throw new SubjectAccessExportIncompleteError(["output-size-limit"]);
  }
  return json;
}
