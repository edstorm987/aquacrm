import "server-only";

// GDPR subject-access export. Selection is deliberately based on typed
// ownership fields, never on arbitrary recursive value equality. Every state
// collection is still walked: unknown subject-linked shapes are counted for
// review instead of disappearing from the completeness statement.

import { phoneMatchKey } from "@/lib/telephony/phoneNumbers";
import { getState } from "@/server/storage";
import type { Person, PortalState, SubjectRequest } from "@/server/types";

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
  | "output-size-limit";

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

function copyScalarFields(source: JsonRecord, fields: readonly string[]): JsonRecord {
  const out: JsonRecord = {};
  for (const field of fields) {
    const value = ownDataValue(source, field);
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      if (value !== undefined) out[field] = value;
    }
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
  state: PortalState,
  agencyId: string,
  person: Person,
): IdentifierPartition {
  const emailOwners = new Map<string, Set<string>>();
  const phoneOwners = new Map<string, Set<string>>();
  const sharedPhones = new Set<string>();

  for (const candidate of Object.values(state.persons ?? {})) {
    if (candidate.agencyId !== agencyId) continue;
    for (const entry of candidate.emails ?? []) {
      const equivalentRaw = entry.raw && normaliseEmail(entry.raw) === normaliseEmail(entry.value) ? entry.raw : undefined;
      for (const raw of [entry.value, equivalentRaw]) {
        if (!raw) continue;
        const key = normaliseEmail(raw);
        let owners = emailOwners.get(key);
        if (!owners) emailOwners.set(key, owners = new Set());
        owners.add(candidate.id);
      }
    }
    for (const entry of candidate.phones ?? []) {
      const valueKey = phoneMatchKey(entry.value);
      const equivalentRaw = entry.raw && phoneMatchKey(entry.raw) === valueKey ? entry.raw : undefined;
      for (const raw of [entry.value, equivalentRaw]) {
        if (!raw) continue;
        const key = phoneMatchKey(raw);
        if (!key) continue;
        let owners = phoneOwners.get(key);
        if (!owners) phoneOwners.set(key, owners = new Set());
        owners.add(candidate.id);
        if (entry.shared) sharedPhones.add(key);
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

  for (const entry of person.emails ?? []) {
    const equivalentRaw = entry.raw && normaliseEmail(entry.raw) === normaliseEmail(entry.value) ? entry.raw : undefined;
    for (const raw of [entry.value, equivalentRaw]) {
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
  for (const entry of person.phones ?? []) {
    const valueKey = phoneMatchKey(entry.value);
    const equivalentRaw = entry.raw && phoneMatchKey(entry.raw) === valueKey ? entry.raw : undefined;
    for (const raw of [entry.value, equivalentRaw]) {
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

function deriveLineage(state: PortalState, agencyId: string, person: Person): SubjectLineage {
  const clientIds = new Set<string>();
  const conflictingClientIds = new Set<string>();
  const relationshipIds = new Set<string>();
  const facetIds = new Set<string>();
  if (person.relationshipId) relationshipIds.add(person.relationshipId);
  for (const value of [person.facets?.leadId, person.facets?.contactId, ...(person.facets?.enquiryIds ?? [])]) {
    if (value) facetIds.add(value);
  }

  for (const clientId of person.facets?.clientIds ?? []) {
    const client = state.clients?.[clientId];
    if (client && (client.agencyId !== agencyId || (client.personId && client.personId !== person.id))) {
      conflictingClientIds.add(clientId);
      continue;
    }
    // A missing row can be a deleted/archived workspace, but the canonical
    // Person facet itself remains exact ownership evidence.
    clientIds.add(clientId);
    if (client?.relationshipId) relationshipIds.add(client.relationshipId);
  }

  for (const client of Object.values(state.clients ?? {})) {
    if (client.agencyId !== agencyId) continue;
    if (client.personId === person.id) {
      clientIds.add(client.id);
      if (client.relationshipId) relationshipIds.add(client.relationshipId);
    }
  }
  for (const client of Object.values(state.clients ?? {})) {
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
  otherPersonNames: string[];
  subjectIdNeedles: string[];
  subjectEmailNeedles: string[];
  subjectPhoneDigitNeedles: string[];
  maxValues: number;
  result: SubjectAccessResult;
}

interface TypedClaims {
  personIds: Set<string>;
  clientIds: Set<string>;
  relationshipIds: Set<string>;
  depthUnknown: boolean;
}

function meterTraversalValue(value: unknown, context: ExportContext): boolean {
  context.result.work.valuesVisited += 1;
  if (context.result.work.valuesVisited > context.maxValues) {
    addIncomplete(context.result, "value-limit");
    return false;
  }
  if (typeof value !== "string") return true;
  if (value.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) {
    addIncomplete(context.result, "string-limit");
    return false;
  }
  context.result.work.charactersInspected += value.length;
  if (context.result.work.charactersInspected > MAX_SUBJECT_ACCESS_CHARACTERS) {
    addIncomplete(context.result, "character-limit");
    return false;
  }
  return true;
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
      if (context.subjectIdNeedles.some(needle => raw.includes(needle))) mentioned = true;
      const lower = raw.toLowerCase();
      if (context.subjectEmailNeedles.some(email => lower.includes(email))) mentioned = true;
      const digits = digitsOnly(raw);
      if (digits.length >= 7 && context.subjectPhoneDigitNeedles.some(phone => digits.includes(phone))) mentioned = true;
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
  ]);

  out.emails = (Array.isArray(record.emails) ? record.emails : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item || typeof item.value !== "string") return [];
    if (!context.identifiers.exclusiveEmails.has(normaliseEmail(item.value))) {
      noteOmitted(collection, item, context, { coMingled: true });
      return [];
    }
    const projected = copyScalarFields(item, ["value", "isPrimary"]);
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
    const projected = copyScalarFields(item, ["value", "isPrimary", "shared"]);
    if (typeof item.raw === "string" && phoneMatchKey(item.raw) === valueKey) projected.raw = item.raw;
    else if (item.raw !== undefined) noteOmitted(collection, item.raw, context, { coMingled: true });
    if (item.label !== undefined) noteOmitted(collection, item.label, context, { coMingled: true });
    return [projected];
  });
  const facets = asRecord(record.facets) ?? {};
  out.facets = {
    ...copyScalarFields(facets, ["leadId", "contactId"]),
    clientIds: Array.isArray(facets.clientIds) ? facets.clientIds.filter(value => typeof value === "string") : [],
    enquiryIds: Array.isArray(facets.enquiryIds) ? facets.enquiryIds.filter(value => typeof value === "string") : [],
  };
  out.classificationHistory = (Array.isArray(record.classificationHistory) ? record.classificationHistory : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item) return [];
    if (item.note !== undefined) noteOmitted(collection, item.note, context, { coMingled: true });
    return [copyScalarFields(item, ["from", "to", "at", "by", "sourceType", "sourceId"])];
  });
  out.organisationLinks = (Array.isArray(record.organisationLinks) ? record.organisationLinks : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item) return [];
    if (item.reason !== undefined) noteOmitted(collection, item.reason, context, { coMingled: true });
    return [copyScalarFields(item, ["organisationId", "status", "confidence", "suggestedAt", "decidedAt", "decidedBy"])];
  });
  out.record = (Array.isArray(record.record) ? record.record : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item) return [];
    for (const field of ["summary", "body", "location", "outcome", "createdBy"] as const) {
      if (item[field] !== undefined) noteOmitted(collection, item[field], context, { coMingled: true });
    }
    return [copyScalarFields(item, ["id", "kind", "at", "createdAt"])];
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
  ]);
  projectSafeStringFields(record, out, ["websiteUrl"], collection, context);
  for (const field of ["name", "workspaceLabel"] as const) {
    if (typeof record[field] !== "string") continue;
    if (record[field] === context.person.name || record[field] === context.person.company) out[field] = record[field];
    else noteOmitted(collection, record[field], context, { coMingled: true });
  }
  const brand = asRecord(record.brand);
  if (brand) {
    out.brand = copyScalarFields(brand, [...BRAND_FIELDS]);
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
    "relationshipId", "status", "priority", "startAt", "dueAt", "reminderAt", "origin",
    "acceptedAt", "revision", "clientBoardColumn", "clientBoardOrder", "createdAt", "updatedAt", "completedAt",
  ]);
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
  const out = copyScalarFields(record, ["id", "ts", "agencyId", "clientId", "category", "action"]);
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

function containsDigitRun(value: string, minimum: number): boolean {
  let digits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 48 && code <= 57) {
      digits += 1;
      if (digits >= minimum) return true;
    } else if (value[index] !== " " && value[index] !== "-" && value[index] !== "." && value[index] !== "(" && value[index] !== ")" && value[index] !== "+") {
      digits = 0;
    }
  }
  return false;
}

function looksLikeRestrictedIdentifierToken(raw: string): boolean {
  let token = "";
  for (let index = 0; index <= raw.length; index += 1) {
    const char = raw[index] ?? " ";
    const code = char.charCodeAt(0);
    const alphaNumeric = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (alphaNumeric) {
      token += char.toUpperCase();
      continue;
    }
    if (token.length >= 5 && token.length <= 9) {
      let letters = 0;
      let digits = 0;
      for (let tokenIndex = 0; tokenIndex < token.length; tokenIndex += 1) {
        const tokenCode = token.charCodeAt(tokenIndex);
        if (tokenCode >= 48 && tokenCode <= 57) digits += 1;
        else letters += 1;
      }
      const nationalInsuranceShape = token.length === 9 && letters === 3 && digits === 6;
      const postcodeShape = token.length >= 5 && token.length <= 7 && letters >= 3 && digits >= 1
        && token.charCodeAt(token.length - 1) >= 65 && token.charCodeAt(token.length - 2) >= 65;
      if (nationalInsuranceShape || postcodeShape) return true;
    }
    token = "";
  }
  return false;
}

function textHasRestrictedPii(value: string, context: ExportContext, title: boolean): boolean {
  if (value.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) return true;
  const labels = [
    "national insurance", "nationalinsurance", "nino", "ni number", "ni:", "bank account", "account number", "sort code",
    "iban", "swift", "routing number", " postcode", " address", " road", " street", " avenue", " lane", " drive",
  ];
  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value && decoded.length <= MAX_SUBJECT_ACCESS_STRING_CHARACTERS) candidates.push(decoded);
  } catch {
    // Invalid percent encoding is inspected verbatim and never widened.
  }
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (labels.some(label => lower.includes(label))) return true;
    if (candidate.includes("@") || containsDigitRun(candidate, title ? 10 : 8) || looksLikeRestrictedIdentifierToken(candidate)) return true;
    if (context.otherPersonNames.some(name => name && lower.includes(name.toLowerCase()))) return true;
    const digits = digitsOnly(candidate);
    for (const phone of context.identifiers.ambiguousPhones) {
      const phoneDigits = digitsOnly(phone);
      if (phoneDigits.length >= 7 && digits.includes(phoneDigits)) return true;
    }
    for (const email of context.identifiers.ambiguousEmails) {
      if (lower.includes(email)) return true;
    }
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
  const out = copyScalarFields(record, LEDGER_SCALAR_FIELDS);
  projectSafeStringFields(record, out, LEDGER_SAFE_STRING_FIELDS, collection, context);
  out.title = title;
  if (body !== undefined) out.body = body;
  return out;
}

function projectPluginInstall(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "pluginInstalls";
  const allowed = new Set(["id", "pluginId", "agencyId", "clientId", "enabled", "config", "features", "setupAnswers", "installedAt", "installedBy", "health", "healthCheckedAt"]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, ["id", "pluginId", "agencyId", "clientId", "enabled", "installedAt", "healthCheckedAt"]);
  const features = asRecord(record.features);
  if (features) out.features = copyScalarFields(features, Object.keys(features));
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
  const out = copyScalarFields(record, INVOICE_FIELDS);
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

function addProjectedRecord(collection: string, projected: unknown, context: ExportContext): void {
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

function agencyOf(record: JsonRecord): string | undefined {
  const agencyId = ownDataValue(record, "agencyId");
  return typeof agencyId === "string" ? agencyId : undefined;
}

function inspectRecord(collection: string, value: unknown, context: ExportContext): void {
  const record = asRecord(value);
  if (!record) {
    const scan = scanForSubject(value, context);
    if (scan.mentioned) addCount(context.result.unclassifiedMatches, collection);
    if (scan.depthExceeded) addCount(context.result.depthLimitMatches, collection);
    return;
  }
  const ownerAgency = agencyOf(record);
  // Scope before inspection: another tenant's contents must neither enter the
  // export nor influence its review counts/work budget.
  if (ownerAgency !== undefined && ownerAgency !== context.agencyId) return;
  if (ownerAgency === context.agencyId) {
    if (context.result.work.recordsVisited >= MAX_SUBJECT_ACCESS_RECORDS) {
      addIncomplete(context.result, "record-limit");
      return;
    }
    context.result.work.recordsVisited += 1;
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

function inspectPluginData(state: PortalState, context: ExportContext): void {
  const collection = "pluginData";
  const installs = state.pluginInstalls ?? {};
  for (const [installId, values] of ownDataEntries(state.pluginData ?? {})) {
    const install = installs[installId];
    if (!values || typeof values !== "object") continue;
    for (const [key, rawValue] of ownDataEntries(values as object)) {
      if (install && install.agencyId !== context.agencyId) continue;
      if (!install) {
        const scan = scanForSubject(rawValue, context);
        if (scan.mentioned) addCount(context.result.unclassifiedMatches, collection);
        if (scan.depthExceeded) addCount(context.result.depthLimitMatches, collection);
        continue;
      }
      if (context.result.work.recordsVisited >= MAX_SUBJECT_ACCESS_RECORDS) {
        addIncomplete(context.result, "record-limit");
        continue;
      }
      context.result.work.recordsVisited += 1;
      const record = asRecord(rawValue);
      const installOwnsSubject = typeof install.clientId === "string" && context.lineage.clientIds.has(install.clientId);
      const classification = record ? classifyOwnership(record, context) : null;
      let ownership: Ownership = classification?.ownership ?? "none";
      if (classification?.inspectionIncomplete) addCount(context.result.depthLimitMatches, collection);
      if (record && typeof record.agencyId === "string" && record.agencyId !== install.agencyId) ownership = "ambiguous";
      if (installOwnsSubject) {
        if (record) {
          const claims = extractTypedClaims(record, context);
          if ((typeof record.agencyId === "string" && record.agencyId !== install.agencyId)
            || setSome(claims.personIds, id => id !== context.person.id)
            || setSome(claims.clientIds, id => !context.lineage.clientIds.has(id))
            || setSome(claims.relationshipIds, id => !context.lineage.relationshipIds.has(id))
            || claims.depthUnknown) ownership = "ambiguous";
          else ownership = "authoritative";
        } else {
          addCount(context.result.unsupportedCollectionMatches, collection);
          continue;
        }
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
      if (install.pluginId !== "agency-finance" || !key.startsWith("invoices/by-id/")) {
        addCount(context.result.unsupportedCollectionMatches, collection);
        continue;
      }
      const projected = projectFinanceInvoice(record, context);
      const projectedReference: JsonRecord = {};
      projectSafeStringFields({ key }, projectedReference, ["key"], collection, context);
      addProjectedRecord(collection, {
        installId,
        pluginId: install.pluginId,
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

export function collectSubjectAccessExport(
  agencyId: string,
  personId: string,
  options: { generatedAt?: number; maxValues?: number } = {},
): SubjectAccessResult | null {
  const state = getState();
  const person = state.persons?.[personId];
  if (!person || person.agencyId !== agencyId) return null;
  const identifiers = partitionIdentifiers(state, agencyId, person);
  const lineage = deriveLineage(state, agencyId, person);
  const result: SubjectAccessResult = {
    subject: {
      personId,
      name: person.name,
      emails: identifiers.displayedEmails,
      phones: identifiers.displayedPhones,
      clientIds: [...lineage.clientIds].sort(),
      relationshipIds: [...lineage.relationshipIds].sort(),
      facetIds: [...lineage.facetIds].sort(),
    },
    generatedAt: options.generatedAt ?? Date.now(),
    found: {},
    searchedCollections: Object.keys(state as unknown as JsonRecord),
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
    work: { recordsVisited: 0, valuesVisited: 0, charactersInspected: 0, serializedBytes: 0 },
  };
  const context: ExportContext = {
    agencyId,
    person,
    identifiers,
    lineage,
    otherPersonNames: Object.values(state.persons ?? {})
      .filter(candidate => candidate.agencyId === agencyId && candidate.id !== person.id && candidate.name)
      .map(candidate => candidate.name!),
    subjectIdNeedles: [person.id, ...lineage.relationshipIds, ...lineage.facetIds].slice(0, 1_000),
    subjectEmailNeedles: [...identifiers.allSubjectEmails],
    subjectPhoneDigitNeedles: [...identifiers.allSubjectPhones].map(digitsOnly).filter(phone => phone.length >= 7),
    maxValues: Math.max(1, Math.min(MAX_SUBJECT_ACCESS_VALUES, Math.floor(options.maxValues ?? MAX_SUBJECT_ACCESS_VALUES))),
    result,
  };

  for (const [collection, rawCollection] of ownDataEntries(state as unknown as JsonRecord)) {
    if (collection === "pluginData") {
      inspectPluginData(state, context);
      continue;
    }
    if (rawCollection === null || typeof rawCollection !== "object") continue;
    const rows = ownDataEntries(rawCollection as object);
    for (const [, row] of rows) {
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
      statement: "Every resident collection was walked. Counted review items are not included in the automatic safe subset.",
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
