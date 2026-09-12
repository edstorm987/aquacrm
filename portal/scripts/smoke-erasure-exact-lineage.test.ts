import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Installs = typeof import("../src/server/pluginInstalls");
type PluginStorage = typeof import("../src/lib/server/pluginStorage");
type Foundation = typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
type Resolver = typeof import("../src/lib/server/telephony/resolveCaller");
type Replay = typeof import("../src/lib/server/telephony/outboundCommunicationReplay");
type Erasure = typeof import("../src/server/clientErasure");
type Activity = typeof import("../src/server/activity");

let storage: Storage;
let tenants: Tenants;
let installs: Installs;
let pluginStorage: PluginStorage;
let foundation: Foundation;
let resolver: Resolver;
let replay: Replay;
let erasure: Erasure;
let activity: Activity;
let sequence = 0;

before(async () => {
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  resolver = await import("../src/lib/server/telephony/resolveCaller");
  replay = await import("../src/lib/server/telephony/outboundCommunicationReplay");
  erasure = await import("../src/server/clientErasure");
  activity = await import("../src/server/activity");

  const shared = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const leadPorts = await import("../src/lib/server/leadsPipelinePorts");
  foundation.registerLeadsPipelineFoundation({
    tenant: shared.tenantPort,
    activity: shared.activityPort,
    events: shared.eventBusPort,
    pluginInstalls: shared.pluginInstallStorePort,
    pipeline: leadPorts.pipelinePort,
    personIdentity: leadPorts.personIdentityPort,
  });
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

function makeWorld(label: string) {
  sequence += 1;
  const actor = `user_${label}_${sequence}`;
  const agency = tenants.createAgency({
    name: `Exact lineage ${label} ${sequence}`,
    ownerEmail: `${label}-${sequence}@example.test`,
  });
  const install = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: actor,
  } as never);
  const scopedStorage = pluginStorage.makePluginStorage(install.id);
  const container = foundation.containerFor({
    agencyId: agency.id as never,
    storage: scopedStorage as never,
  });
  return { actor, agency, install, scopedStorage, container };
}

describe("exact erasure lineage", { concurrency: false }, () => {
  test("an exact converted-Lead edge preserves unrelated records behind the same switchboard or inbox", async () => {
    const world = makeWorld("shared-route");
    const phone = "+44 20 7946 0999";
    const targetEmail = `target-${sequence}@example.test`;
    const target = (await world.container.leads.upsert({
      email: targetEmail,
      phone,
      name: "Alice Target",
      company: "Shared Offices",
      source: "manual",
      tags: [],
    }, world.actor as never)).lead;
    const otherLead = (await world.container.leads.upsert({
      email: `other-lead-${sequence}@example.test`,
      phone,
      name: "Bob Other",
      company: "Shared Offices",
      source: "manual",
      tags: [],
    }, world.actor as never)).lead;
    const otherContact = (await world.container.contacts.upsert({
      email: `other-contact-${sequence}@example.test`,
      phone,
      name: "Carol Other",
      company: "Shared Offices",
      type: "lead",
      source: "networking",
      tags: [],
    }, world.actor as never)).contact;
    // Cross-facet duplicate addresses exist in legacy/imported CRM data. An
    // email match is evidence, not permission to erase this unlinked row.
    const sharedInboxContact = {
      id: `ctc_legacy_shared_inbox_${sequence}`,
      agencyId: world.agency.id,
      email: targetEmail,
      phone: "+44 20 7000 0001",
      name: "Accounts Desk",
      company: "Shared Offices",
      type: "other",
      source: "csv:legacy.csv",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as const;
    // Write the legacy row exactly as an old importer could have stored it:
    // it deliberately has no Person or Lead facet. Modern identity admission
    // rejects a conflicting named owner for this already-used address.
    const contactIndex = (await world.scopedStorage.get<string[]>("contacts/index")) ?? [];
    await world.scopedStorage.set(`contact:${sharedInboxContact.id}`, sharedInboxContact);
    await world.scopedStorage.set(`contacts/email/${targetEmail}`, sharedInboxContact.id);
    await world.scopedStorage.set("contacts/index", [...contactIndex, sharedInboxContact.id]);
    assert.notEqual(target.id, otherLead.id, "setup collapsed switchboard users into one Lead");

    const client = tenants.createClient(world.agency.id, {
      name: "Alice's Client",
      ownerEmail: targetEmail,
      metadata: { phone },
    } as never);
    await world.container.leads.recordConversion(target.id, client.id, world.actor as never);

    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: client.id,
      actorUserId: world.actor,
    });
    assert.equal(result?.completed, true);
    const anonymisedTarget = await world.container.leads.get(target.id);
    assert.ok(anonymisedTarget, "the de-identified funnel fact should remain");
    assert.equal(anonymisedTarget.email, "");
    assert.equal(anonymisedTarget.phone, undefined);

    assert.equal((await world.container.leads.get(otherLead.id))?.email, otherLead.email,
      "another Lead behind the same switchboard was anonymised");
    assert.equal((await world.container.leads.get(otherLead.id))?.phone, otherLead.phone,
      "another Lead behind the same switchboard lost its phone");
    assert.equal((await world.container.contacts.get(otherContact.id))?.email, otherContact.email,
      "another Contact behind the same switchboard was deleted");
    assert.equal((await world.container.contacts.get(otherContact.id))?.phone, otherContact.phone,
      "another Contact behind the same switchboard lost its phone");
    assert.equal((await world.container.contacts.get(sharedInboxContact.id))?.email, targetEmail,
      "an unlinked Contact sharing the address was deleted");
  });

  test("legacy switchboard matches are preserved and surfaced without becoming delete authority", async () => {
    const world = makeWorld("ambiguous-erasure");
    const phone = "+44 20 7946 0888";
    const first = (await world.container.leads.upsert({
      email: `ambiguous-one-${sequence}@example.test`, phone, name: "One Person", source: "manual", tags: [],
    }, world.actor as never)).lead;
    const second = (await world.container.leads.upsert({
      email: `ambiguous-two-${sequence}@example.test`, phone, name: "Two Person", source: "manual", tags: [],
    }, world.actor as never)).lead;
    const client = tenants.createClient(world.agency.id, {
      name: "Legacy switchboard client",
      metadata: { phone },
    } as never);

    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: client.id,
      actorUserId: world.actor,
    });
    assert.equal(result?.completed, true);
    assert.equal(tenants.getClientForAgency(world.agency.id, client.id), null);
    assert.deepEqual(result?.reviewRequired, [{
      system: "leads-pipeline",
      reason: "shared-identity",
      records: 2,
    }]);
    assert.equal((await world.container.leads.get(first.id))?.email, first.email);
    assert.equal((await world.container.leads.get(second.id))?.email, second.email);
  });

  test("provider work with no browser lineage is resolved to one Contact and later erased", async () => {
    const world = makeWorld("provider-lineage");
    const email = `provider-subject-${sequence}@example.test`;
    const contact = (await world.container.contacts.upsert({
      email,
      name: "Provider Subject",
      type: "lead",
      source: "manual",
      tags: [],
    }, world.actor as never)).contact;

    // No contact/prospect/client id came from the browser. The server resolves
    // the exact scoped row from the actual provider recipient.
    const resolution = await resolver.resolveOutboundRecipientSubject(
      world.agency.id,
      world.actor,
      { channel: "email", email },
    );
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.status === "resolved" ? resolution.subject.contactId : undefined, contact.id);

    let rawProviderCalled = false;
    await assert.rejects(
      replay.runReplayProtectedOutboundOperation({
        agencyId: world.agency.id,
        channel: "smtp-email",
        operationId: `raw_provider_${sequence}`,
        requestFingerprint: replay.buildOutboundCommunicationFingerprint({
          agencyId: world.agency.id,
          channel: "email",
          recipient: email,
          senderId: "smtp:test",
          payload: {},
        }),
        senderId: "smtp:test",
      }, async () => {
        rawProviderCalled = true;
        return { successful: true, via: "smtp" };
      }),
      /outbound_communication_subject_required/,
    );
    assert.equal(rawProviderCalled, false, "a raw-recipient provider callback ran without exact lineage");

    assert.ok(resolution.status === "resolved");
    const operationId = `resolved_provider_${sequence}`;
    await replay.runReplayProtectedOutboundOperation({
      agencyId: world.agency.id,
      channel: "smtp-email",
      operationId,
      requestFingerprint: replay.buildOutboundCommunicationFingerprint({
        agencyId: world.agency.id,
        channel: "email",
        recipient: email,
        senderId: "smtp:test",
        payload: { contactId: contact.id },
      }),
      senderId: "smtp:test",
      subjectReferences: resolution.subject,
    }, async () => ({ successful: true, via: "smtp", externalProviderId: "smtp-test-1" }));
    const activityEntry = activity.logActivity({
      agencyId: world.agency.id,
      category: "inbox",
      action: "outreach.email.sent",
      message: `Emailed ${email}`,
      metadata: { to: email, contactId: contact.id },
    });
    const recordId = replay.outboundOperationRecordId(world.agency.id, "smtp-email", operationId);
    assert.ok(storage.getState().outboundCommunicationOperations[recordId]);

    const client = tenants.createClient(world.agency.id, {
      name: "Provider Subject Client",
      ownerEmail: email,
      metadata: { contactId: contact.id },
    } as never);
    await world.container.contacts.recordClientConversion(contact.id, client.id, world.actor as never);
    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: client.id,
      actorUserId: world.actor,
    });
    assert.equal(result?.completed, true);
    assert.equal(storage.getState().outboundCommunicationOperations[recordId], undefined,
      "the pre-client provider replay record survived exact-subject erasure");
    assert.equal(storage.getState().activity.some(entry => entry.id === activityEntry.id), false,
      "the pre-client provider activity survived exact-subject erasure");
    assert.equal(await world.container.contacts.get(contact.id), null,
      "the exact Contact subject survived erasure");
  });

  test("recipient-only provider resolution rejects ambiguous and unknown recipients", async () => {
    const world = makeWorld("provider-reject");
    const phone = "+44 20 7946 0777";
    await world.container.leads.upsert({
      email: `provider-one-${sequence}@example.test`, phone, name: "First Operator", source: "manual", tags: [],
    }, world.actor as never);
    await world.container.leads.upsert({
      email: `provider-two-${sequence}@example.test`, phone, name: "Second Operator", source: "manual", tags: [],
    }, world.actor as never);

    assert.deepEqual(await resolver.resolveOutboundRecipientSubject(
      world.agency.id,
      world.actor,
      { channel: "call", phone },
    ), { status: "ambiguous" });
    assert.deepEqual(await resolver.resolveOutboundRecipientSubject(
      world.agency.id,
      world.actor,
      { channel: "email", email: `unknown-${sequence}@example.test` },
    ), { status: "unresolved" });
  });

  test("forged Client metadata cannot erase another Client's exact Lead", async () => {
    const world = makeWorld("forged-lead");
    const otherClient = tenants.createClient(world.agency.id, {
      name: "Other Client",
      ownerEmail: `other-client-${sequence}@example.test`,
    } as never);
    const otherLead = (await world.container.leads.upsert({
      email: `other-lead-${sequence}@example.test`,
      name: "Other Person",
      source: "manual",
      tags: ["keep-me"],
    }, world.actor as never)).lead;
    await world.container.leads.recordConversion(otherLead.id, otherClient.id, world.actor as never);
    const before = await world.container.leads.get(otherLead.id);

    const forgedClient = tenants.createClient(world.agency.id, {
      name: "Forged metadata Client",
      ownerEmail: `forged-${sequence}@example.test`,
      metadata: { leadId: otherLead.id },
    } as never);
    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: forgedClient.id,
      actorUserId: world.actor,
    });

    assert.equal(result?.completed, false);
    assert.equal(result?.collections["hookError:leads-pipeline"], 1);
    assert.ok(tenants.getClientForAgency(world.agency.id, forgedClient.id), "failed erasure removed its review handle");
    assert.deepEqual(await world.container.leads.get(otherLead.id), before, "foreign Lead changed through metadata authority");
    assert.ok(tenants.getClientForAgency(world.agency.id, otherClient.id), "the unrelated Client was removed");
  });

  test("a foreign Client Contact cannot enter erasure through another Client's promotion edge", async () => {
    const world = makeWorld("foreign-promotion");
    const clientA = tenants.createClient(world.agency.id, {
      name: "Promotion Client A",
      ownerEmail: `promotion-a-${sequence}@example.test`,
    } as never);
    const clientB = tenants.createClient(world.agency.id, {
      name: "Promotion Client B",
      ownerEmail: `promotion-b-${sequence}@example.test`,
    } as never);
    const leadA = (await world.container.leads.upsert({
      email: `promotion-lead-${sequence}@example.test`,
      name: "Client A Lead",
      source: "manual",
      tags: [],
    }, world.actor as never)).lead;
    await world.container.leads.recordConversion(leadA.id, clientA.id, world.actor as never);

    const contactB = {
      id: `ctc_foreign_promotion_${sequence}`,
      agencyId: world.agency.id,
      clientId: clientB.id,
      email: `promotion-contact-${sequence}@example.test`,
      name: "Client B Contact",
      type: "customer",
      source: "manual",
      tags: [],
      promotedFromLeadId: leadA.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as const;
    await world.scopedStorage.set(`contact:${contactB.id}`, contactB);
    await world.scopedStorage.set(`contacts/email/${contactB.email}`, contactB.id);
    await world.scopedStorage.set("contacts/index", [contactB.id]);

    const beforeLead = await world.container.leads.get(leadA.id);
    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: clientA.id,
      actorUserId: world.actor,
    });

    assert.equal(result?.completed, false);
    assert.equal(result?.collections["hookError:leads-pipeline"], 1);
    assert.ok(tenants.getClientForAgency(world.agency.id, clientA.id), "failed erasure removed its retry handle");
    assert.ok(tenants.getClientForAgency(world.agency.id, clientB.id), "foreign Client was removed");
    assert.deepEqual(await world.container.leads.get(leadA.id), beforeLead, "target Lead changed before rollback");
    assert.equal((await world.container.contacts.get(contactB.id))?.clientId, clientB.id,
      "foreign Contact was deleted through the promotion edge");
  });

  test("a dangling metadata id fails closed before identity fallback mutates anything", async () => {
    const world = makeWorld("dangling-lineage");
    const email = `dangling-${sequence}@example.test`;
    const lead = (await world.container.leads.upsert({
      email,
      name: "Legacy Exact Person",
      source: "manual",
      tags: [],
    }, world.actor as never)).lead;
    const before = await world.container.leads.get(lead.id);
    const client = tenants.createClient(world.agency.id, {
      name: "Dangling Client",
      ownerEmail: email,
      metadata: { contactId: "contact_missing_lineage" },
    } as never);

    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: client.id,
      actorUserId: world.actor,
    });
    assert.equal(result?.completed, false);
    assert.deepEqual(await world.container.leads.get(lead.id), before);
    assert.ok(tenants.getClientForAgency(world.agency.id, client.id));
  });

  test("even a unique legacy address is evidence only and is preserved for review", async () => {
    const world = makeWorld("linked-contact-display");
    const email = `legacy-linked-${sequence}@example.test`;
    const lead = (await world.container.leads.upsert({
      email,
      name: "Legacy Person",
      source: "manual",
      tags: [],
    }, world.actor as never)).lead;
    const client = tenants.createClient(world.agency.id, {
      name: "Legacy Client",
      ownerEmail: email,
      metadata: { linkedContacts: [{ id: "contact_display_row_only", name: "Accounts" }] },
    } as never);

    const result = await erasure.eraseClientCompletely({
      agencyId: world.agency.id,
      clientId: client.id,
      actorUserId: world.actor,
    });
    assert.equal(result?.completed, true);
    assert.equal((await world.container.leads.get(lead.id))?.email, email);
    assert.deepEqual(result?.reviewRequired, [{
      system: "leads-pipeline",
      reason: "shared-identity",
      records: 1,
    }]);
  });

  test("forged Client metadata cannot make a Contact part of that Client's provider subject", async () => {
    const world = makeWorld("forged-provider");
    const email = `provider-contact-${sequence}@example.test`;
    const contact = (await world.container.contacts.upsert({
      email,
      name: "Real Contact",
      type: "lead",
      source: "manual",
      tags: [],
    }, world.actor as never)).contact;
    const forgedClient = tenants.createClient(world.agency.id, {
      name: "Unrelated Client",
      ownerEmail: `unrelated-${sequence}@example.test`,
      metadata: { contactId: contact.id },
    } as never);

    assert.deepEqual(await resolver.resolveOutboundRecipientSubject(
      world.agency.id,
      world.actor,
      { channel: "email", email },
      { clientId: forgedClient.id, contactId: contact.id },
    ), { status: "unresolved" });
  });
});
