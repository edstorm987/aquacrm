// Subject-access export security and recovery.
//
// These are adversarial invariants, not examples of a happy-path search:
// arbitrary strings and actor/assignee references never become ownership;
// typed client/person lineage remains complete; co-mingled PII is either
// redacted deterministically or withheld for review; and a request is not
// fulfilled unless the export and its activity evidence commit together.

process.env.PORTAL_BACKEND = "memory";
process.env.NODE_ENV = "test";
process.env.PORTAL_SESSION_SECRET = "subject-access-export-security-smoke-secret";

import { withRequestScope, withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
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
const exportsApi = require("../src/lib/server/compliance/subjectAccessExport") as typeof import("../src/lib/server/compliance/subjectAccessExport");
const requests = require("../src/lib/server/compliance/subjectRequests") as typeof import("../src/lib/server/compliance/subjectRequests");
const tenants = require("../src/server/tenants") as typeof import("../src/server/tenants");
const users = require("../src/server/users") as typeof import("../src/server/users");
const activity = require("../src/server/activity") as typeof import("../src/server/activity");
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
    classification: "client",
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

function post(token: string, body: unknown, raw = false): Promise<Response> {
  return withSession(token, () => route.POST(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  })));
}

function put(token: string, body: unknown): Promise<Response> {
  return withSession(token, () => route.PUT(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })));
}

function patch(token: string, body: unknown): Promise<Response> {
  return withSession(token, () => route.PATCH(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
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
      sourceType: "manual",
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
      features: { invoices: true },
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
    from: "sales", to: "existing-client", at: occurredAt, by: "usr_operator", sourceType: "manual", sourceId: `source_${sequence}`,
  }]);
  assert.deepEqual(person.record, [{ id: `person_record_${sequence}`, kind: "meeting", at: occurredAt, createdAt: occurredAt }]);

  const ledger = result.found.clientRecordLedger ?? [];
  const safeLedger = ledger.find(row => (row as { id?: string }).id === `safe_ledger_${sequence}`) as Record<string, unknown>;
  assert.equal(safeLedger.title, "Growth plan");
  assert.equal(safeLedger.body, "3 milestones · GBP 100.00 paid of GBP 300.00");
  assert.equal(safeLedger.occurredAt, occurredAt, "typed dates remain numeric and unmodified");
  assert.equal(ledger.some(row => (row as { id?: string }).id === `unsafe_ledger_${sequence}`), false);
  assert.equal(ledger.some(row => (row as { id?: string }).id === `unsafe_phone_ledger_${sequence}`), false);

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
  const malformed = await route.POST(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }));
  assert.equal(malformed.status, 400);
  assertNoStore(malformed);
  const oversized = await route.POST(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  const oversizedDelivery = await route.PATCH(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
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
  const anonymous = await withRequestScope({}, () => route.POST(new Request("http://localhost/api/portal/governance/subject-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: anonymousReady.id, personId: world.personId }),
  })));
  assert.equal(anonymous.status, 401);
  assertNoStore(anonymous);
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
  assert.equal(requests.findSubjectRequest(world.agencyId, ready.id)?.fulfilledAt, undefined);

  const delivered = await patch(world.token, {
    requestId: ready.id,
    personId: world.personId,
    preparedExportDigest: digest,
    deliveryMethod: "verified-portal",
    deliveryEvidenceId: "delivery-case-1",
  });
  assert.equal(delivered.status, 200);
  assertNoStore(delivered);
  assert.ok(requests.findSubjectRequest(world.agencyId, ready.id)?.fulfilledAt);
  assert.equal(requests.findSubjectRequest(world.agencyId, ready.id)?.preparedExportJson, undefined, "staged PII is cleared after delivery");

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
