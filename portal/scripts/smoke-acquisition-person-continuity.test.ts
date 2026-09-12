import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");
type InstallsMod = typeof import("../src/server/pluginInstalls");
type PluginStorageMod = typeof import("../src/lib/server/pluginStorage");
type PipelinesMod = typeof import("../src/server/pipelines");
type PersonsMod = typeof import("../src/server/persons");
type FoundationMod = typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
type HandlersMod = typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
type SubscribersMod = typeof import("../src/built-ins/modules/leads-pipeline/src/server/subscribers");

let storage: StorageMod;
let tenants: TenantsMod;
let installs: InstallsMod;
let pluginStorage: PluginStorageMod;
let pipelines: PipelinesMod;
let persons: PersonsMod;
let foundation: FoundationMod;
let handlers: HandlersMod;
let subscribers: SubscribersMod;
let pluginServices: Record<string, unknown>;

before(async () => {
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  pipelines = await import("../src/server/pipelines");
  persons = await import("../src/server/persons");
  foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  handlers = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  subscribers = await import("../src/built-ins/modules/leads-pipeline/src/server/subscribers");
  const shared = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
  foundation.registerLeadsPipelineFoundation({
    tenant: shared.tenantPort,
    activity: shared.activityPort,
    events: shared.eventBusPort,
    pluginInstalls: shared.pluginInstallStorePort,
    pipeline: leadsPorts.pipelinePort,
    personIdentity: leadsPorts.personIdentityPort,
  });
  pluginServices = {
    clients: {},
    pluginInstalls: {},
    pluginRuntime: {},
    registry: {},
    phases: {},
    activity: shared.activityPort,
    events: shared.eventBusPort,
    variants: {},
    tenant: shared.tenantPort,
  };
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

let sequence = 0;

function makeWorld(label = "Identity continuity") {
  sequence += 1;
  const agency = tenants.createAgency({
    name: `${label} ${sequence}`,
    ownerEmail: `owner-${sequence}@example.test`,
  });
  pipelines.seedDefaultPipelines(agency.id);
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: "person-continuity-smoke",
  });
  const scopedStorage = pluginStorage.makePluginStorage(install.id);
  const container = foundation.containerFor({
    agencyId: agency.id as never,
    storage: scopedStorage as never,
  });
  const ctx = {
    agencyId: agency.id,
    actor: "user_identity_smoke",
    install,
    storage: scopedStorage,
    services: pluginServices,
  } as never;
  return { agency, install, scopedStorage, container, ctx };
}

function personForLead(agencyId: string, lead: { id: string; personId?: string }) {
  assert.ok(lead.personId, `Lead ${lead.id} did not store personId`);
  const person = persons.getPerson(agencyId, lead.personId);
  assert.ok(person, `Lead ${lead.id} points outside its agency`);
  assert.equal(person.facets.leadId, lead.id);
  return person;
}

describe("acquisition writers converge on canonical Person", { concurrency: false }, () => {
  test("manual, website and CSV Lead writers all stamp one scoped Person and retries do not duplicate", async () => {
    const world = makeWorld();
    const manual = await world.container.leads.upsert({
      email: "manual@example.test",
      name: "Manual Person",
      source: "manual",
    }, "user_identity_smoke" as never);

    await subscribers.promoteFunnelCaptureToLead(world.container.leads, {
      agencyId: world.agency.id as never,
      captureId: "lc_hc_person_continuity",
      email: "website@example.test",
      name: "Website Person",
      phone: "+447700900111",
      source: "website:contact-form",
    }, world.container.prospects);
    const website = await world.container.leads.getByEmail("website@example.test");
    assert.ok(website);

    const imported = await world.container.leads.importCsv({
      text: "email,name,phone,company\ncsv@example.test,CSV Person,+447700900222,CSV Ltd\n",
      filename: "people.csv",
      actor: "user_identity_smoke" as never,
    });
    assert.deepEqual({ imported: imported.imported, updated: imported.updated, skipped: imported.skipped }, {
      imported: 1,
      updated: 0,
      skipped: 0,
    });
    const csv = await world.container.leads.getByEmail("csv@example.test");
    assert.ok(csv);

    personForLead(world.agency.id, manual.lead);
    personForLead(world.agency.id, website);
    personForLead(world.agency.id, csv);
    assert.equal(persons.listPersons(world.agency.id).length, 3);

    const [retryOne, retryTwo] = await Promise.all([
      world.container.leads.upsert({
        email: " MANUAL@example.test ",
        name: "Manual Person",
        source: "manual",
      }, "user_identity_smoke" as never),
      world.container.leads.upsert({
        email: "manual@example.test",
        name: "Manual Person",
        source: "manual",
      }, "user_identity_smoke" as never),
    ]);
    assert.equal(retryOne.lead.id, manual.lead.id);
    assert.equal(retryTwo.lead.id, manual.lead.id);
    assert.equal(retryOne.lead.personId, manual.lead.personId);
    assert.equal(retryTwo.lead.personId, manual.lead.personId);
    assert.equal((await world.container.leads.list()).length, 3);
    assert.equal(persons.listPersons(world.agency.id).length, 3);

    const beforeReads = JSON.stringify(storage.getState());
    await Promise.all([
      world.container.leads.list(),
      world.container.leads.get(manual.lead.id),
      world.container.contacts.list(),
      world.container.contacts.getByPersonId(manual.lead.personId!),
    ]);
    assert.equal(JSON.stringify(storage.getState()), beforeReads, "GET/list identity lookups mutated state");
  });

  test("shared phone numbers do not merge differently named Leads and each retry returns its own Person", async () => {
    const world = makeWorld("Shared switchboard");
    const alice = await world.container.leads.upsert({
      email: "",
      phone: "020 7946 0000",
      name: "Alice Adams",
      company: "Shared Office",
      source: "networking",
    }, "user_identity_smoke" as never);
    const bob = await world.container.leads.upsert({
      email: "",
      phone: "020 7946 0000",
      name: "Bob Brown",
      company: "Shared Office",
      source: "networking",
    }, "user_identity_smoke" as never);

    assert.notEqual(bob.lead.id, alice.lead.id);
    assert.notEqual(bob.lead.personId, alice.lead.personId);
    const bobRetry = await world.container.leads.upsert({
      email: "",
      phone: "+44 20 7946 0000",
      name: "Bob Brown",
      source: "networking",
    }, "user_identity_smoke" as never);
    assert.equal(bobRetry.lead.id, bob.lead.id);
    assert.equal(bobRetry.lead.personId, bob.lead.personId);
    assert.equal((await world.container.leads.list()).length, 2);
    const people = persons.listPersons(world.agency.id);
    assert.equal(people.length, 2);
    assert.ok(people.every(person => person.phones.some(phone => phone.shared === true)));
  });

  test("the same email in two agencies produces isolated People and a foreign Lead cannot be promoted", async () => {
    const ours = makeWorld("Our agency");
    const theirs = makeWorld("Their agency");
    const oursLead = (await ours.container.leads.upsert({
      email: "same@example.test",
      name: "Our Person",
      source: "manual",
    }, "user_identity_smoke" as never)).lead;
    const theirLead = (await theirs.container.leads.upsert({
      email: "same@example.test",
      name: "Their Person",
      source: "manual",
    }, "user_identity_smoke" as never)).lead;

    assert.notEqual(oursLead.personId, theirLead.personId);
    assert.equal(persons.getPerson(ours.agency.id, theirLead.personId!), null);
    assert.equal(persons.getPerson(theirs.agency.id, oursLead.personId!), null);
    await assert.rejects(
      ours.container.contacts.promoteLead(theirLead, "user_identity_smoke" as never),
      /lead_not_found/,
    );
    assert.equal((await ours.container.contacts.list()).length, 0);
  });
});

describe("Person continuity through Contact and client facets", { concurrency: false }, () => {
  test("Prospect qualification starts Person at Lead, then Contact and client facets keep the exact id", async () => {
    const world = makeWorld();
    const prospect = await world.container.prospects.create({
      email: "qualified@example.test",
      phone: "+447700900333",
      name: "Qualified Person",
      company: "Qualified Ltd",
      source: "google-maps",
      qualificationState: "ready",
    }, "user_identity_smoke" as never);
    assert.equal(Object.prototype.hasOwnProperty.call(prospect, "personId"), false);

    const response = await handlers.qualifyProspectHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/prospects/qualify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: prospect.id }),
      },
    ), world.ctx);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await response.json() as {
      prospect: { qualifiedLeadId?: string; personId?: string };
      lead: { id: string; personId?: string };
    };
    assert.equal(body.prospect.qualifiedLeadId, body.lead.id);
    assert.equal(Object.prototype.hasOwnProperty.call(body.prospect, "personId"), false);
    const lead = await world.container.leads.get(body.lead.id);
    assert.ok(lead?.personId);
    const personId = lead.personId;

    const contact = await world.container.contacts.promoteLead(lead, "user_identity_smoke" as never);
    assert.equal(contact.personId, personId);
    assert.equal(contact.promotedFromLeadId, lead.id);
    let person = persons.getPerson(world.agency.id, personId);
    assert.equal(person?.facets.leadId, lead.id);
    assert.equal(person?.facets.contactId, contact.id);

    const client = tenants.createClient(world.agency.id, {
      name: "Qualified Ltd",
      ownerEmail: lead.email,
    });
    const convertedLead = await world.container.leads.recordConversion(
      lead.id,
      client.id,
      "user_identity_smoke" as never,
    );
    const convertedContact = await world.container.contacts.recordClientConversion(
      contact.id,
      client.id,
      "user_identity_smoke" as never,
    );
    assert.equal(convertedLead?.personId, personId);
    assert.equal(convertedContact?.personId, personId);
    person = persons.getPerson(world.agency.id, personId);
    assert.deepEqual(person?.facets.clientIds, [client.id]);
    assert.equal(person?.facets.leadId, lead.id);
    assert.equal(person?.facets.contactId, contact.id);

    const retry = await world.container.contacts.promoteLead(convertedLead!, "user_identity_smoke" as never);
    assert.equal(retry.id, contact.id);
    assert.equal(retry.personId, personId);
    assert.equal((await world.container.contacts.list()).length, 1);
    assert.equal(persons.listPersons(world.agency.id).length, 1);
  });

  test("direct Contact upsert stamps a Person, attaches its facet, and Add to board reuses the person-linked Lead", async () => {
    const world = makeWorld();
    const lead = (await world.container.leads.upsert({
      email: "known@example.test",
      name: "Known Person",
      phone: "+447700900444",
      source: "networking",
    }, "user_identity_smoke" as never)).lead;
    const direct = await world.container.contacts.upsert({
      email: "known@example.test",
      name: "Known Person",
      phone: "+447700900444",
      type: "lead",
      source: "manual-contact",
    }, "user_identity_smoke" as never);
    assert.ok(direct.contact.personId);
    assert.equal(direct.contact.personId, lead.personId);
    assert.equal(persons.getPerson(world.agency.id, lead.personId!)?.facets.contactId, direct.contact.id);

    const reuse = await handlers.addContactToBoardHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/contacts/add-to-board",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: direct.contact.id }),
      },
    ), world.ctx);
    assert.equal(reuse.status, 200, JSON.stringify(await reuse.clone().json()));
    const reuseBody = await reuse.json() as { lead: { id: string; personId?: string }; created: boolean };
    assert.equal(reuseBody.created, false);
    assert.equal(reuseBody.lead.id, lead.id);
    assert.equal(reuseBody.lead.personId, direct.contact.personId);
    assert.equal((await world.container.leads.list()).length, 1);

    const unlinked = await world.container.contacts.upsert({
      email: "new-contact@example.test",
      name: "New Contact",
      type: "lead",
      source: "manual-contact",
    }, "user_identity_smoke" as never);
    const create = await handlers.addContactToBoardHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/contacts/add-to-board",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: unlinked.contact.id }),
      },
    ), world.ctx);
    assert.equal(create.status, 200, JSON.stringify(await create.clone().json()));
    const createBody = await create.json() as { lead: { id: string; personId?: string }; created: boolean };
    assert.equal(createBody.created, true);
    assert.ok(createBody.lead.id);
    assert.equal(createBody.lead.personId, unlinked.contact.personId);

    const customer = await world.container.contacts.upsert({
      email: "customer@example.test",
      name: "Existing Customer",
      type: "customer",
      source: "manual-contact",
    }, "user_identity_smoke" as never);
    const excluded = await handlers.addContactToBoardHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/contacts/add-to-board",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: customer.contact.id }),
      },
    ), world.ctx);
    assert.equal(excluded.status, 422);
  });

  test("Contacts UI uses person-linked Lead ids and opens the selected outreach desk", () => {
    const source = readFileSync(
      "src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx",
      "utf8",
    );
    assert.match(source, /leadByPerson/);
    assert.doesNotMatch(source, /leadEmails/);
    assert.match(source, /Prepare outreach/);
    assert.match(source, /prospecting\?lead=\$\{encodeURIComponent\(outreachLeadId\)\}&mode=/);
    assert.match(source, /router\.push\(`\/portal\/agency\/prospecting\?lead=\$\{encodeURIComponent\(leadId\)\}&mode=\$\{mode\}`\)/);
  });
});

describe("Won preflight", { concurrency: false }, () => {
  test("a phone-only Lead remains in its original card column and stage when Won promotion is invalid", async () => {
    const world = makeWorld();
    const created = await world.container.leads.upsert({
      email: "",
      name: "Phone Only",
      phone: "+447700900555",
      source: "networking",
    }, "user_identity_smoke" as never);
    const leadBefore = await world.container.leads.get(created.lead.id);
    assert.ok(leadBefore?.pipelineCardId);
    const pipeline = pipelines.getPipelineBySlug(world.agency.id, "leads");
    assert.ok(pipeline);
    const won = pipeline.columns.find(column => column.label.toLowerCase() === "won");
    assert.ok(won);
    const cardBefore = pipelines.listCardsByAgency(world.agency.id)
      .find(card => card.id === leadBefore.pipelineCardId);
    assert.ok(cardBefore);
    const journeyBefore = JSON.stringify(leadBefore.journeyEvents);

    const response = await handlers.updateLeadStatusHandler(new Request(
      "http://localhost/api/portal/leads-pipeline/leads/status",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: leadBefore.id, columnId: won.id }),
      },
    ), world.ctx);
    assert.equal(response.status, 422);

    const leadAfter = await world.container.leads.get(leadBefore.id);
    const cardAfter = pipelines.listCardsByAgency(world.agency.id)
      .find(card => card.id === cardBefore.id);
    assert.equal(leadAfter?.currentStageId, leadBefore.currentStageId);
    assert.equal(leadAfter?.stageEnteredAt, leadBefore.stageEnteredAt);
    assert.equal(leadAfter?.pipelineCardId, leadBefore.pipelineCardId);
    assert.equal(JSON.stringify(leadAfter?.journeyEvents), journeyBefore);
    assert.equal(cardAfter?.columnId, cardBefore.columnId);
    assert.equal((await world.container.contacts.list()).length, 0);
  });
});
