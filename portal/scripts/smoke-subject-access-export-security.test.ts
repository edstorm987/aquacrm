// Subject-access export security and recovery.
//
// These are adversarial invariants, not examples of a happy-path search:
// arbitrary strings and actor/assignee references never become ownership;
// typed client/person lineage remains complete; co-mingled PII is either
// redacted deterministically or withheld for review; and a request is not
// fulfilled unless the export and its activity evidence commit together.

const DSAR_KEY_A = Buffer.from("subject-access-integrity-key-a1!!", "utf8").toString("base64url");
const DSAR_KEY_B = Buffer.from("subject-access-integrity-key-b2!!", "utf8").toString("base64url");
const DSAR_KEY_C = Buffer.from("subject-access-integrity-key-c3!!", "utf8").toString("base64url");

process.env.PORTAL_BACKEND = "memory";
process.env.NODE_ENV = "test";
process.env.PORTAL_SESSION_SECRET = "subject-access-export-security-smoke-secret";
process.env.PORTAL_DSAR_INTEGRITY_KEY = DSAR_KEY_A;
delete process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY;

import { withRequestScope, withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

const storageId = require.resolve("../src/server/storage");
const realStorage = require("../src/server/storage") as typeof import("../src/server/storage");
let failNextCommit = false;
require.cache[storageId]!.exports = {
  ...realStorage,
  withAtomicPortalStateMutation<T>(
    operation: () => T | Promise<T>,
    options: { beforeCommit?: () => void | Promise<void> } = {},
  ): Promise<T> {
    return realStorage.withAtomicPortalStateMutation(operation, {
      ...options,
      beforeCommit: async () => {
        await options.beforeCommit?.();
        if (failNextCommit) {
          failNextCommit = false;
          throw new Error("injected_subject_access_commit_failure");
        }
      },
    });
  },
};

const route = require("../src/app/api/portal/governance/subject-access/route") as typeof import("../src/app/api/portal/governance/subject-access/route");
const auth = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const csrf = require("../src/lib/server/auth/csrf") as typeof import("../src/lib/server/auth/csrf");
const exportsApi = require("../src/lib/server/compliance/subjectAccessExport") as typeof import("../src/lib/server/compliance/subjectAccessExport");
const requests = require("../src/lib/server/compliance/subjectRequests") as typeof import("../src/lib/server/compliance/subjectRequests");
const tenants = require("../src/server/tenants") as typeof import("../src/server/tenants");
const users = require("../src/server/users") as typeof import("../src/server/users");
const activity = require("../src/server/activity") as typeof import("../src/server/activity");
const { NextRequest } = require("next/server") as typeof import("next/server");
import type { Client, Person, PortalState, SubjectRequest } from "../src/server/types";

const SUBJECT_EMAIL = "subject@example.test";
const SHARED_EMAIL = "shared@example.test";
const SUBJECT_PHONE = "+44 7700 900123";
const THIRD_PARTY_EMAIL = "mallory@example.test";
const THIRD_PARTY_PHONE = "+44 7700 911999";
const THIRD_PARTY_NAME = "Mallory Otherperson";
const THIRD_PARTY_ADDRESS = "17 Outsider Road";
const THIRD_PARTY_POSTCODE = "ZZ1 9ZZ";

interface World {
  agencyId: string;
  otherAgencyId: string;
  ownerId: string;
  token: string;
  personId: string;
  otherPersonId: string;
}

let sequence = 0;

function putPerson(person: Person): void {
  realStorage.mutate(state => {
    state.persons[person.id] = person;
  });
}

function personFixture(input: {
  id: string;
  agencyId: string;
  name: string;
  emails: string[];
  phones: Array<{ value: string; shared?: boolean }>;
  facets?: Person["facets"];
  relationshipId?: string;
}): Person {
  const now = Date.now();
  return {
    id: input.id,
    agencyId: input.agencyId,
    name: input.name,
    emails: input.emails.map(value => ({ value, raw: value })),
    phones: input.phones.map(entry => ({ value: entry.value, raw: entry.value, shared: entry.shared })),
    organisationLinks: [],
    classification: "existing-client",
    classificationHistory: [],
    facets: input.facets ?? {},
    relationshipId: input.relationshipId,
    createdAt: now,
    updatedAt: now,
  };
}

function putClient(client: Client): void {
  realStorage.mutate(state => {
    state.clients[client.id] = client;
  });
}

function clientFixture(input: {
  id: string;
  agencyId: string;
  personId?: string;
  relationshipId: string;
  name: string;
}): Client {
  const now = Date.now();
  return {
    id: input.id,
    agencyId: input.agencyId,
    personId: input.personId,
    relationshipId: input.relationshipId,
    name: input.name,
    slug: input.id,
    brand: { primaryColor: "#0B6F6D" },
    stage: "live",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

async function seedWorld(): Promise<World> {
  await realStorage.reset();
  sequence += 1;
  const agency = tenants.createAgency({ name: `DSAR agency ${sequence}`, slug: `dsar-agency-${sequence}` });
  const otherAgency = tenants.createAgency({ name: `Other DSAR agency ${sequence}`, slug: `other-dsar-agency-${sequence}` });
  const owner = users.createUser({
    email: `dsar-owner-${sequence}@example.test`,
    password: "Subject-access-1!",
    role: "agency-owner",
    agencyId: agency.id,
  });
  const personId = `per_subject_${sequence}`;
  const otherPersonId = `per_other_${sequence}`;
  putPerson(personFixture({
    id: personId,
    agencyId: agency.id,
    name: "Subject Person",
    emails: [SUBJECT_EMAIL, SHARED_EMAIL],
    phones: [{ value: SUBJECT_PHONE }],
    facets: { leadId: `lead_subject_${sequence}`, clientIds: [`client_primary_${sequence}`] },
    relationshipId: `relationship_subject_${sequence}`,
  }));
  putPerson(personFixture({
    id: otherPersonId,
    agencyId: agency.id,
    name: THIRD_PARTY_NAME,
    emails: [SHARED_EMAIL],
    phones: [{ value: SUBJECT_PHONE }],
  }));
  const token = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  return {
    agencyId: agency.id,
    otherAgencyId: otherAgency.id,
    ownerId: owner.id,
    token,
    personId,
    otherPersonId,
  };
}

function storeRows(collection: keyof PortalState, rows: Record<string, Record<string, unknown>>): void {
  realStorage.mutate(state => {
    const target = state[collection] as unknown as Record<string, unknown>;
    for (const [id, row] of Object.entries(rows)) target[id] = row;
  });
}

function signedMutationHeaders(): Record<string, string> {
  const signed = csrf.signCsrfToken().token;
  return {
    "content-type": "application/json",
    "x-csrf-token": signed,
    cookie: `${csrf.CSRF_COOKIE_NAME}=${signed}`,
  };
}

function post(token: string, body: unknown, raw = false): Promise<Response> {
  return withSession(token, () => route.POST(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: signedMutationHeaders(),
    body: raw ? String(body) : JSON.stringify(body),
  })));
}

function put(token: string, body: unknown): Promise<Response> {
  return withSession(token, () => route.PUT(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "PUT",
    headers: signedMutationHeaders(),
    body: JSON.stringify(body),
  })));
}

function patch(token: string, body: unknown): Promise<Response> {
  return withSession(token, () => route.PATCH(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "PATCH",
    headers: signedMutationHeaders(),
    body: JSON.stringify(body),
  })));
}

function assertNoStore(response: Response): void {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
}

function makeRequest(
  world: World,
  input: { agencyId?: string; personId?: string; kind?: SubjectRequest["kind"]; verify?: boolean },
): SubjectRequest {
  const request = requests.recordSubjectRequest({
    agencyId: input.agencyId ?? world.agencyId,
    kind: input.kind ?? "access",
    subjectLabel: SUBJECT_EMAIL,
    personId: input.personId ?? world.personId,
    createdBy: world.ownerId,
  });
  if (input.verify) requests.verifySubjectRequestIdentity(request.agencyId, request.id, world.ownerId);
  return request;
}

beforeEach(() => {
  failNextCommit = false;
  process.env.PORTAL_DSAR_INTEGRITY_KEY = DSAR_KEY_A;
  delete process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY;
});

test("only typed exclusive ownership authorises rows; client facets and relationships remain complete", async () => {
  const world = await seedWorld();
  const relationshipId = `relationship_subject_${sequence}`;
  const primaryClientId = `client_primary_${sequence}`;
  const siblingClientId = `client_sibling_${sequence}`;
  const conflictingClientId = `client_conflict_${sequence}`;
  putClient(clientFixture({
    id: primaryClientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId,
    name: "Subject Person",
  }));
  putClient(clientFixture({
    id: siblingClientId,
    agencyId: world.agencyId,
    relationshipId,
    name: "Subject Person",
  }));
  putClient(clientFixture({
    id: conflictingClientId,
    agencyId: world.agencyId,
    personId: world.otherPersonId,
    relationshipId,
    name: THIRD_PARTY_NAME,
  }));

  storeRows("tasks", {
    mention_id: { id: "mention_id", agencyId: world.agencyId, notes: `Talk about ${world.personId}` },
    mention_email: { id: "mention_email", agencyId: world.agencyId, notes: `Mail ${SUBJECT_EMAIL}` },
    mention_phone: { id: "mention_phone", agencyId: world.agencyId, notes: `Call ${SUBJECT_PHONE}` },
    assignee_only: { id: "assignee_only", agencyId: world.agencyId, assignee: { personId: world.personId } },
    actor_only: { id: "actor_only", agencyId: world.agencyId, actorPersonId: world.personId },
    unique_contact: { id: "unique_contact", agencyId: world.agencyId, contact: { email: SUBJECT_EMAIL } },
    shared_email: { id: "shared_email", agencyId: world.agencyId, contact: { email: SHARED_EMAIL } },
    shared_phone: { id: "shared_phone", agencyId: world.agencyId, contact: { phone: SUBJECT_PHONE } },
    client_facet: { id: "client_facet", agencyId: world.agencyId, clientId: primaryClientId },
    client_relationship: { id: "client_relationship", agencyId: world.agencyId, clientId: siblingClientId },
    relationship_direct: { id: "relationship_direct", agencyId: world.agencyId, relationshipId },
    facet_direct: { id: `lead_subject_${sequence}`, agencyId: world.agencyId },
    conflicting_client: { id: "conflicting_client", agencyId: world.agencyId, clientId: conflictingClientId },
    other_tenant: { id: "other_tenant", agencyId: world.otherAgencyId, personId: world.personId },
    unscoped: { id: "unscoped", personId: world.personId },
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId);
  assert.ok(result);
  const taskIds = (result.found.tasks ?? []).map(row => (row as { id: string }).id);
  assert.deepEqual(
    ["unique_contact", "client_facet", "client_relationship", "relationship_direct", `lead_subject_${sequence}`]
      .every(id => taskIds.includes(id)),
    true,
    "exclusive contact and exact client/relationship/facet lineage remain complete",
  );
  for (const id of ["mention_id", "mention_email", "mention_phone", "assignee_only", "actor_only", "shared_email", "shared_phone", "conflicting_client", "other_tenant", "unscoped"]) {
    assert.ok(!taskIds.includes(id), `${id} must not be automatically released`);
  }
  assert.equal(result.unclassifiedMatches.tasks, 5, "free text, actor and assignee mentions are review-only");
  assert.equal(result.ambiguousMatches.tasks, 3, "shared identifiers and conflicting lineage are review-only");
  assert.equal(result.unscopedMatches.tasks, 1);
  assert.equal(result.found.clients?.length, 2, "the exact client facet and its relationship sibling are included");
  assert.equal(result.ambiguousMatches.clients, 1, "a relationship row with a contradictory person is surfaced");
  assert.deepEqual([...new Set(result.subject.emails)], [SUBJECT_EMAIL], "only exclusive subject emails enter the header");
  assert.deepEqual(result.subject.phones, [], "a phone shared with another person cannot enter the header");
  const json = exportsApi.subjectAccessExportJson(result);
  assert.equal(json.includes(SHARED_EMAIL), false);
  assert.equal(json.includes(SUBJECT_PHONE), false);
  assert.deepEqual(result.searchedCollections.sort(), Object.keys(realStorage.getState()).sort(), "every collection is walked");
  assert.match(json, /Descriptor-backed object collections were inspected/, "the completeness wording describes only collections that were safely inspected");
});

test("stale root owners and conflicting nested scopes veto otherwise exclusive contact authority", async () => {
  const world = await seedWorld();
  const poisonedFacetClientId = `client_poisoned_facet_${sequence}`;
  putClient(clientFixture({
    id: poisonedFacetClientId,
    agencyId: world.agencyId,
    personId: world.otherPersonId,
    relationshipId: `relationship_poisoned_${sequence}`,
    name: THIRD_PARTY_NAME,
  }));
  realStorage.mutate(state => {
    state.persons[world.personId].facets.clientIds = [
      ...(state.persons[world.personId].facets.clientIds ?? []),
      poisonedFacetClientId,
    ];
  });
  storeRows("tasks", {
    stale_person_owner: {
      id: "stale_person_owner",
      agencyId: world.agencyId,
      personId: "per_deleted_owner",
      contact: { email: SUBJECT_EMAIL },
    },
    stale_client_owner: {
      id: "stale_client_owner",
      agencyId: world.agencyId,
      ownerClientId: "client_deleted_owner",
      contact: { email: SUBJECT_EMAIL },
    },
    nested_scope_conflict: {
      id: "nested_scope_conflict",
      agencyId: world.agencyId,
      contact: { email: SUBJECT_EMAIL },
      scope: { envelope: { access: { owner: { kind: "person", id: world.otherPersonId } } } },
    },
    nested_scope_match: {
      id: "nested_scope_match",
      agencyId: world.agencyId,
      scope: { envelope: { access: { subject: { kind: "person", id: world.personId } } } },
    },
    poisoned_facet_contact: {
      id: "poisoned_facet_contact",
      agencyId: world.agencyId,
      clientId: poisonedFacetClientId,
      contact: { email: SUBJECT_EMAIL },
    },
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const ids = (result.found.tasks ?? []).map(row => (row as { id: string }).id);
  assert.deepEqual(ids.includes("nested_scope_match"), true);
  for (const id of ["stale_person_owner", "stale_client_owner", "nested_scope_conflict", "poisoned_facet_contact"]) {
    assert.equal(ids.includes(id), false, `${id} must be quarantined despite the subject's exclusive email`);
  }
  assert.ok(result.ambiguousMatches.tasks >= 4);
});

test("canonical phone equivalence and typed owners at arbitrary valid depth work without executing getters", async () => {
  const world = await seedWorld();
  let getterCalls = 0;
  realStorage.mutate(state => {
    state.persons[world.personId].phones = [{ value: "07700 900123", raw: "07700 900123" }];
    state.persons[world.otherPersonId].phones = [{ value: THIRD_PARTY_PHONE, raw: THIRD_PARTY_PHONE }];
    const poisonedEnvelope: Record<string, unknown> = {
      safe: { nested: { ownerClaim: { subjectPersonId: world.personId } } },
    };
    Object.defineProperty(poisonedEnvelope, "computedOwner", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("stored accessors must never execute during an export");
      },
    });
    state.tasks.canonical_phone = {
      id: "canonical_phone",
      agencyId: world.agencyId,
      contact: { phone: "+447700900123" },
    } as never;
    state.tasks.deep_owner_claim = {
      id: "deep_owner_claim",
      agencyId: world.agencyId,
      metadata: { arbitrary: { valid: { owner: { personId: world.personId } } } },
    } as never;
    state.tasks.poisoned_owner_claim = {
      id: "poisoned_owner_claim",
      agencyId: world.agencyId,
      metadata: poisonedEnvelope,
    } as never;
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const ids = (result.found.tasks ?? []).map(row => (row as { id: string }).id);
  assert.ok(ids.includes("canonical_phone"), "UK local and E.164 forms use the canonical phone matcher");
  assert.ok(ids.includes("deep_owner_claim"), "typed ownership is not restricted to root scope/owner keys");
  assert.equal(ids.includes("poisoned_owner_claim"), false, "an accessor makes the otherwise matching row review-only");
  assert.equal(getterCalls, 0, "neither ownership extraction nor review scanning may invoke stored getters");
  assert.ok(result.ambiguousMatches.tasks >= 1);
});

test("stored accessors in subjects, identifiers, rows and root collections never execute and force explicit incompleteness", async () => {
  const world = await seedWorld();
  let getterCalls = 0;
  const poison = () => {
    getterCalls += 1;
    throw new Error("subject access export executed a stored accessor");
  };
  realStorage.mutate(state => {
    const subject = state.persons[world.personId] as unknown as Record<string, unknown>;
    Object.defineProperty(subject, "name", { configurable: true, enumerable: true, get: poison });
    Object.defineProperty(subject, "facets", { configurable: true, enumerable: true, get: poison });
    Object.defineProperty(subject, "emails", { configurable: true, enumerable: true, get: poison });
    const other = state.persons[world.otherPersonId] as unknown as Record<string, unknown>;
    Object.defineProperty(other, "id", { configurable: true, enumerable: true, get: poison });
    const otherEmail = (other.emails as Array<Record<string, unknown>>)[0];
    Object.defineProperty(otherEmail, "value", { configurable: true, enumerable: true, get: poison });
    const clientId = `accessor_lineage_client_${sequence}`;
    state.clients[clientId] = clientFixture({
      id: clientId,
      agencyId: world.agencyId,
      personId: world.personId,
      relationshipId: `accessor_lineage_relationship_${sequence}`,
      name: "Subject Person",
    });
    Object.defineProperty(state.clients[clientId], "personId", {
      configurable: true, enumerable: true, get: poison,
    });
    const nested: Record<string, unknown> = { subjectPersonId: world.personId };
    Object.defineProperty(nested, "computed", { configurable: true, enumerable: true, get: poison });
    state.tasks.poisoned_projector = {
      id: "poisoned_projector", agencyId: world.agencyId, personId: world.personId, metadata: nested,
    } as never;
    Object.defineProperty(state.tasks.poisoned_projector, "status", {
      configurable: true, enumerable: true, get: poison,
    });
    Object.defineProperty(state.tasks, "poisoned_collection_row", {
      configurable: true, enumerable: true, get: poison,
    });
    Object.defineProperty(state, "dashboardWeekPlans", {
      configurable: true, enumerable: true, get: poison,
    });
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.equal(getterCalls, 0, "descriptor-only traversal must not execute any stored getter");
  assert.ok(result.incompleteReasons.includes("accessor-value"));
  assert.ok((result.omittedFields.persons ?? 0) > 0);
  assert.ok((result.omittedFields.tasks ?? 0) > 0);
  assert.ok((result.omittedFields.portalState ?? 0) > 0);
  assert.equal(result.searchedCollections.includes("dashboardWeekPlans"), false, "an accessor collection was not searched");
  assert.equal(result.searchedCollections.includes("tasks"), true, "the data-backed portion of tasks was inspected but remains incomplete");
  assert.throws(
    () => exportsApi.subjectAccessExportJson(result),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
    "an accessor-bearing resident state cannot claim automatic safe-subset completeness",
  );
});

test("hostile subject and collection identifiers are never emitted as an uninspected string", async () => {
  const world = await seedWorld();
  const hostilePersonId = `person:${THIRD_PARTY_EMAIL}`;
  const hostileCollection = `collection:${THIRD_PARTY_EMAIL}`;
  realStorage.mutate(state => {
    const person = state.persons[world.personId];
    delete state.persons[world.personId];
    person.id = hostilePersonId;
    state.persons[hostilePersonId] = person;
    (state as unknown as Record<string, unknown>)[hostileCollection] = {
      hostile: { id: "hostile", agencyId: world.agencyId, personId: hostilePersonId },
    };
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, hostilePersonId)!;
  assert.equal(result.subject.personId, "[redacted:restricted-identifier]");
  assert.equal(result.searchedCollections.includes(hostileCollection), false);
  assert.ok(result.incompleteReasons.includes("invalid-stored-value"));
  assert.throws(
    () => exportsApi.subjectAccessExportJson(result),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("third-party fields are redacted while free text and depth-limit rows are quarantined", async () => {
  const world = await seedWorld();
  let tooDeep: Record<string, unknown> = { leaf: "opaque" };
  for (let i = 0; i < 15; i += 1) tooDeep = { next: tooDeep };
  const createdAt = 1_725_555_000_123;
  storeRows("tasks", {
    safe_redaction: {
      id: "safe_redaction_7700900123",
      agencyId: world.agencyId,
      personId: world.personId,
      createdAt,
      updatedAt: createdAt + 1,
      contact: {
        name: THIRD_PARTY_NAME,
        email: THIRD_PARTY_EMAIL,
        phone: THIRD_PARTY_PHONE,
        address: THIRD_PARTY_ADDRESS,
        postcode: THIRD_PARTY_POSTCODE,
      },
    },
    prose_quarantine: {
      id: "prose_quarantine",
      agencyId: world.agencyId,
      personId: world.personId,
      notes: `${THIRD_PARTY_NAME}, ${THIRD_PARTY_ADDRESS}, ${THIRD_PARTY_POSTCODE}, ${THIRD_PARTY_PHONE}`,
    },
    depth_quarantine: {
      id: "depth_quarantine",
      agencyId: world.agencyId,
      personId: world.personId,
      nested: tooDeep,
    },
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId);
  assert.ok(result);
  const released = (result.found.tasks ?? []).find(row => (row as { id?: string }).id === "safe_redaction_7700900123") as Record<string, unknown>;
  assert.ok(released);
  assert.equal(released.id, "safe_redaction_7700900123", "numeric-looking machine ids are not corrupted");
  assert.equal(released.createdAt, createdAt, "timestamps are not corrupted");
  assert.deepEqual(released.contact, {
    name: "[redacted:third-party-name]",
    email: "[redacted:third-party-email]",
    phone: "[redacted:third-party-phone]",
    address: "[redacted:third-party-address]",
    postcode: "[redacted:third-party-address]",
  });
  assert.ok(result.coMingledPiiMatches.tasks >= 1);
  assert.ok(result.depthLimitMatches.tasks >= 1);
  assert.equal(result.redactedFields.tasks, 5);
  const json = exportsApi.subjectAccessExportJson(result);
  for (const secret of [THIRD_PARTY_NAME, THIRD_PARTY_EMAIL, THIRD_PARTY_PHONE, THIRD_PARTY_ADDRESS, THIRD_PARTY_POSTCODE]) {
    assert.ok(!json.includes(secret), `automatic JSON must not contain ${secret}`);
  }
  assert.match(json, /point-in-time export does not delete source data or change its configured retention/i);
  assert.match(json, /recordsBeyondInspectionDepth/);
});

test("typed projections preserve Person history and finance fields while unknown PII, unsafe ledger text and lazy rows are withheld", async () => {
  const world = await seedWorld();
  const clientId = `client_primary_${sequence}`;
  putClient(clientFixture({
    id: clientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId: `relationship_subject_${sequence}`,
    name: "Subject Person",
  }));
  const occurredAt = 1_725_555_000_123;
  const unsafeBank = "Account number 12345678, sort code 11-22-33";
  realStorage.mutate(state => {
    const subject = state.persons[world.personId] as Person & Record<string, unknown>;
    subject.facets = {
      leadId: `lead_subject_${sequence}`,
      contactId: `contact_subject_${sequence}`,
      clientIds: [clientId],
      enquiryIds: [`enquiry_one_${sequence}`, `enquiry_two_${sequence}`],
    };
    subject.classificationHistory = [{
      from: "sales",
      to: "existing-client",
      at: occurredAt,
      by: "usr_operator",
      note: `${THIRD_PARTY_NAME} approved it`,
      sourceType: "lead",
      sourceId: `source_${sequence}`,
    }];
    subject.record = [{
      id: `person_record_${sequence}`,
      kind: "meeting",
      at: occurredAt,
      summary: `Meeting with ${THIRD_PARTY_NAME}`,
      body: THIRD_PARTY_ADDRESS,
      createdBy: "usr_operator",
      createdAt: occurredAt,
    }];
    subject.emails[0].raw = "Injected Raw <raw-third-party@example.test>";
    subject.firstName = "MallorySecretFirst";
    subject.lastName = "MallorySecretLast";
    subject.nationalInsuranceNumber = "QQ123456C";
    subject.bankAccount = "99887766";
    state.tasks[`unknown_pii_${sequence}`] = {
      id: `unknown_pii_${sequence}`,
      agencyId: world.agencyId,
      personId: world.personId,
      status: "todo",
      priority: "normal",
      title: "Subject Person",
      createdBy: world.ownerId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      firstName: "UnknownThirdFirst",
      lastName: "UnknownThirdLast",
      nationalInsuranceNumber: "AB123456C",
      bankDetails: { accountNumber: "12345678", sortCode: "12-34-56" },
    } as never;
    state.clientRecordLedger[`safe_ledger_${sequence}`] = {
      id: `safe_ledger_${sequence}`,
      agencyId: world.agencyId,
      clientId,
      sourceType: "payment-plan",
      sourceId: `payment-plan:plan_${sequence}`,
      group: "commercial",
      title: "Growth plan",
      body: "3 milestones · GBP 100.00 paid of GBP 300.00",
      occurredAt,
      eyebrow: "commercial · active",
      visibility: "system",
      createdAt: occurredAt,
      updatedAt: occurredAt + 1,
    };
    state.clientRecordLedger[`unsafe_ledger_${sequence}`] = {
      id: `unsafe_ledger_${sequence}`,
      agencyId: world.agencyId,
      clientId,
      sourceType: "invoice",
      sourceId: `invoice:unsafe_${sequence}`,
      group: "commercial",
      title: "Invoice INV-2",
      body: unsafeBank,
      occurredAt,
      eyebrow: "commercial · sent",
      visibility: "system",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    state.clientRecordLedger[`unsafe_phone_ledger_${sequence}`] = {
      id: `unsafe_phone_ledger_${sequence}`,
      agencyId: world.agencyId,
      clientId,
      sourceType: "payment-plan",
      sourceId: `payment-plan:unsafe_phone_${sequence}`,
      group: "commercial",
      title: "Support plan",
      body: `Call the other contact on ${THIRD_PARTY_PHONE}`,
      occurredAt,
      eyebrow: "commercial · active",
      visibility: "system",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const installId = `install_finance_${sequence}`;
    state.pluginInstalls[installId] = {
      id: installId,
      pluginId: "agency-finance",
      agencyId: world.agencyId,
      enabled: true,
      config: {},
      features: { "invoice-html-export": true },
      installedAt: occurredAt,
    };
    state.pluginData[installId] = {
      [`invoices/by-id/invoice_${sequence}`]: {
        id: `invoice_${sequence}`,
        agencyId: world.agencyId,
        clientId,
        number: "INV-2026-0001",
        issuedAt: occurredAt,
        dueAt: occurredAt + 86_400_000,
        lineItems: [{ description: THIRD_PARTY_ADDRESS, quantity: 1, unitCents: 10_000, totalCents: 10_000 }],
        subtotalCents: 10_000,
        taxCents: 2_000,
        totalCents: 12_000,
        currency: "gbp",
        status: "sent",
        notes: THIRD_PARTY_PHONE,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
      [`invoices/by-id/cross_tenant_${sequence}`]: {
        id: `cross_tenant_${sequence}`,
        agencyId: world.otherAgencyId,
        clientId,
        number: "INV-CROSS-TENANT",
        issuedAt: occurredAt,
        dueAt: occurredAt,
        subtotalCents: 1,
        taxCents: 0,
        totalCents: 1,
        currency: "gbp",
        status: "sent",
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
    };
    state.devTeamWorkspaceFiles[`lazy_subject_${sequence}`] = {
      id: `lazy_subject_${sequence}`,
      agencyId: world.agencyId,
      personId: world.personId,
      content: THIRD_PARTY_POSTCODE,
    } as never;
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const person = (result.found.persons ?? []).find(row => (row as { id?: string }).id === world.personId) as Record<string, unknown>;
  assert.deepEqual((person.facets as { enquiryIds: string[] }).enquiryIds, [`enquiry_one_${sequence}`, `enquiry_two_${sequence}`]);
  assert.deepEqual(person.classificationHistory, [{
    from: "sales", to: "existing-client", at: occurredAt, by: "usr_operator", sourceType: "lead", sourceId: `source_${sequence}`,
  }]);
  assert.deepEqual(person.record, [{ id: `person_record_${sequence}`, kind: "meeting", at: occurredAt, createdAt: occurredAt }]);

  const ledger = result.found.clientRecordLedger ?? [];
  const safeLedger = ledger.find(row => (row as { id?: string }).id === `safe_ledger_${sequence}`) as Record<string, unknown>;
  assert.equal(safeLedger.title, undefined, "human-authored ledger titles are always review-only");
  assert.equal(safeLedger.body, undefined, "human-authored ledger bodies are always review-only");
  assert.equal(safeLedger.occurredAt, occurredAt, "typed dates remain numeric and unmodified");
  assert.equal(ledger.some(row => (row as { id?: string }).id === `unsafe_ledger_${sequence}`), true,
    "typed ledger metadata survives while unsafe prose is quarantined");
  assert.equal(ledger.some(row => (row as { id?: string }).id === `unsafe_phone_ledger_${sequence}`), true);

  const pluginInvoice = (result.found.pluginData ?? []).find(row => (row as { key?: string }).key === `invoices/by-id/invoice_${sequence}`) as {
    installId: string;
    value: Record<string, unknown>;
  };
  assert.equal(pluginInvoice.installId, `install_finance_${sequence}`);
  assert.equal(pluginInvoice.value.totalCents, 12_000);
  assert.equal(pluginInvoice.value.dueAt, occurredAt + 86_400_000);
  assert.equal(pluginInvoice.value.lineItems, undefined);
  assert.equal((result.found.pluginData ?? []).some(row => (row as { key?: string }).key === `invoices/by-id/cross_tenant_${sequence}`), false);
  assert.ok(result.unsupportedCollectionMatches.devTeamWorkspaceFiles >= 1, "explicitly loaded lazy sidecars are classified, not silently skipped");

  const json = exportsApi.subjectAccessExportJson(result);
  for (const secret of [
    "MallorySecretFirst", "MallorySecretLast", "QQ123456C", "99887766", "UnknownThirdFirst", "UnknownThirdLast",
    "AB123456C", "12345678", "12-34-56", unsafeBank, "raw-third-party@example.test", THIRD_PARTY_ADDRESS, THIRD_PARTY_PHONE, THIRD_PARTY_POSTCODE,
  ]) assert.equal(json.includes(secret), false, `${secret} must not leak from an unknown or co-mingled field`);
});

test("allowlisted task, ledger and finance reference strings redact third-party PII and banking identifiers field by field", async () => {
  const world = await seedWorld();
  const clientId = `client_reference_redaction_${sequence}`;
  putClient(clientFixture({
    id: clientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId: `relationship_reference_redaction_${sequence}`,
    name: "Subject Person",
  }));
  realStorage.mutate(state => {
    state.tasks.reference_leak = {
      id: "reference_leak",
      agencyId: world.agencyId,
      personId: world.personId,
      sourceId: "sort-code:20-12-34",
      sourceHref: "https://example.test/profile?nino=AB%2012%2034%2056%20C",
      seriesId: "postcode:SW1A 1AA",
      status: THIRD_PARTY_EMAIL,
      priority: "20/12/34",
      origin: THIRD_PARTY_ADDRESS,
      clientBoardColumn: "bank account 87654321",
    } as never;
    state.tasks.reference_safe = {
      id: "reference_safe",
      agencyId: world.agencyId,
      personId: world.personId,
      sourceId: "invoice:INV-2026-0001",
      sourceHref: "https://example.test/invoices/INV-2026-0001",
      seriesId: "series_2026_42",
      status: "todo",
      priority: "normal",
      origin: "manual",
      clientBoardColumn: "backlog",
    } as never;
    state.clientRecordLedger.reference_leak = {
      id: "ledger_reference_leak",
      agencyId: world.agencyId,
      clientId,
      sourceType: "invoice",
      sourceId: "invoice:safe-reference",
      group: "commercial",
      title: "Invoice summary",
      body: "GBP 100.00 due",
      href: `https://billing.test/open?email=${encodeURIComponent(THIRD_PARTY_EMAIL)}`,
      parentSourceId: "account-number:12345678",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
    const installId = `install_reference_redaction_${sequence}`;
    state.pluginInstalls[installId] = {
      id: installId,
      pluginId: "agency-finance",
      agencyId: world.agencyId,
      clientId,
      enabled: true,
      config: {},
      features: { "invoice-html-export": true },
      installedAt: 1_725_555_000_123,
    };
    state.pluginData[installId] = {
      "invoices/by-id/safe-reference": {
        id: "invoice_reference_leak",
        agencyId: world.agencyId,
        clientId,
        number: "INV-42",
        externalRef: "nino:AB 12 34 56 C",
        paidVia: "bank account 87654321",
        issuedAt: 1_725_555_000_123,
        dueAt: 1_725_555_100_123,
        subtotalCents: 10_000,
        taxCents: 2_000,
        totalCents: 12_000,
        currency: "gbp",
        status: "paid",
        createdAt: 1_725_555_000_123,
        updatedAt: 1_725_555_000_123,
      },
    };
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const task = (result.found.tasks ?? []).find(row => (row as { id?: string }).id === "reference_leak") as Record<string, unknown>;
  assert.equal(task.sourceId, "[redacted:restricted-identifier]");
  assert.equal(task.sourceHref, "[redacted:restricted-identifier]");
  assert.equal(task.seriesId, "[redacted:restricted-identifier]");
  for (const field of ["status", "priority", "origin", "clientBoardColumn"]) {
    assert.equal(task[field], undefined, `${field} must be runtime-validated instead of blindly copied`);
  }
  const safeTask = (result.found.tasks ?? []).find(row => (row as { id?: string }).id === "reference_safe") as Record<string, unknown>;
  assert.equal(safeTask.sourceId, "invoice:INV-2026-0001", "ordinary machine references must not be false positives");
  assert.equal(safeTask.status, "todo");
  assert.equal(safeTask.priority, "normal");
  assert.equal(safeTask.origin, "manual");
  assert.equal(safeTask.clientBoardColumn, "backlog");
  const ledger = (result.found.clientRecordLedger ?? []).find(row => (row as { id?: string }).id === "ledger_reference_leak") as Record<string, unknown>;
  assert.equal(ledger.href, undefined, "non-canonical ledger links are review-only, not detector-authorised");
  assert.equal(ledger.parentSourceId, undefined, "unsupported parent references are review-only");
  const invoice = (result.found.pluginData ?? [])[0] as { value: Record<string, unknown> };
  assert.equal(invoice.value.externalRef, "[redacted:restricted-identifier]");
  assert.equal(invoice.value.paidVia, "[redacted:restricted-identifier]");
  assert.equal(result.redactedFields.tasks, 3);
  assert.ok((result.omittedFields.tasks ?? 0) >= 4, "malformed runtime enum strings are explicitly counted for review");
  assert.equal(result.redactedFields.clientRecordLedger ?? 0, 0);
  assert.ok((result.omittedFields.clientRecordLedger ?? 0) >= 3, "unverified ledger references are counted for review");
  assert.equal(result.redactedFields.pluginData, 2);
  const json = exportsApi.subjectAccessExportJson(result);
  const exported = JSON.parse(json) as { completeness: { redactedFields: Record<string, number> } };
  assert.deepEqual(exported.completeness.redactedFields, result.redactedFields, "the delivered completeness statement carries exact redaction counters");
  assert.equal(json.includes(THIRD_PARTY_EMAIL), false);
  assert.equal(json.includes("20-12-34"), false);
  assert.equal(json.includes("20/12/34"), false);
  assert.equal(json.includes("AB 12 34 56 C"), false);
  assert.equal(json.includes("SW1A 1AA"), false);
  assert.equal(json.includes(THIRD_PARTY_ADDRESS), false);
  assert.equal(json.includes("12345678"), false);
  assert.equal(json.includes("87654321"), false);
});

test("dynamic keys and realistic UK addresses are withheld without corrupting calendar-like references", async () => {
  const world = await seedWorld();
  const clientId = `client_key_address_${sequence}`;
  const installId = `install_key_address_${sequence}`;
  putClient(clientFixture({
    id: clientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId: `relationship_key_address_${sequence}`,
    name: "Subject Person",
  }));
  realStorage.mutate(state => {
    state.clientRecordLedger.address_without_postcode = {
      id: "address_without_postcode",
      agencyId: world.agencyId,
      clientId,
      sourceType: "payment-plan",
      sourceId: "payment-plan:address-review",
      group: "commercial",
      title: "Correspondence",
      body: "Send papers to 12 Baker Close, London",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
    state.clientRecordLedger.named_premise_address = {
      id: "named_premise_address",
      agencyId: world.agencyId,
      clientId,
      sourceType: "payment-plan",
      sourceId: "payment-plan:named-premise-review",
      group: "commercial",
      title: "Correspondence",
      body: "Send papers to Rose Cottage, Church Lane, Oxford",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
    state.clientRecordLedger.close_without_address = {
      id: "close_without_address",
      agencyId: world.agencyId,
      clientId,
      sourceType: "payment-plan",
      sourceId: "payment-plan:safe-language",
      group: "commercial",
      title: "Quarter plan",
      body: "Close the quarter in 12 ways after review",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
    for (const [id, title, body] of [
      ["unregistered_third_party_name", "Contact update", "Spoke with Evelyn Stone about the payment"],
      ["named_premise_variant", "Post papers", "Send papers to The Old Rectory, Church Lane Oxford"],
      ["embedded_bare_bank_identifier", "Supplier payment", "Payment details 87654321 for the supplier"],
    ] as const) {
      state.clientRecordLedger[id] = {
        id,
        agencyId: world.agencyId,
        clientId,
        sourceType: "payment-plan",
        sourceId: id === "embedded_bare_bank_identifier"
          ? "payment-plan:supplier-87654321"
          : `payment-plan:${id}`,
        group: "commercial",
        title,
        body,
        occurredAt: 1_725_555_000_123,
        visibility: "system",
        createdAt: 1_725_555_000_123,
        updatedAt: 1_725_555_000_123,
      };
    }
    state.clientRecordLedger.unregistered_source_text = {
      id: "unregistered_source_text",
      agencyId: world.agencyId,
      clientId,
      sourceType: "invoice",
      sourceId: "Spoke with Evelyn Stone at The Old Rectory Church Lane Oxford",
      group: "commercial",
      title: "Invoice summary",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
    state.pluginInstalls[installId] = {
      id: installId,
      pluginId: "agency-finance",
      agencyId: world.agencyId,
      clientId,
      enabled: true,
      config: {},
      features: {
        "invoice-html-export": true,
        [THIRD_PARTY_EMAIL]: true,
        "Evelyn Stone": true,
        "Rose Cottage": true,
        firstName: "Evelyn",
        address: "Rose Cottage",
      } as never,
      installedAt: 1_725_555_000_123,
    };
    state.pluginData[installId] = {
      "invoices/by-id/calendar-reference": {
        id: "invoice_calendar_reference",
        agencyId: world.agencyId,
        clientId,
        number: "INV-20260912",
        issuedAt: 1_725_555_000_123,
        dueAt: 1_725_555_100_123,
        subtotalCents: 10_000,
        taxCents: 2_000,
        totalCents: 12_000,
        currency: "gbp",
        status: "sent",
        createdAt: 1_725_555_000_123,
        updatedAt: 1_725_555_000_123,
      },
    };
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const ledger = result.found.clientRecordLedger ?? [];
  for (const id of ["address_without_postcode", "named_premise_address", "close_without_address"]) {
    const projected = ledger.find(row => (row as { id?: string }).id === id) as { body?: string };
    assert.ok(projected, "typed ledger metadata remains available");
    assert.equal(projected.body, undefined, "all ledger prose is review-only, including previously undetected named premises");
  }
  for (const id of ["unregistered_third_party_name", "named_premise_variant", "embedded_bare_bank_identifier", "unregistered_source_text"]) {
    const projected = ledger.find(row => (row as { id?: string }).id === id) as { title?: string; body?: string; sourceId?: string };
    assert.ok(projected, "typed ledger metadata survives review quarantine");
    assert.equal(projected.title, undefined);
    assert.equal(projected.body, undefined);
    assert.equal(projected.sourceId, undefined, "free-text and invalid machine references are withheld regardless of detector coverage");
  }
  const install = (result.found.pluginInstalls ?? []).find(row => (row as { id?: string }).id === installId) as {
    features: Record<string, boolean>;
  };
  assert.deepEqual(install.features, { "invoice-html-export": true },
    "only current first-party manifest feature ids with boolean values are releasable");
  assert.equal(Object.hasOwn(install.features, THIRD_PARTY_EMAIL), false, "PII cannot survive as an emitted JSON key");
  for (const key of ["Evelyn Stone", "Rose Cottage", "firstName", "address"]) {
    assert.equal(Object.hasOwn(install.features, key), false, `unknown feature ${key} is review-only`);
  }
  const invoice = (result.found.pluginData ?? []).find(row => (row as { key?: string }).key === "invoices/by-id/calendar-reference") as {
    value: { number: string };
  };
  assert.equal(invoice.value.number, "INV-20260912", "a valid compact date inside an invoice reference is not a bank-account false positive");
  assert.ok((result.redactedFields.pluginInstalls ?? 0) >= 1);
  assert.ok((result.omittedFields.pluginInstalls ?? 0) >= 5);
  assert.ok(exportsApi.subjectAccessExportReviewCount(result) > 0, "unknown plugin feature fields cannot auto-release at review=0");
  const json = exportsApi.subjectAccessExportJson(result);
  for (const secret of ["Evelyn Stone", "The Old Rectory", "87654321"]) assert.equal(json.includes(secret), false);
  assert.equal(json.includes(THIRD_PARTY_EMAIL), false);
  assert.equal(json.includes("12 Baker Close, London"), false);
  assert.equal(json.includes("Rose Cottage, Church Lane, Oxford"), false);
  assert.equal(json.includes("Evelyn Stone"), false);
  assert.equal(json.includes('"firstName"'), false);
});

test("malformed authoritative scalars and root collection shapes make preparation explicitly incomplete", async () => {
  const world = await seedWorld();
  realStorage.mutate(state => {
    state.tasks.malformed_scalar = {
      id: "malformed_scalar",
      agencyId: world.agencyId,
      personId: world.personId,
      status: "todo",
      priority: "normal",
      createdAt: { secret: "not-a-number" },
      updatedAt: 1_725_555_000_123,
    } as never;
  });
  const malformed = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const projected = (malformed.found.tasks ?? []).find(row => (row as { id?: string }).id === "malformed_scalar") as Record<string, unknown>;
  assert.equal(projected.createdAt, undefined);
  assert.ok(malformed.incompleteReasons.includes("invalid-stored-value"));
  assert.ok((malformed.omittedFields.tasks ?? 0) >= 1);
  assert.throws(
    () => exportsApi.subjectAccessExportJson(malformed),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );

  const secondWorld = await seedWorld();
  realStorage.mutate(state => {
    (state as unknown as Record<string, unknown>).tasks = "corrupt-collection";
  });
  const corruptCollection = exportsApi.collectSubjectAccessExport(secondWorld.agencyId, secondWorld.personId)!;
  assert.equal(corruptCollection.searchedCollections.includes("tasks"), false);
  assert.ok(corruptCollection.incompleteReasons.includes("invalid-stored-value"));
  assert.ok((corruptCollection.omittedFields.tasks ?? 0) >= 1);
  assert.throws(
    () => exportsApi.subjectAccessExportJson(corruptCollection),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("scalar rows and malformed Person classification history cannot disappear as automatic-complete", async () => {
  const scalarWorld = await seedWorld();
  realStorage.mutate(state => {
    state.tasks.bad_scalar_row = 42 as never;
  });
  const scalarRow = exportsApi.collectSubjectAccessExport(scalarWorld.agencyId, scalarWorld.personId)!;
  assert.ok(scalarRow.incompleteReasons.includes("invalid-stored-value"));
  assert.ok((scalarRow.omittedFields.tasks ?? 0) >= 1, "the malformed row has an explicit omission");
  assert.throws(
    () => exportsApi.subjectAccessExportJson(scalarRow),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );

  const historyWorld = await seedWorld();
  realStorage.mutate(state => {
    state.persons[historyWorld.personId].classificationHistory = "corrupt-history" as never;
  });
  const malformedHistory = exportsApi.collectSubjectAccessExport(historyWorld.agencyId, historyWorld.personId)!;
  assert.ok(malformedHistory.incompleteReasons.includes("invalid-stored-value"));
  assert.ok((malformedHistory.omittedFields.persons ?? 0) >= 1, "the malformed typed nested array has an explicit omission");
  assert.throws(
    () => exportsApi.subjectAccessExportJson(malformedHistory),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("malformed recognised Person and Client arrays, objects and enums are explicit incomplete omissions", async () => {
  const world = await seedWorld();
  const clientId = `client_malformed_nested_${sequence}`;
  putClient(clientFixture({
    id: clientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId: `relationship_malformed_nested_${sequence}`,
    name: "Subject Person",
  }));
  realStorage.mutate(state => {
    const person = state.persons[world.personId] as unknown as Record<string, unknown>;
    person.classification = "vip-secret-enum";
    person.facets = { clientIds: "not-an-array", enquiryIds: ["enquiry-valid", 42] };
    person.classificationHistory = [{ from: "vip-secret-enum", to: "sales", at: "yesterday" }];
    person.organisationLinks = "not-an-array";
    person.record = [{ id: "record-invalid", kind: "email", at: "now", summary: "unsafe prose", createdAt: {} }];
    const client = state.clients[clientId] as unknown as Record<string, unknown>;
    client.stage = "vip-secret-stage";
    client.status = "enabled-secret-status";
    client.brand = "not-a-brand-object";
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.ok(result.incompleteReasons.includes("invalid-stored-value"));
  assert.ok((result.omittedFields.persons ?? 0) >= 7, "each malformed nested value contributes an explicit omission");
  assert.ok((result.omittedFields.clients ?? 0) >= 3);
  const person = (result.found.persons ?? []).find(row => (row as { id?: string }).id === world.personId) as Record<string, unknown>;
  assert.equal(person.classification, undefined);
  assert.deepEqual(person.classificationHistory, []);
  assert.deepEqual(person.organisationLinks, []);
  assert.deepEqual(person.record, []);
  assert.deepEqual((person.facets as Record<string, unknown>).clientIds, []);
  assert.deepEqual((person.facets as Record<string, unknown>).enquiryIds, ["enquiry-valid"]);
  const client = (result.found.clients ?? []).find(row => (row as { id?: string }).id === clientId) as Record<string, unknown>;
  assert.equal(client.stage, undefined);
  assert.equal(client.status, undefined);
  assert.equal(client.brand, undefined);
  assert.equal(JSON.stringify(result).includes("vip-secret"), false, "invalid enum payloads never enter the export result");
  assert.throws(
    () => exportsApi.subjectAccessExportJson(result),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("missing required Person record summaries and Client slugs cannot claim automatic completeness", async () => {
  const world = await seedWorld();
  const clientId = `client_missing_required_${sequence}`;
  putClient(clientFixture({
    id: clientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId: `relationship_missing_required_${sequence}`,
    name: "Subject Person",
  }));
  realStorage.mutate(state => {
    state.persons[world.personId].record = [{
      id: "record-without-summary",
      kind: "note",
      at: 1_725_555_000_123,
      createdAt: 1_725_555_000_123,
    } as never];
    delete (state.clients[clientId] as Partial<Client>).slug;
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.ok(result.incompleteReasons.includes("invalid-stored-value"));
  assert.ok((result.omittedFields.persons ?? 0) >= 1, "missing required summary is explicitly counted");
  assert.ok((result.omittedFields.clients ?? 0) >= 1, "missing required slug is explicitly counted");
  assert.ok(exportsApi.subjectAccessExportReviewCount(result) > 0);
  assert.throws(
    () => exportsApi.subjectAccessExportJson(result),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("lineage matching has no silent 1000-identifier truncation and fails explicitly only at the shared meter", async () => {
  const world = await seedWorld();
  const facetIds = Array.from({ length: 1_005 }, (_, index) => `enquiry_lineage_${String(index).padStart(4, "0")}`);
  const lastFacetId = facetIds.at(-1)!;
  realStorage.mutate(state => {
    state.persons[world.personId].facets = { enquiryIds: facetIds };
    state.tasks.last_lineage_mention = {
      id: "last_lineage_mention",
      agencyId: world.agencyId,
      notes: `Imported reference ${lastFacetId}`,
    } as never;
  });
  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.equal(result.subject.facetIds.includes(lastFacetId), true);
  assert.ok((result.unclassifiedMatches.tasks ?? 0) >= 1, "the final lineage identifier is still recognised for review");
  assert.deepEqual(result.incompleteReasons, []);

  const capped = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId, { maxValues: 512 })!;
  assert.ok(capped.incompleteReasons.includes("value-limit"), "the shared traversal meter replaces a silent private cap");
  assert.throws(
    () => exportsApi.subjectAccessExportJson(capped),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("other-person PII matching uses bounded indexed work as people and emitted records scale together", async () => {
  const observations: Array<{ size: number; matcherCharacters: number; values: number }> = [];
  for (const size of [250, 500, 1_000, 2_000]) {
    const world = await seedWorld();
    realStorage.mutate(state => {
      for (let index = 0; index < size; index += 1) {
        const personId = `per_name_scale_${index}`;
        state.persons[personId] = personFixture({
          id: personId,
          agencyId: world.agencyId,
          name: `Outside${index.toString(36).padStart(6, "x")}`,
          emails: [],
          phones: [],
        });
        const taskId = `name_scale_task_${index}`;
        state.tasks[taskId] = {
          id: taskId,
          agencyId: world.agencyId,
          personId: world.personId,
          title: "Subject Person",
          status: "todo",
          priority: "normal",
          createdAt: 1_725_555_000_123,
          updatedAt: 1_725_555_000_123,
        };
      }
    });
    const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
    assert.deepEqual(result.incompleteReasons, []);
    observations.push({
      size,
      matcherCharacters: result.work.matcherCharactersInspected,
      values: result.work.valuesVisited,
    });
  }
  for (let index = 1; index < observations.length; index += 1) {
    assert.ok(
      observations[index].matcherCharacters < observations[index - 1].matcherCharacters * 2.6,
      `doubling people and records must keep indexed matching linear: ${JSON.stringify(observations)}`,
    );
    assert.ok(
      observations[index].values < observations[index - 1].values * 2.6,
      `all name-index preprocessing stays inside the shared traversal budget: ${JSON.stringify(observations)}`,
    );
  }
});

test("short other-person names use token boundaries and cannot poison schema keys or annual invoice references", async () => {
  const world = await seedWorld();
  const clientId = `client_short_name_${sequence}`;
  putPerson(personFixture({
    id: `per_al_${sequence}`,
    agencyId: world.agencyId,
    name: "Al Smith",
    emails: [],
    phones: [],
  }));
  putPerson(personFixture({
    id: `per_ann_${sequence}`,
    agencyId: world.agencyId,
    name: "Ann Lee",
    emails: [],
    phones: [],
  }));
  putClient(clientFixture({
    id: clientId,
    agencyId: world.agencyId,
    personId: world.personId,
    relationshipId: `relationship_short_name_${sequence}`,
    name: "Subject Person",
  }));
  realStorage.mutate(state => {
    state.clientRecordLedger.short_name_false_positive = {
      id: "short_name_false_positive",
      agencyId: world.agencyId,
      clientId,
      sourceType: "invoice",
      sourceId: "invoice:inv_annual202609",
      group: "commercial",
      title: "Invoice summary",
      body: "Annual invoice INV-20260912",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
    state.clientRecordLedger.short_name_true_positive = {
      id: "short_name_true_positive",
      agencyId: world.agencyId,
      clientId,
      sourceType: "invoice",
      sourceId: "invoice:Ann",
      group: "commercial",
      title: "Invoice summary",
      occurredAt: 1_725_555_000_123,
      visibility: "system",
      createdAt: 1_725_555_000_123,
      updatedAt: 1_725_555_000_123,
    };
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.deepEqual(result.incompleteReasons, []);
  assert.ok(result.searchedCollections.includes("clientRecordLedger"));
  const ledger = (result.found.clientRecordLedger ?? []).find(row => (
    row as { id?: string }
  ).id === "short_name_false_positive") as { sourceId?: string; body?: string };
  assert.equal(ledger.sourceId, "invoice:inv_annual202609");
  assert.equal(ledger.body, undefined, "ledger prose remains review-only independently of name matching");
  assert.ok(result.searchedCollections.includes("peopleChannels"), "Ann cannot poison peopleChannels");
  assert.ok(result.searchedCollections.includes("peopleEmployees"), "Lee cannot poison peopleEmployees");
  const trueMatch = (result.found.clientRecordLedger ?? []).find(row => (
    row as { id?: string }
  ).id === "short_name_true_positive") as { sourceId?: string };
  assert.equal(trueMatch.sourceId, undefined, "a non-machine source id containing a standalone name remains withheld");
  assert.doesNotThrow(() => exportsApi.subjectAccessExportJson(result));
});

test("every SubjectRequest lifecycle field is exported or explicitly counted, so silent omissions cannot claim completion", async () => {
  const world = await seedWorld();
  const request = makeRequest(world, { verify: true });
  const malformed = makeRequest(world, { verify: true });
  realStorage.mutate(state => {
    Object.assign(state.subjectRequests[request.id], {
      extendedAt: 101,
      extensionReason: "Complex request explanation",
      identityVerifiedBy: "usr_identity_reviewer",
      preparedExportAt: 102,
      preparedExportBy: "usr_exporter",
      preparedExportDigest: "a".repeat(64),
      preparedExportGeneratedAt: 103,
      preparedExportRecordCount: 4,
      preparedExportReviewCount: 2,
      preparedExportByteLength: 1234,
      preparedExportIntegrityTag: "e".repeat(64),
      preparedExportIntegrityKeyId: `dsar_${"1".repeat(24)}`,
      preparedExportIntegrityKeyVersion: 1,
      preparedExportJson: JSON.stringify({ subject: SUBJECT_EMAIL }),
      preparedExportReviewResolvedAt: 104,
      preparedExportReviewResolvedBy: "usr_reviewer",
      preparedExportReviewResolvedDigest: "b".repeat(64),
      preparedExportReviewEvidenceId: "review-evidence-1",
      preparedExportReviewResultId: "d".repeat(64),
      preparedExportReviewIntegrityKeyId: `dsar_${"2".repeat(24)}`,
      preparedExportReviewIntegrityKeyVersion: 1,
      deliveredAt: 105,
      deliveredBy: "usr_deliverer",
      deliveryMethod: "secure-email",
      deliveryEvidenceId: "delivery-evidence-1",
      deliveryResultId: "c".repeat(64),
      deliveryIntegrityKeyId: `dsar_${"3".repeat(24)}`,
      deliveryIntegrityKeyVersion: 1,
      fulfilledAt: 105,
      fulfilledBy: "usr_deliverer",
      outcome: "Delivered after review",
      refusedAt: 106,
      refusalReason: "Fixture exercises all lifecycle fields",
    } satisfies Partial<SubjectRequest>);
    Object.assign(state.subjectRequests[malformed.id], {
      deliveredAt: THIRD_PARTY_EMAIL,
      deliveryResultId: "bank account 87654321",
    } as unknown as Partial<SubjectRequest>);
  });

  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  const projected = (result.found.subjectRequests ?? []).find(row => (row as { id?: string }).id === request.id) as Record<string, unknown>;
  for (const field of [
    "identityVerifiedBy", "preparedExportAt", "preparedExportBy", "preparedExportDigest", "preparedExportIntegrityTag", "preparedExportIntegrityKeyId", "preparedExportIntegrityKeyVersion", "preparedExportGeneratedAt",
    "preparedExportRecordCount", "preparedExportReviewCount", "preparedExportByteLength", "preparedExportReviewResolvedAt",
    "preparedExportReviewResolvedBy", "preparedExportReviewResolvedDigest", "preparedExportReviewEvidenceId", "preparedExportReviewResultId", "preparedExportReviewIntegrityKeyId", "preparedExportReviewIntegrityKeyVersion", "deliveredAt",
    "deliveredBy", "deliveryMethod", "deliveryEvidenceId", "deliveryResultId", "deliveryIntegrityKeyId", "deliveryIntegrityKeyVersion", "fulfilledAt", "fulfilledBy", "refusedAt", "createdBy",
  ]) assert.notEqual(projected[field], undefined, `${field} must not disappear from a recognised request`);
  for (const field of ["extensionReason", "preparedExportJson", "outcome", "refusalReason"]) {
    assert.equal(projected[field], undefined, `${field} is deliberately withheld rather than silently copied`);
  }
  const malformedProjected = (result.found.subjectRequests ?? []).find(row => (row as { id?: string }).id === malformed.id) as Record<string, unknown>;
  assert.equal(malformedProjected.deliveredAt, undefined, "a recognised lifecycle field with a hostile runtime type is counted, not copied");
  assert.equal(malformedProjected.deliveryResultId, undefined, "a malformed durable result identity is counted, not copied");
  assert.equal(result.omittedFields.subjectRequests, 6, "withheld and malformed recognised fields are counted exactly once");
  const json = JSON.parse(exportsApi.subjectAccessExportJson(result)) as {
    completeness: { status: string; omittedFields: Record<string, number> };
  };
  assert.equal(json.completeness.status, "human-review-required");
  assert.equal(json.completeness.omittedFields.subjectRequests, 6);
  assert.equal(JSON.stringify(json).includes(THIRD_PARTY_EMAIL), false);
  assert.equal(JSON.stringify(json).includes("87654321"), false);
});

test("foreign-tenant volume does not consume the tenant-local record budget", async () => {
  const world = await seedWorld();
  realStorage.mutate(state => {
    for (let index = 0; index < 50_000; index += 1) {
      const id = `foreign_candidate_${index}`;
      state.tasks[id] = { id, agencyId: world.otherAgencyId, personId: world.personId } as never;
    }
    state.tasks.local_after_foreign_volume = {
      id: "local_after_foreign_volume", agencyId: world.agencyId, personId: world.personId,
    } as never;
  });
  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.ok((result.found.tasks ?? []).some(row => (row as { id?: string }).id === "local_after_foreign_volume"));
  assert.ok(result.work.recordsVisited < 100, `foreign rows must not count as tenant candidates: ${result.work.recordsVisited}`);
  assert.deepEqual(result.incompleteReasons, []);
});

test("typed owner accumulation is Set-linear at 2k, 4k, 8k and 16k claims and nested traversal is metered", async () => {
  const world = await seedWorld();
  const observations: Array<{ size: number; values: number }> = [];
  for (const size of [2_000, 4_000, 8_000, 16_000]) {
    realStorage.mutate(state => {
      state.tasks.owner_scale = {
        id: "owner_scale",
        agencyId: world.agencyId,
        scope: {
          claims: [
            ...Array.from({ length: size }, (_, index) => ({ personId: `per_conflict_${index}` })),
            { personId: world.personId },
          ],
        },
      } as never;
    });
    const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
    observations.push({ size, values: result.work.valuesVisited });
    assert.ok(result.work.valuesVisited > size, "typed-claim traversal must be present in the work meter");
    assert.ok(result.work.valuesVisited < size * 8 + 4_000, `the descriptor clone and typed-claim passes must remain O(n): ${JSON.stringify(observations)}`);
    assert.deepEqual(result.incompleteReasons, []);
  }
  for (let index = 1; index < observations.length; index += 1) {
    assert.ok(
      observations[index].values < observations[index - 1].values * 2.4,
      `doubling claims must remain linear: ${JSON.stringify(observations)}`,
    );
  }

  realStorage.mutate(state => {
    state.tasks.owner_scale = {
      id: "owner_scale",
      agencyId: world.agencyId,
      scope: { claims: Array.from({ length: 500 }, (_, index) => ({ personId: `per_${index}` })) },
    } as never;
  });
  const capped = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId, { maxValues: 128 })!;
  assert.ok(capped.incompleteReasons.includes("value-limit"), "every nested ownership path shares the hard value budget");
  assert.throws(
    () => exportsApi.subjectAccessExportJson(capped),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("person partition, lineage and descriptor discovery share one hard traversal budget", async () => {
  const world = await seedWorld();
  let getterCalls = 0;
  realStorage.mutate(state => {
    for (let index = 0; index < 4_000; index += 1) {
      const id = `partition_bound_person_${index}`;
      state.persons[id] = personFixture({
        id,
        agencyId: world.agencyId,
        name: `Bounded Person ${index}`,
        emails: [`bounded-${index}@example.test`],
        phones: [{ value: `+44 7701 ${String(index).padStart(6, "0")}` }],
      });
      const clientId = `partition_bound_client_${index}`;
      state.clients[clientId] = clientFixture({
        id: clientId,
        agencyId: world.agencyId,
        personId: id,
        relationshipId: `partition_bound_relationship_${index}`,
        name: `Bounded Client ${index}`,
      });
    }
    Object.defineProperty(state.tasks, "descriptor_bound_accessor", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("bounded descriptor discovery executed an accessor");
      },
    });
  });

  const maxValues = 512;
  const result = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId, { maxValues })!;
  assert.equal(getterCalls, 0);
  assert.equal(result.work.valuesVisited, maxValues, "the shared meter never increments beyond its configured cap");
  assert.ok(result.incompleteReasons.includes("value-limit"));
  assert.throws(
    () => exportsApi.subjectAccessExportJson(result),
    (error: unknown) => error instanceof exportsApi.SubjectAccessExportIncompleteError,
  );
});

test("free-text inspection is linearly bounded at 10k and 100k characters", async () => {
  const world = await seedWorld();
  const makeText = (length: number) => "x".repeat(length - world.personId.length) + world.personId;
  storeRows("tasks", {
    linear_probe: { id: "linear_probe", agencyId: world.agencyId, notes: makeText(10_000) },
  });
  const small = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  realStorage.mutate(state => {
    (state.tasks.linear_probe as unknown as Record<string, unknown>).notes = makeText(100_000);
  });
  const large = exportsApi.collectSubjectAccessExport(world.agencyId, world.personId)!;
  assert.deepEqual(small.incompleteReasons, []);
  assert.deepEqual(large.incompleteReasons, []);
  assert.ok(large.work.charactersInspected > small.work.charactersInspected);
  assert.ok(large.work.charactersInspected < small.work.charactersInspected * 12, "10x input must remain within a linear work bound");
});

test("route uses one generic request gate and no-store for every body, auth and request refusal", async () => {
  const world = await seedWorld();
  const unverified = makeRequest(world, {});
  const otherTenant = makeRequest(world, { agencyId: world.otherAgencyId, verify: true });
  const mismatch = makeRequest(world, { personId: world.otherPersonId, verify: true });
  const wrongKind = makeRequest(world, { kind: "erasure", verify: true });
  const closed = makeRequest(world, { verify: true });
  const refused = makeRequest(world, { verify: true });
  realStorage.mutate(state => {
    state.subjectRequests[closed.id].fulfilledAt = Date.now();
    state.subjectRequests[closed.id].fulfilledBy = world.ownerId;
    state.subjectRequests[refused.id].refusedAt = Date.now();
    state.subjectRequests[refused.id].refusalReason = "Manifestly unfounded.";
  });

  const refusals: Response[] = [];
  for (const requestId of [unverified.id, otherTenant.id, mismatch.id, wrongKind.id, closed.id, refused.id, "dsar_missing"]) {
    refusals.push(await post(world.token, { requestId, personId: world.personId }));
  }
  for (const response of refusals) {
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { ok: false, error: "request_not_ready" });
    assertNoStore(response);
  }

  const beforeBodyRefusals = activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length;
  const malformed = await route.POST(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: signedMutationHeaders(),
    body: "{",
  }));
  assert.equal(malformed.status, 400);
  assertNoStore(malformed);
  const oversized = await route.POST(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: signedMutationHeaders(),
    body: `{"requestId":"${"x".repeat(4_200)}","personId":"${world.personId}"}`,
  }));
  assert.equal(oversized.status, 413);
  assertNoStore(oversized);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length, beforeBodyRefusals,
    "malformed and oversized bodies are refused before auth or mutation work");
  const extraAgency = await post(world.token, { requestId: unverified.id, personId: world.personId, agencyId: world.otherAgencyId });
  assert.equal(extraAgency.status, 400, "the request body cannot name a tenant");
  assertNoStore(extraAgency);
  const malformedReview = await put(world.token, {
    requestId: unverified.id,
    personId: world.personId,
    preparedExportDigest: "not-a-digest",
    reviewEvidenceId: "review-1",
  });
  assert.equal(malformedReview.status, 400);
  assertNoStore(malformedReview);
  const oversizedDelivery = await route.PATCH(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "PATCH",
    headers: signedMutationHeaders(),
    body: JSON.stringify({
      requestId: unverified.id,
      personId: world.personId,
      preparedExportDigest: "a".repeat(64),
      deliveryMethod: "other",
      deliveryEvidenceId: "x".repeat(4_200),
    }),
  }));
  assert.equal(oversizedDelivery.status, 413);
  assertNoStore(oversizedDelivery);

  const anonymousReady = makeRequest(world, { verify: true });
  const anonymous = await withRequestScope({}, () => route.POST(new NextRequest("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: signedMutationHeaders(),
    body: JSON.stringify({ requestId: anonymousReady.id, personId: world.personId }),
  })));
  assert.equal(anonymous.status, 401);
  assertNoStore(anonymous);
});

test("POST, PUT and PATCH require a valid signed double-submit CSRF token before mutation", async () => {
  const world = await seedWorld();
  const ready = makeRequest(world, { verify: true });
  const digest = "a".repeat(64);
  const cases = [
    {
      method: "POST",
      body: { requestId: ready.id, personId: world.personId },
      call: (request: InstanceType<typeof NextRequest>) => route.POST(request),
    },
    {
      method: "PUT",
      body: { requestId: ready.id, personId: world.personId, preparedExportDigest: digest, reviewEvidenceId: "review-csrf" },
      call: (request: InstanceType<typeof NextRequest>) => route.PUT(request),
    },
    {
      method: "PATCH",
      body: { requestId: ready.id, personId: world.personId, preparedExportDigest: digest, deliveryMethod: "other", deliveryEvidenceId: "delivery-csrf" },
      call: (request: InstanceType<typeof NextRequest>) => route.PATCH(request),
    },
  ] as const;
  for (const candidate of cases) {
    const response = await withSession(world.token, () => candidate.call(new NextRequest(
      "http://localhost/api/portal/governance/subject-access",
      { method: candidate.method, headers: { "content-type": "application/json" }, body: JSON.stringify(candidate.body) },
    )));
    assert.equal(response.status, 403, `${candidate.method} must reject a missing CSRF proof`);
    assert.deepEqual(await response.json(), { ok: false, error: "csrf_missing" });
    assertNoStore(response);
  }

  const cookieToken = csrf.signCsrfToken().token;
  const headerToken = csrf.signCsrfToken().token;
  const mismatch = await withSession(world.token, () => route.POST(new NextRequest(
    "http://localhost/api/portal/governance/subject-access",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": headerToken,
        cookie: `${csrf.CSRF_COOKIE_NAME}=${cookieToken}`,
      },
      body: JSON.stringify({ requestId: ready.id, personId: world.personId }),
    },
  )));
  assert.equal(mismatch.status, 403);
  assert.deepEqual(await mismatch.json(), { ok: false, error: "csrf_mismatch" });
  assert.equal(requests.findSubjectRequest(world.agencyId, ready.id)?.preparedExportDigest, undefined);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length, 0);
});

test("dedicated DSAR keys rotate through current+previous without rewriting exact replay evidence and retire fail closed", async () => {
  const world = await seedWorld();
  const ready = makeRequest(world, { kind: "portability", verify: true });

  const prepared = await post(world.token, { requestId: ready.id, personId: world.personId });
  assert.equal(prepared.status, 200);
  const preparedJson = await prepared.text();
  const digest = prepared.headers.get("x-subject-access-digest")!;
  const stagedUnderA = requests.findSubjectRequest(world.agencyId, ready.id)!;
  assert.match(stagedUnderA.preparedExportIntegrityKeyId ?? "", /^dsar_[a-f0-9]{24}$/);
  assert.equal(stagedUnderA.preparedExportIntegrityKeyVersion, 1);
  const artifactEvidence = {
    at: stagedUnderA.preparedExportAt,
    by: stagedUnderA.preparedExportBy,
    tag: stagedUnderA.preparedExportIntegrityTag,
    keyId: stagedUnderA.preparedExportIntegrityKeyId,
    keyVersion: stagedUnderA.preparedExportIntegrityKeyVersion,
  };
  realStorage.mutate(state => {
    delete state.subjectRequests[ready.id]!.preparedExportIntegrityKeyId;
    delete state.subjectRequests[ready.id]!.preparedExportIntegrityKeyVersion;
  });
  assert.equal((await post(world.token, { requestId: ready.id, personId: world.personId })).status, 409,
    "legacy metadata cannot silently fall back to PORTAL_SESSION_SECRET");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportIntegrityKeyId = artifactEvidence.keyId;
    state.subjectRequests[ready.id]!.preparedExportIntegrityKeyVersion = artifactEvidence.keyVersion;
  });
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportIntegrityKeyVersion = 2;
  });
  assert.equal((await post(world.token, { requestId: ready.id, personId: world.personId })).status, 409,
    "a forged artifact framing version cannot be replayed");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportIntegrityKeyVersion = artifactEvidence.keyVersion;
  });

  process.env.PORTAL_DSAR_INTEGRITY_KEY = DSAR_KEY_B;
  process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY = DSAR_KEY_A;
  const preparedReplay = await post(world.token, { requestId: ready.id, personId: world.personId });
  assert.equal(preparedReplay.status, 200);
  assert.equal(preparedReplay.headers.get("x-subject-access-replay"), "true");
  assert.equal(await preparedReplay.text(), preparedJson);
  const replayedArtifact = requests.findSubjectRequest(world.agencyId, ready.id)!;
  assert.deepEqual({
    at: replayedArtifact.preparedExportAt,
    by: replayedArtifact.preparedExportBy,
    tag: replayedArtifact.preparedExportIntegrityTag,
    keyId: replayedArtifact.preparedExportIntegrityKeyId,
    keyVersion: replayedArtifact.preparedExportIntegrityKeyVersion,
  }, artifactEvidence, "rotation verifies the old artifact through PREVIOUS without rewriting its evidence");

  const review = await put(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    reviewEvidenceId: "review-rotation-window",
  });
  assert.equal(review.status, 200);
  const reviewBody = await review.json() as { resultId: string };
  const reviewedUnderB = requests.findSubjectRequest(world.agencyId, ready.id)!;
  assert.match(reviewedUnderB.preparedExportReviewIntegrityKeyId ?? "", /^dsar_[a-f0-9]{24}$/);
  assert.notEqual(reviewedUnderB.preparedExportReviewIntegrityKeyId, artifactEvidence.keyId);
  assert.equal(reviewedUnderB.preparedExportReviewIntegrityKeyVersion, 1);
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportReviewIntegrityKeyVersion = 2;
  });
  assert.equal((await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "secure-email",
    deliveryEvidenceId: "delivery-forged-review-version",
  })).status, 409, "a forged review key version cannot authorise delivery");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportReviewIntegrityKeyVersion = 1;
  });

  const delivery = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "secure-email",
    deliveryEvidenceId: "delivery-rotation-window",
  });
  assert.equal(delivery.status, 200);
  const deliveryBody = await delivery.json() as { resultId: string };
  const deliveredUnderB = requests.findSubjectRequest(world.agencyId, ready.id)!;
  assert.equal(deliveredUnderB.deliveryIntegrityKeyId, reviewedUnderB.preparedExportReviewIntegrityKeyId);
  assert.equal(deliveredUnderB.deliveryIntegrityKeyVersion, 1);
  assert.equal(deliveredUnderB.preparedExportJson, undefined);
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.deliveryIntegrityKeyVersion = 2;
  });
  assert.equal((await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "secure-email",
    deliveryEvidenceId: "delivery-rotation-window",
  })).status, 409, "a forged delivery key version cannot replay a completed result");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.deliveryIntegrityKeyVersion = 1;
  });

  process.env.PORTAL_DSAR_INTEGRITY_KEY = DSAR_KEY_C;
  process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY = DSAR_KEY_B;
  const reviewReplay = await put(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    reviewEvidenceId: "review-rotation-window",
  });
  assert.equal(reviewReplay.status, 200, "the persisted B review remains verifiable after B moves to PREVIOUS");
  assert.equal((await reviewReplay.json() as { resultId: string }).resultId, reviewBody.resultId);
  const deliveryReplay = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "secure-email",
    deliveryEvidenceId: "delivery-rotation-window",
  });
  assert.equal(deliveryReplay.status, 200, "the persisted B delivery remains verifiable after B moves to PREVIOUS");
  assert.equal((await deliveryReplay.json() as { resultId: string }).resultId, deliveryBody.resultId);
  const stable = requests.findSubjectRequest(world.agencyId, ready.id)!;

  delete process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY;
  for (const response of [
    await put(world.token, {
      requestId: ready.id,
      personId: world.personId,
      preparedExportDigest: digest,
      reviewEvidenceId: "review-rotation-window",
    }),
    await patch(world.token, {
      requestId: ready.id,
      personId: world.personId,
      preparedExportDigest: digest,
      deliveryMethod: "secure-email",
      deliveryEvidenceId: "delivery-rotation-window",
    }),
  ]) {
    assert.equal(response.status, 503, "a retired signing key is an opaque operational failure, never an unsafe fallback");
    assert.deepEqual(await response.json(), { ok: false, error: "export_failed" });
    assertNoStore(response);
  }
  assert.deepEqual(requests.findSubjectRequest(world.agencyId, ready.id), stable, "failed verification cannot rewrite durable evidence");
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).filter(entry => entry.action === "subject_access.export-prepared").length, 1);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).filter(entry => entry.action === "subject_access.review-recorded").length, 1);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).filter(entry => entry.action === "subject_access.delivered").length, 1);
});

test("missing or malformed dedicated DSAR configuration refuses preparation without state or activity mutation", async () => {
  for (const key of [undefined, "not-base64url!", DSAR_KEY_A] as const) {
    const world = await seedWorld();
    const ready = makeRequest(world, { verify: true });
    if (key === undefined) delete process.env.PORTAL_DSAR_INTEGRITY_KEY;
    else process.env.PORTAL_DSAR_INTEGRITY_KEY = key;
    if (key === DSAR_KEY_A) process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY = DSAR_KEY_A;
    const before = requests.findSubjectRequest(world.agencyId, ready.id);
    const response = await post(world.token, { requestId: ready.id, personId: world.personId });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "export_failed" });
    assertNoStore(response);
    assert.deepEqual(requests.findSubjectRequest(world.agencyId, ready.id), before);
    assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length, 0);
    process.env.PORTAL_DSAR_INTEGRITY_KEY = DSAR_KEY_A;
    delete process.env.PORTAL_DSAR_INTEGRITY_PREVIOUS_KEY;
  }
});

test("preparation is replayable but only evidenced review and delivery fulfil; failures roll back", async () => {
  const world = await seedWorld();
  const ready = makeRequest(world, { kind: "portability", verify: true });
  const success = await post(world.token, { requestId: ready.id, personId: world.personId });
  assert.equal(success.status, 200);
  assertNoStore(success);
  assert.match(success.headers.get("content-disposition") ?? "", new RegExp(world.personId));
  const successText = await success.text();
  const body = JSON.parse(successText) as { subject: { personId: string }; reviewRequired: unknown };
  assert.equal(body.subject.personId, world.personId);
  assert.ok(body.reviewRequired);
  const digest = success.headers.get("x-subject-access-digest")!;
  const staged = requests.findSubjectRequest(world.agencyId, ready.id);
  assert.equal(staged?.fulfilledAt, undefined, "preparation is not delivery");
  assert.equal(staged?.preparedExportDigest, digest);
  assert.equal(staged?.preparedExportJson, successText, "the exact bounded bytes are staged for lost-response replay");
  assert.match(staged?.preparedExportIntegrityTag ?? "", /^[a-f0-9]{64}$/, "staged bytes and manifest carry a server-authenticated binding");
  const events = activity.listActivity({ agencyId: world.agencyId, limit: 100 })
    .filter(entry => entry.action === "subject_access.export-prepared");
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata?.requestId, ready.id);
  assert.equal(JSON.stringify(events[0].metadata).includes(SUBJECT_EMAIL), false, "audit metadata is identifier-only");

  const replay = await post(world.token, { requestId: ready.id, personId: world.personId });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("x-subject-access-replay"), "true");
  assert.equal(await replay.text(), successText, "a disconnect can replay the exact staged artifact");
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).filter(entry => entry.action === "subject_access.export-prepared").length, 1);

  const prematureDelivery = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-before-review",
  });
  assert.equal(prematureDelivery.status, 409, "nonzero review totals keep the request open");
  assertNoStore(prematureDelivery);

  const reviewed = await put(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    reviewEvidenceId: "review-case-1",
  });
  assert.equal(reviewed.status, 200);
  assertNoStore(reviewed);
  const reviewedBody = await reviewed.json() as { replay: boolean; resultId: string };
  assert.equal(reviewedBody.replay, false);
  assert.match(reviewedBody.resultId, /^[a-f0-9]{64}$/);
  const reviewReplay = await put(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    reviewEvidenceId: "review-case-1",
  });
  assert.equal(reviewReplay.status, 200);
  assert.deepEqual(await reviewReplay.json(), {
    ok: true, status: "review-recorded", replay: true, resultId: reviewedBody.resultId,
  });
  const changedReviewReplay = await put(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    reviewEvidenceId: "review-case-changed",
  });
  assert.equal(changedReviewReplay.status, 409, "changed review evidence is not an idempotent replay");
  assert.equal(
    activity.listActivity({ agencyId: world.agencyId, limit: 100 }).filter(entry => entry.action === "subject_access.review-recorded").length,
    1,
    "an exact review replay cannot duplicate audit evidence",
  );
  assert.equal(requests.findSubjectRequest(world.agencyId, ready.id)?.fulfilledAt, undefined);

  const reviewedState = requests.findSubjectRequest(world.agencyId, ready.id)!;
  const stagedJson = reviewedState.preparedExportJson!;
  realStorage.mutate(state => {
    state.subjectRequests[ready.id].preparedExportJson = `${stagedJson} `;
  });
  const contentTamper = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-content-tamper",
  });
  assert.equal(contentTamper.status, 409, "delivery recomputes the digest from the exact stored reviewed bytes");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id].preparedExportJson = stagedJson;
    state.subjectRequests[ready.id].preparedExportReviewResultId = "a".repeat(64);
  });
  const arbitraryReviewResult = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-arbitrary-review-result",
  });
  assert.equal(arbitraryReviewResult.status, 409, "an arbitrary 64-hex review result is not evidence");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id].preparedExportReviewResultId = reviewedBody.resultId;
  });

  const tamperedManifest = JSON.parse(stagedJson) as {
    subject: { emails: string[] };
    reviewRequired: Record<string, number>;
    completeness: { status: string; omittedFields: Record<string, number> };
  };
  tamperedManifest.subject.emails.push("mallory.third.party@example.test");
  for (const key of Object.keys(tamperedManifest.reviewRequired)) tamperedManifest.reviewRequired[key] = 0;
  tamperedManifest.completeness.status = "automatic-safe-subset-complete";
  tamperedManifest.completeness.omittedFields.tasks = Math.max(1, tamperedManifest.completeness.omittedFields.tasks ?? 0);
  const tamperedJson = JSON.stringify(tamperedManifest);
  const tamperedDigest = crypto.createHash("sha256").update(tamperedJson, "utf8").digest("hex");
  const manifestOnlyRequest = makeRequest(world, { verify: true });
  assert.throws(
    () => requests.recordPreparedSubjectAccessExport(
      world.agencyId,
      manifestOnlyRequest.id,
      world.personId,
      world.ownerId,
      {
        json: tamperedJson,
        digest: tamperedDigest,
        generatedAt: reviewedState.preparedExportGeneratedAt!,
        recordCount: reviewedState.preparedExportRecordCount!,
        reviewCount: 0,
        byteLength: Buffer.byteLength(tamperedJson, "utf8"),
      },
    ),
    (error: unknown) => error instanceof requests.SubjectAccessRequestGateError,
    "detailed completeness counts must reconcile with the top-level review total",
  );
  realStorage.mutate(state => {
    Object.assign(state.subjectRequests[ready.id], {
      preparedExportJson: tamperedJson,
      preparedExportDigest: tamperedDigest,
      preparedExportByteLength: Buffer.byteLength(tamperedJson, "utf8"),
      preparedExportReviewCount: 0,
      preparedExportReviewResolvedDigest: tamperedDigest,
    });
  });
  const tamperedReplay = await post(world.token, { requestId: ready.id, personId: world.personId });
  assert.equal(tamperedReplay.status, 409, "POST replay authenticates stored bytes instead of returning a consistently rehashed forgery");
  const tamperedDelivery = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: tamperedDigest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-rehashed-manifest-tamper",
  });
  assert.equal(tamperedDelivery.status, 409, "delivery rejects injected PII and contradictory recomputed manifest totals");
  realStorage.mutate(state => {
    Object.assign(state.subjectRequests[ready.id], {
      preparedExportJson: stagedJson,
      preparedExportDigest: digest,
      preparedExportByteLength: reviewedState.preparedExportByteLength,
      preparedExportReviewCount: reviewedState.preparedExportReviewCount,
      preparedExportReviewResolvedDigest: digest,
    });
  });

  const forgedReviewRequest = makeRequest(world, { verify: true });
  const forgedPreparation = await post(world.token, { requestId: forgedReviewRequest.id, personId: world.personId });
  assert.equal(forgedPreparation.status, 200);
  const forgedDigest = forgedPreparation.headers.get("x-subject-access-digest")!;
  const unkeyedPublicResult = crypto.createHash("sha256").update([
    "aqua-subject-access-review-v1",
    world.agencyId,
    forgedReviewRequest.id,
    world.personId,
    forgedDigest,
    "forged-review-evidence",
  ].join("\0"), "utf8").digest("hex");
  realStorage.mutate(state => {
    Object.assign(state.subjectRequests[forgedReviewRequest.id], {
      preparedExportReviewResolvedAt: Date.now(),
      preparedExportReviewResolvedBy: world.ownerId,
      preparedExportReviewResolvedDigest: forgedDigest,
      preparedExportReviewEvidenceId: "forged-review-evidence",
      preparedExportReviewResultId: unkeyedPublicResult,
    });
  });
  const forgedDelivery = await patch(world.token, {
    requestId: forgedReviewRequest.id,
    personId: world.personId,
    preparedExportDigest: forgedDigest,
    deliveryMethod: "secure-email",
    deliveryEvidenceId: "forged-review-delivery",
  });
  assert.equal(forgedDelivery.status, 409, "a publicly recomputed deterministic hash cannot forge server-authenticated review evidence");
  assert.equal(requests.findSubjectRequest(world.agencyId, forgedReviewRequest.id)?.fulfilledAt, undefined);
  assert.ok(requests.findSubjectRequest(world.agencyId, forgedReviewRequest.id)?.preparedExportJson,
    "a failed proof check preserves the staged artifact and open request");

  const delivered = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-case-1",
  });
  assert.equal(delivered.status, 200);
  assertNoStore(delivered);
  const deliveredBody = await delivered.json() as { replay: boolean; resultId: string };
  assert.equal(deliveredBody.replay, false);
  assert.match(deliveredBody.resultId, /^[a-f0-9]{64}$/);
  const fulfilled = requests.findSubjectRequest(world.agencyId, ready.id);
  assert.ok(fulfilled?.fulfilledAt);
  assert.equal(fulfilled?.preparedExportJson, undefined, "staged PII is cleared after delivery");
  assert.equal(fulfilled?.deliveryResultId, deliveredBody.resultId);

  const reviewAfterDelivery = await put(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    reviewEvidenceId: "review-case-1",
  });
  assert.equal(reviewAfterDelivery.status, 200, "the durable exact review result remains replayable after staged-byte deletion");
  assert.deepEqual(await reviewAfterDelivery.json(), {
    ok: true, status: "review-recorded", replay: true, resultId: reviewedBody.resultId,
  });

  const deliveryReplay = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-case-1",
  });
  assert.equal(deliveryReplay.status, 200, "a lost success response can replay after staged bytes are deleted");
  assert.deepEqual(await deliveryReplay.json(), {
    ok: true, status: "fulfilled", replay: true, resultId: deliveredBody.resultId,
  });
  assert.equal(requests.findSubjectRequest(world.agencyId, ready.id)?.fulfilledAt, fulfilled?.fulfilledAt);
  assert.equal(
    activity.listActivity({ agencyId: world.agencyId, limit: 100 }).filter(entry => entry.action === "subject_access.delivered").length,
    1,
    "delivery replay cannot duplicate audit evidence",
  );
  const fulfilledIntegrityTag = fulfilled?.preparedExportIntegrityTag;
  const fulfilledRecordCount = fulfilled?.preparedExportRecordCount;
  assert.match(fulfilledIntegrityTag ?? "", /^[a-f0-9]{64}$/);
  assert.equal(typeof fulfilledRecordCount, "number");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportIntegrityTag = "f".repeat(64);
  });
  const tamperedIntegrityReplay = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-case-1",
  });
  assert.equal(tamperedIntegrityReplay.status, 409,
    "retained delivery evidence cannot replay after the authenticated artifact binding is changed");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportIntegrityTag = fulfilledIntegrityTag;
    state.subjectRequests[ready.id]!.preparedExportRecordCount = (fulfilledRecordCount ?? 0) + 1;
  });
  const tamperedManifestReplay = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-case-1",
  });
  assert.equal(tamperedManifestReplay.status, 409,
    "retained delivery evidence cannot replay after its authenticated manifest totals are changed");
  realStorage.mutate(state => {
    state.subjectRequests[ready.id]!.preparedExportRecordCount = fulfilledRecordCount;
  });
  for (const mismatch of [
    { preparedExportDigest: "f".repeat(64), deliveryMethod: "verified-portal", deliveryEvidenceId: "delivery-case-1" },
    { preparedExportDigest: digest, deliveryMethod: "secure-email", deliveryEvidenceId: "delivery-case-1" },
    { preparedExportDigest: digest, deliveryMethod: "verified-portal", deliveryEvidenceId: "delivery-case-2" },
  ]) {
    const refusedReplay = await patch(world.token, { requestId: ready.id, personId: world.personId, ...mismatch });
    assert.equal(refusedReplay.status, 409, "a changed digest, method or evidence is not an idempotent replay");
  }

  const collisionA = makeRequest(world, { verify: true });
  const collisionB = makeRequest(world, { verify: true });
  const collisionPreparedA = await post(world.token, { requestId: collisionA.id, personId: world.personId });
  const collisionPreparedB = await post(world.token, { requestId: collisionB.id, personId: world.personId });
  assert.equal(collisionPreparedA.status, 200);
  assert.equal(collisionPreparedB.status, 200);
  const collisionDigestA = collisionPreparedA.headers.get("x-subject-access-digest")!;
  const collisionDigestB = collisionPreparedB.headers.get("x-subject-access-digest")!;
  const reviewCollisionResponses = await Promise.all([
    put(world.token, {
      requestId: collisionA.id,
      personId: world.personId,
      preparedExportDigest: collisionDigestA,
      reviewEvidenceId: "review-shared-race",
    }),
    put(world.token, {
      requestId: collisionB.id,
      personId: world.personId,
      preparedExportDigest: collisionDigestB,
      reviewEvidenceId: "review-shared-race",
    }),
  ]);
  assert.deepEqual(reviewCollisionResponses.map(response => response.status).sort(), [200, 409],
    "one review evidence identity can commit to only one raced request");
  const reviewCollisionRows = [
    { request: collisionA, digest: collisionDigestA },
    { request: collisionB, digest: collisionDigestB },
  ];
  const rejectedReviewCollision = reviewCollisionRows.find(({ request }) => (
    !requests.findSubjectRequest(world.agencyId, request.id)?.preparedExportReviewResolvedAt
  ));
  assert.ok(rejectedReviewCollision, "one review collision remains unresolved");
  if (rejectedReviewCollision) {
    const review = await put(world.token, {
      requestId: rejectedReviewCollision.request.id,
      personId: world.personId,
      preparedExportDigest: rejectedReviewCollision.digest,
      reviewEvidenceId: `review-${rejectedReviewCollision.request.id}`,
    });
    assert.equal(review.status, 200);
  }
  const collisionResponses = await Promise.all([
    patch(world.token, {
      requestId: collisionA.id,
      personId: world.personId,
      preparedExportDigest: collisionDigestA,
      deliveryMethod: "verified-portal",
      deliveryEvidenceId: "delivery-shared-race",
    }),
    patch(world.token, {
      requestId: collisionB.id,
      personId: world.personId,
      preparedExportDigest: collisionDigestB,
      deliveryMethod: "verified-portal",
      deliveryEvidenceId: "delivery-shared-race",
    }),
  ]);
  assert.deepEqual(collisionResponses.map(response => response.status).sort(), [200, 409], "one evidence identity can commit only one raced disclosure");
  const collisionStates = [
    requests.findSubjectRequest(world.agencyId, collisionA.id),
    requests.findSubjectRequest(world.agencyId, collisionB.id),
  ];
  assert.equal(collisionStates.filter(request => request?.fulfilledAt).length, 1);
  const rejectedCollision = collisionStates.find(request => !request?.fulfilledAt);
  assert.ok(rejectedCollision?.preparedExportJson, "the rejected collision remains open with its staged bytes intact");

  const rollback = makeRequest(world, { verify: true });
  const beforeActivity = activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length;
  failNextCommit = true;
  const failed = await post(world.token, { requestId: rollback.id, personId: world.personId });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { ok: false, error: "export_failed" });
  assertNoStore(failed);
  const unchanged = requests.findSubjectRequest(world.agencyId, rollback.id);
  assert.ok(unchanged?.identityVerifiedAt);
  assert.equal(unchanged?.fulfilledAt, undefined, "failure before durable commit leaves the request open");
  assert.equal(unchanged?.preparedExportDigest, undefined, "the staged artifact rolls back too");
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length, beforeActivity, "activity rolls back with preparation");

  const deliveryRollback = makeRequest(world, { verify: true });
  const preparedResponse = await post(world.token, { requestId: deliveryRollback.id, personId: world.personId });
  const deliveryDigest = preparedResponse.headers.get("x-subject-access-digest")!;
  await put(world.token, {
    requestId: deliveryRollback.id,
    personId: world.personId,
    preparedExportDigest: deliveryDigest,
    reviewEvidenceId: "review-before-delivery-failure",
  });
  const beforeDeliveryActivity = activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length;
  failNextCommit = true;
  const failedDelivery = await patch(world.token, {
    requestId: deliveryRollback.id,
    personId: world.personId,
    preparedExportDigest: deliveryDigest,
    deliveryMethod: "secure-email",
    deliveryEvidenceId: "delivery-storage-failure",
  });
  assert.equal(failedDelivery.status, 503);
  assertNoStore(failedDelivery);
  const afterFailedDelivery = requests.findSubjectRequest(world.agencyId, deliveryRollback.id);
  assert.equal(afterFailedDelivery?.fulfilledAt, undefined);
  assert.equal(afterFailedDelivery?.deliveredAt, undefined);
  assert.ok(afterFailedDelivery?.preparedExportJson, "rollback retains the replayable prepared file");
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length, beforeDeliveryActivity);
});

test("an oversized serialised export fails explicitly before any request or activity transition", async () => {
  const world = await seedWorld();
  const ready = makeRequest(world, { verify: true });
  realStorage.mutate(state => {
    for (let index = 0; index < 15_000; index += 1) {
      const id = `cap_${String(index).padStart(5, "0")}`;
      state.tasks[id] = {
        id,
        agencyId: world.agencyId,
        personId: world.personId,
        title: "Subject Person",
        status: "todo",
        priority: "normal",
        createdBy: world.ownerId,
        createdAt: 1_725_555_000_123,
        updatedAt: 1_725_555_000_123,
      };
    }
  });
  const beforeActivity = activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length;
  const response = await post(world.token, { requestId: ready.id, personId: world.personId });
  assert.equal(response.status, 422);
  assertNoStore(response);
  assert.deepEqual(await response.json(), { ok: false, error: "export_incomplete", reasons: ["output-size-limit"] });
  const unchanged = requests.findSubjectRequest(world.agencyId, ready.id);
  assert.equal(unchanged?.preparedExportDigest, undefined);
  assert.equal(unchanged?.fulfilledAt, undefined);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 100 }).length, beforeActivity);
});
