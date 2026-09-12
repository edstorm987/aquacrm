import "server-only";

// GDPR subject-access export. Selection is deliberately based on typed
// ownership fields, never on arbitrary recursive value equality. Every state
// collection is still walked: unknown subject-linked shapes are counted for
// review instead of disappearing from the completeness statement.

import { getState } from "@/server/storage";
import type { Person, PortalState } from "@/server/types";

export const SUBJECT_ACCESS_REQUIRED_SIDECARS = ["devTeamWorkspaceFiles"] as const;

export const MAX_SUBJECT_ACCESS_RECORDS = 50_000;
export const MAX_SUBJECT_ACCESS_VALUES = 500_000;
export const MAX_SUBJECT_ACCESS_CHARACTERS = 5_000_000;
export const MAX_SUBJECT_ACCESS_STRING_CHARACTERS = 100_000;
export const MAX_SUBJECT_ACCESS_EXPORT_BYTES = 1_000_000;

const MAX_SCOPE_DEPTH = 6;
const MAX_REVIEW_SCAN_DEPTH = 16;

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

function setIfDefined(out: JsonRecord, source: JsonRecord, key: string): void {
  if (source[key] !== undefined) out[key] = source[key];
}

function copyScalarFields(source: JsonRecord, fields: readonly string[]): JsonRecord {
  const out: JsonRecord = {};
  for (const field of fields) {
    const value = source[field];
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
      for (const raw of [entry.value, entry.raw]) {
        if (!raw) continue;
        const key = normaliseEmail(raw);
        let owners = emailOwners.get(key);
        if (!owners) emailOwners.set(key, owners = new Set());
        owners.add(candidate.id);
      }
    }
    for (const entry of candidate.phones ?? []) {
      for (const raw of [entry.value, entry.raw]) {
        if (!raw) continue;
        const key = digitsOnly(raw);
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
  const exclusiveEmails = new Set<string>();
  const exclusivePhones = new Set<string>();
  const ambiguousEmails = new Set<string>();
  const ambiguousPhones = new Set<string>();

  for (const entry of person.emails ?? []) {
    for (const raw of [entry.value, entry.raw]) {
      if (!raw) continue;
      const key = normaliseEmail(raw);
      allSubjectEmails.add(key);
      const owners = emailOwners.get(key);
      if (owners?.size === 1 && owners.has(person.id)) {
        exclusiveEmails.add(key);
        if (!displayedEmails.includes(raw)) displayedEmails.push(raw);
      } else {
        ambiguousEmails.add(key);
      }
    }
  }
  for (const entry of person.phones ?? []) {
    for (const raw of [entry.value, entry.raw]) {
      if (!raw) continue;
      const key = digitsOnly(raw);
      if (!key) continue;
      allSubjectPhones.add(key);
      const owners = phoneOwners.get(key);
      if (owners?.size === 1 && owners.has(person.id) && !sharedPhones.has(key)) {
        exclusivePhones.add(key);
        if (!displayedPhones.includes(raw)) displayedPhones.push(raw);
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
  const clientIds = new Set<string>(person.facets?.clientIds ?? []);
  const conflictingClientIds = new Set<string>();
  const relationshipIds = new Set<string>();
  const facetIds = new Set<string>();
  if (person.relationshipId) relationshipIds.add(person.relationshipId);
  for (const value of [person.facets?.leadId, person.facets?.contactId, ...(person.facets?.enquiryIds ?? [])]) {
    if (value) facetIds.add(value);
  }

  for (const client of Object.values(state.clients ?? {})) {
    if (client.agencyId !== agencyId) continue;
    if (client.personId === person.id || clientIds.has(client.id)) {
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

interface TypedClaims {
  personIds: string[];
  clientIds: string[];
  relationshipIds: string[];
  depthUnknown: boolean;
}

function extractTypedClaims(record: JsonRecord): TypedClaims {
  const claims: TypedClaims = { personIds: [], clientIds: [], relationshipIds: [], depthUnknown: false };
  const add = (list: string[], value: unknown) => {
    if (typeof value === "string" && value && !list.includes(value)) list.push(value);
  };

  for (const key of ["personId", "ownerPersonId", "subjectPersonId"]) add(claims.personIds, record[key]);
  for (const key of ["clientId", "ownerClientId", "subjectClientId"]) add(claims.clientIds, record[key]);
  add(claims.relationshipIds, record.relationshipId);

  const stack: Array<{ value: unknown; depth: number }> = [
    { value: record.scope, depth: 0 },
    { value: record.owner, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (value === undefined || value === null) continue;
    if (depth > MAX_SCOPE_DEPTH) {
      claims.depthUnknown = true;
      continue;
    }
    if (typeof value !== "object") continue;
    if (seen.has(value as object)) continue;
    seen.add(value as object);
    if (Array.isArray(value)) {
      for (const entry of value) stack.push({ value: entry, depth: depth + 1 });
      continue;
    }
    const row = value as JsonRecord;
    for (const key of ["personId", "ownerPersonId", "subjectPersonId"]) add(claims.personIds, row[key]);
    for (const key of ["clientId", "ownerClientId", "subjectClientId"]) add(claims.clientIds, row[key]);
    add(claims.relationshipIds, row.relationshipId);
    const kind = row.kind ?? row.type;
    if (kind === "person") add(claims.personIds, row.id);
    if (kind === "client") add(claims.clientIds, row.id);
    if (kind === "relationship") add(claims.relationshipIds, row.id);
    for (const child of Object.values(row)) {
      if (child !== null && typeof child === "object") stack.push({ value: child, depth: depth + 1 });
    }
  }
  return claims;
}

interface ScanResult {
  mentioned: boolean;
  depthExceeded: boolean;
}

interface ExportContext {
  agencyId: string;
  person: Person;
  identifiers: IdentifierPartition;
  lineage: SubjectLineage;
  otherPersonNames: string[];
  result: SubjectAccessResult;
}

function scanForSubject(value: unknown, context: ExportContext): ScanResult {
  let mentioned = false;
  let depthExceeded = false;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  const idNeedles = [
    context.person.id,
    ...context.lineage.relationshipIds,
    ...context.lineage.facetIds,
  ].slice(0, 1_000);
  while (stack.length) {
    const current = stack.pop()!;
    context.result.work.valuesVisited += 1;
    if (context.result.work.valuesVisited > MAX_SUBJECT_ACCESS_VALUES) {
      addIncomplete(context.result, "value-limit");
      break;
    }
    if (current.depth > MAX_REVIEW_SCAN_DEPTH) {
      depthExceeded = true;
      continue;
    }
    if (typeof current.value === "string") {
      const raw = current.value;
      context.result.work.charactersInspected += raw.length;
      if (raw.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) {
        addIncomplete(context.result, "string-limit");
        continue;
      }
      if (context.result.work.charactersInspected > MAX_SUBJECT_ACCESS_CHARACTERS) {
        addIncomplete(context.result, "character-limit");
        continue;
      }
      if (idNeedles.some(needle => raw.includes(needle))) mentioned = true;
      const lower = raw.toLowerCase();
      if ([...context.identifiers.allSubjectEmails].some(email => lower.includes(email))) mentioned = true;
      const digits = digitsOnly(raw);
      if (digits.length >= 7 && [...context.identifiers.allSubjectPhones].some(phone => phone.length >= 7 && digits.includes(phone))) mentioned = true;
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    if (seen.has(current.value as object)) continue;
    seen.add(current.value as object);
    for (const child of Array.isArray(current.value) ? current.value : Object.values(current.value as JsonRecord)) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return { mentioned, depthExceeded };
}

type Ownership = "authoritative" | "ambiguous" | "unclassified" | "none";

function contactOwnership(record: JsonRecord, context: ExportContext): "exclusive" | "ambiguous" | "none" {
  const emails: string[] = [];
  const phones: string[] = [];
  const addString = (target: string[], value: unknown) => {
    if (typeof value === "string") target.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") target.push(item);
        else if (asRecord(item) && typeof asRecord(item)!.value === "string") target.push(asRecord(item)!.value as string);
      }
    }
  };
  addString(emails, record.email);
  addString(phones, record.phone);
  const contact = asRecord(record.contact);
  if (contact) {
    addString(emails, contact.email);
    addString(emails, contact.emailAddress);
    addString(emails, contact.emails);
    addString(phones, contact.phone);
    addString(phones, contact.phoneNumber);
    addString(phones, contact.phones);
  }
  let exclusive = false;
  let ambiguous = false;
  for (const email of emails) {
    const key = normaliseEmail(email);
    if (context.identifiers.exclusiveEmails.has(key)) exclusive = true;
    if (context.identifiers.ambiguousEmails.has(key)) ambiguous = true;
  }
  for (const phone of phones) {
    const key = digitsOnly(phone);
    if (context.identifiers.exclusivePhones.has(key)) exclusive = true;
    if (context.identifiers.ambiguousPhones.has(key)) ambiguous = true;
  }
  return ambiguous ? "ambiguous" : exclusive ? "exclusive" : "none";
}

function classifyOwnership(record: JsonRecord, context: ExportContext): Ownership {
  const claims = extractTypedClaims(record);
  const personConflict = claims.personIds.some(id => id !== context.person.id);
  const clientConflict = claims.clientIds.some(id => !context.lineage.clientIds.has(id));
  const relationshipConflict = claims.relationshipIds.some(id => !context.lineage.relationshipIds.has(id));
  const typedConflict = personConflict || clientConflict || relationshipConflict;
  const contact = contactOwnership(record, context);
  const id = typeof record.id === "string" ? record.id : undefined;
  const typedMatch = claims.personIds.includes(context.person.id)
    || claims.clientIds.some(clientId => context.lineage.clientIds.has(clientId))
    || claims.relationshipIds.some(relationshipId => context.lineage.relationshipIds.has(relationshipId));
  const recordIdMatch = id === context.person.id
    || (id !== undefined && context.lineage.clientIds.has(id))
    || (id !== undefined && context.lineage.facetIds.has(id));

  // A stronger, explicit ownership claim always vetoes a weak contact match,
  // including stale/missing ids. An uninspectable nested scope also vetoes it.
  if ((typedConflict || claims.depthUnknown) && (typedMatch || recordIdMatch || contact !== "none")) return "ambiguous";
  if (typedConflict && claims.clientIds.some(idValue => context.lineage.conflictingClientIds.has(idValue))) return "ambiguous";
  if (typedMatch || recordIdMatch) return "authoritative";
  if (contact === "ambiguous") return "ambiguous";
  if (contact === "exclusive") return "authoritative";
  return scanForSubject(record, context).mentioned ? "unclassified" : "none";
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
  for (const [key, value] of Object.entries(record)) {
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
    const projected = copyScalarFields(item, ["value", "raw", "isPrimary"]);
    if (item.label !== undefined) noteOmitted(collection, item.label, context, { coMingled: true });
    return [projected];
  });
  out.phones = (Array.isArray(record.phones) ? record.phones : []).flatMap(entry => {
    const item = asRecord(entry);
    if (!item || typeof item.value !== "string") return [];
    if (!context.identifiers.exclusivePhones.has(digitsOnly(item.value))) {
      noteOmitted(collection, item, context, { coMingled: true });
      return [];
    }
    const projected = copyScalarFields(item, ["value", "raw", "isPrimary", "shared"]);
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
  for (const field of ["notes", "record", "customFields"] as const) {
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
    "id", "agencyId", "relationshipId", "personId", "workspaceLabel", "companyId", "name", "slug", "stage",
    "websiteUrl", "status", "createdAt", "updatedAt",
  ]);
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
      out[key] = context.identifiers.exclusivePhones.has(digitsOnly(value)) ? value : "[redacted:third-party-phone]";
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
    "relationshipId", "status", "priority", "startAt", "dueAt", "reminderAt", "seriesId", "origin", "sourceId",
    "sourceHref", "acceptedAt", "revision", "clientBoardColumn", "clientBoardOrder", "createdAt", "updatedAt", "completedAt",
  ]);
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

function projectSubjectRequest(record: JsonRecord, context: ExportContext): JsonRecord {
  const collection = "subjectRequests";
  const allowed = new Set([
    "id", "agencyId", "kind", "subjectLabel", "personId", "receivedAt", "dueAt", "extendedAt", "extensionReason",
    "identityVerifiedAt", "identityVerifiedBy", "fulfilledAt", "fulfilledBy", "outcome", "refusedAt", "refusalReason",
    "createdBy", "preparedExportAt", "preparedExportBy", "preparedExportDigest", "preparedExportGeneratedAt",
    "preparedExportRecordCount", "preparedExportReviewCount", "preparedExportByteLength", "preparedExportJson", "preparedExportReviewResolvedAt",
    "preparedExportReviewResolvedBy", "preparedExportReviewResolvedDigest", "preparedExportReviewEvidenceId", "deliveredAt",
    "deliveredBy", "deliveryMethod", "deliveryEvidenceId",
  ]);
  noteUnknownFields(collection, record, allowed, context);
  const out = copyScalarFields(record, [
    "id", "agencyId", "kind", "personId", "receivedAt", "dueAt", "extendedAt", "identityVerifiedAt", "fulfilledAt",
    "refusedAt",
  ]);
  if (typeof record.subjectLabel === "string") {
    const label = record.subjectLabel;
    if (label === context.person.name || context.identifiers.exclusiveEmails.has(normaliseEmail(label)) || context.identifiers.exclusivePhones.has(digitsOnly(label))) {
      out.subjectLabel = label;
    } else noteOmitted(collection, label, context, { coMingled: true });
  }
  for (const field of ["extensionReason", "outcome", "refusalReason"] as const) {
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
  "id", "agencyId", "clientId", "sourceType", "sourceId", "group", "occurredAt", "eyebrow", "visibility", "href",
  "attention", "parentSourceId", "createdAt", "updatedAt",
] as const;

function textHasRestrictedPii(value: string, context: ExportContext): boolean {
  if (value.length > MAX_SUBJECT_ACCESS_STRING_CHARACTERS) return true;
  const lower = value.toLowerCase();
  const labels = ["national insurance", "nationalinsurance", "nino", "ni number", "ni:", "bank account", "account number", "sort code", "iban", "swift", "routing number"];
  if (labels.some(label => lower.includes(label))) return true;
  if (context.otherPersonNames.some(name => name && lower.includes(name.toLowerCase()))) return true;
  const digits = digitsOnly(value);
  for (const phone of context.identifiers.ambiguousPhones) {
    if (phone.length >= 7 && digits.includes(phone)) return true;
  }
  for (const email of context.identifiers.ambiguousEmails) {
    if (lower.includes(email)) return true;
  }
  return false;
}

function projectLedger(record: JsonRecord, context: ExportContext): JsonRecord | null {
  const collection = "clientRecordLedger";
  if (record.sourceType !== "invoice" && record.sourceType !== "payment-plan") {
    addCount(context.result.unsupportedCollectionMatches, collection);
    return null;
  }
  const allowed = new Set([...LEDGER_SCALAR_FIELDS, "title", "body"]);
  noteUnknownFields(collection, record, allowed, context);
  const title = typeof record.title === "string" ? record.title : "";
  const body = typeof record.body === "string" ? record.body : undefined;
  if (textHasRestrictedPii(title, context) || (body !== undefined && textHasRestrictedPii(body, context))) {
    addCount(context.result.coMingledPiiMatches, collection);
    return null;
  }
  const out = copyScalarFields(record, LEDGER_SCALAR_FIELDS);
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
  "id", "agencyId", "companyId", "clientId", "number", "issuedAt", "dueAt", "subtotalCents", "taxCents", "totalCents",
  "currency", "status", "externalRef", "paidAt", "paidVia", "createdAt", "updatedAt",
] as const;

function projectFinanceInvoice(record: JsonRecord, context: ExportContext): JsonRecord {
  const allowed = new Set([...INVOICE_FIELDS, "lineItems", "notes", "issuerSnapshot"]);
  noteUnknownFields("pluginData", record, allowed, context);
  const out = copyScalarFields(record, INVOICE_FIELDS);
  for (const field of ["lineItems", "notes", "issuerSnapshot"] as const) {
    if (record[field] !== undefined) noteOmitted("pluginData", record[field], context, { coMingled: true });
  }
  return out;
}

const PLUGIN_MACHINE_FIELDS = new Set([
  "id", "agencyId", "clientId", "personId", "relationshipId", "status", "state", "kind", "type", "sourceId", "createdAt",
  "updatedAt", "startedAt", "completedAt", "occurredAt", "issuedAt", "dueAt", "amountCents", "subtotalCents", "taxCents",
  "totalCents", "currency", "enabled", "revision",
]);

function projectPluginMachineRecord(record: JsonRecord, context: ExportContext): JsonRecord {
  const out = copyScalarFields(record, [...PLUGIN_MACHINE_FIELDS]);
  noteUnknownFields("pluginData", record, PLUGIN_MACHINE_FIELDS, context);
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

function agencyOf(record: JsonRecord): string | undefined {
  return typeof record.agencyId === "string" ? record.agencyId : undefined;
}

function inspectRecord(collection: string, value: unknown, context: ExportContext): void {
  context.result.work.recordsVisited += 1;
  if (context.result.work.recordsVisited > MAX_SUBJECT_ACCESS_RECORDS) {
    addIncomplete(context.result, "record-limit");
    return;
  }
  const record = asRecord(value);
  if (!record) {
    const scan = scanForSubject(value, context);
    if (scan.mentioned) addCount(context.result.unclassifiedMatches, collection);
    if (scan.depthExceeded) addCount(context.result.depthLimitMatches, collection);
    return;
  }
  const ownership = classifyOwnership(record, context);
  if (ownership === "none") return;
  const ownerAgency = agencyOf(record);
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
  if (projected) {
    (context.result.found[collection] ??= []).push(projected);
    context.result.totalRecords += 1;
  }
}

function inspectPluginData(state: PortalState, context: ExportContext): void {
  const collection = "pluginData";
  const installs = state.pluginInstalls ?? {};
  for (const [installId, values] of Object.entries(state.pluginData ?? {})) {
    const install = installs[installId];
    for (const [key, rawValue] of Object.entries(values ?? {})) {
      context.result.work.recordsVisited += 1;
      if (context.result.work.recordsVisited > MAX_SUBJECT_ACCESS_RECORDS) {
        addIncomplete(context.result, "record-limit");
        continue;
      }
      if (!install || install.agencyId !== context.agencyId) {
        const scan = scanForSubject(rawValue, context);
        if (scan.mentioned) addCount(context.result.unclassifiedMatches, collection);
        if (scan.depthExceeded) addCount(context.result.depthLimitMatches, collection);
        continue;
      }
      const record = asRecord(rawValue);
      const installOwnsSubject = typeof install.clientId === "string" && context.lineage.clientIds.has(install.clientId);
      let ownership: Ownership = record ? classifyOwnership(record, context) : "none";
      if (installOwnsSubject) {
        if (record) {
          const claims = extractTypedClaims(record);
          if (claims.personIds.some(id => id !== context.person.id)
            || claims.clientIds.some(id => !context.lineage.clientIds.has(id))
            || claims.relationshipIds.some(id => !context.lineage.relationshipIds.has(id))
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
      let projected: JsonRecord;
      if (install.pluginId === "agency-finance" && key.startsWith("invoices/by-id/")) {
        projected = projectFinanceInvoice(record, context);
      } else {
        projected = projectPluginMachineRecord(record, context);
      }
      (context.result.found[collection] ??= []).push({
        installId,
        pluginId: install.pluginId,
        key,
        value: projected,
      });
      context.result.totalRecords += 1;
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
  options: { generatedAt?: number } = {},
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
    work: { recordsVisited: 0, valuesVisited: 0, charactersInspected: 0 },
  };
  const context: ExportContext = {
    agencyId,
    person,
    identifiers,
    lineage,
    otherPersonNames: Object.values(state.persons ?? {})
      .filter(candidate => candidate.agencyId === agencyId && candidate.id !== person.id && candidate.name)
      .map(candidate => candidate.name!),
    result,
  };

  for (const [collection, rawCollection] of Object.entries(state as unknown as JsonRecord)) {
    if (collection === "pluginData") {
      inspectPluginData(state, context);
      continue;
    }
    if (rawCollection === null || typeof rawCollection !== "object") continue;
    const rows = Array.isArray(rawCollection) ? rawCollection : Object.values(rawCollection as JsonRecord);
    for (const row of rows) inspectRecord(collection, row, context);
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
