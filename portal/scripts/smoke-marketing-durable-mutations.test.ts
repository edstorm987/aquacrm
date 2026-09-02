import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LeadService as PipelineLeadService } from "../src/built-ins/modules/leads-pipeline/src/server/leads";
import type { PluginStorage as PipelineStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import { LeadService as MarketingLeadService } from "../src/built-ins/modules/agency-marketing/src/server/leads";
import { CampaignService } from "../src/built-ins/modules/agency-marketing/src/server/campaigns";
import type { StoragePort } from "../src/built-ins/modules/agency-marketing/src/server/ports";

type SharedStorage = PipelineStorage & StoragePort;

/**
 * Two independently hydrated application instances over one durable store.
 * Each instance stays stale until `runExclusive` acquires the shared lease and
 * refreshes it, mirroring the mounted host transaction boundary.
 */
function storageCluster() {
  const durable = new Map<string, unknown>();
  const tails = new Map<string, Promise<void>>();
  let exclusiveCalls = 0;

  function instance(): SharedStorage {
    const hydrated = new Map<string, unknown>(durable);
    return {
      async get<T = unknown>(key: string) {
        return hydrated.get(key) as T | undefined;
      },
      async set<T = unknown>(key: string, value: T) {
        const stored = structuredClone(value);
        hydrated.set(key, stored);
        durable.set(key, stored);
      },
      async del(key: string) {
        hydrated.delete(key);
        durable.delete(key);
      },
      async list(prefix = "") {
        return [...hydrated.keys()].filter(key => key.startsWith(prefix));
      },
      async runExclusive<T>(key: string, operation: () => Promise<T>) {
        exclusiveCalls += 1;
        const previous = tails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const tail = previous.catch(() => undefined).then(() => gate);
        tails.set(key, tail);
        await previous.catch(() => undefined);
        try {
          hydrated.clear();
          for (const [storedKey, value] of durable) hydrated.set(storedKey, structuredClone(value));
          return await operation();
        } finally {
          release();
          if (tails.get(key) === tail) tails.delete(key);
        }
      },
    };
  }

  return { instance, exclusiveCalls: () => exclusiveCalls };
}

const activity = {
  async logActivity(input: Record<string, unknown>) {
    return { id: `activity_${Date.now()}`, ts: Date.now(), ...input };
  },
  async listActivity() { return []; },
};
const events = { emit() { /* no-op test bus */ } };

describe("durable plugin mutation boundaries", () => {
  it("fails closed when a mutating storage adapter omits the durable boundary", async () => {
    const data = new Map<string, unknown>();
    const unsafeStorage: SharedStorage = {
      async get<T = unknown>(key: string) { return data.get(key) as T | undefined; },
      async set<T = unknown>(key: string, value: T) { data.set(key, value); },
      async del(key: string) { data.delete(key); },
      async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    };
    await assert.rejects(
      new PipelineLeadService("agency_fail_closed", unsafeStorage, activity as never, events as never)
        .upsert({ email: "pipeline@example.com", source: "test" }, "actor"),
      /leads_pipeline_mutation_requires_exclusive_storage/,
    );
    await assert.rejects(
      new MarketingLeadService("agency_fail_closed", unsafeStorage, activity as never, events as never)
        .create({ email: "marketing@example.com" }, "actor"),
      /marketing_lead_mutation_requires_exclusive_storage/,
    );
    await assert.rejects(
      new CampaignService("agency_fail_closed", unsafeStorage, activity as never, events as never)
        .create({ name: "Campaign", channel: "email" }, "actor", "gbp"),
      /marketing_campaign_mutation_requires_exclusive_storage/,
    );
    assert.equal(data.size, 0, "an unsafe adapter received writes before the boundary rejected it");
  });

  it("keeps every Leads Pipeline row mutation acknowledged by stale instances", async () => {
    const agencyId = "agency_pipeline_durable";
    const farm = storageCluster();
    const seedService = new PipelineLeadService(agencyId, farm.instance(), activity as never, events as never);
    const created = await seedService.upsert({
      email: "durable.pipeline@example.com",
      phone: "+447700900700",
      source: "durability-test",
    }, "actor_seed");

    // All six services open the row before any of the competing writes lands.
    const services = Array.from({ length: 6 }, () =>
      new PipelineLeadService(agencyId, farm.instance(), activity as never, events as never));
    await Promise.all([
      services[0]!.update(created.lead.id, { notes: "Keep this operator edit" }, "actor_edit"),
      services[1]!.recordEnquiryCapture(created.lead.id, {
        at: created.lead.capturedAt + 1,
        source: "public-contact",
        enquiryId: "enquiry_durable",
      }, "actor_enquiry"),
      services[2]!.recordContact(created.lead.id, {
        at: created.lead.capturedAt + 2,
        channel: "phone",
        outcome: "answered",
      }, "actor_contact"),
      services[3]!.recordStageChange(created.lead.id, {
        toStage: "qualified",
        at: created.lead.capturedAt + 3,
      }, "actor_stage"),
      services[4]!.recordMeeting(created.lead.id, created.lead.capturedAt + 86_400_000, "actor_meeting"),
      services[5]!.recordConversion(created.lead.id, "client_durable", "actor_conversion", created.lead.capturedAt + 4),
    ]);

    const final = await new PipelineLeadService(
      agencyId, farm.instance(), activity as never, events as never,
    ).get(created.lead.id);
    assert.ok(final);
    assert.equal(final.notes, "Keep this operator edit");
    assert.equal(final.convertedClientId, "client_durable");
    assert.equal(final.currentStageId, "won");
    assert.equal(final.enquiryIds?.includes("enquiry_durable"), true);
    for (const type of ["enquiry-received", "contact-recorded", "meeting-scheduled", "converted"] as const) {
      assert.ok(final.journeyEvents?.some(event => event.type === type), `${type} was overwritten by another acknowledged write`);
    }
    assert.ok(farm.exclusiveCalls() >= 7, "the services never entered the host's durable mutation boundary");
  });

  it("preserves Agency Marketing lead rows, indexes and contact edits across instances", async () => {
    const agencyId = "agency_marketing_leads_durable";
    const farm = storageCluster();
    const first = new MarketingLeadService(agencyId, farm.instance(), activity as never, events as never);
    const second = new MarketingLeadService(agencyId, farm.instance(), activity as never, events as never);
    const [alpha, bravo] = await Promise.all([
      first.create({ email: "alpha.durable@example.com", name: "Alpha" }, "actor_alpha"),
      second.create({ email: "bravo.durable@example.com", name: "Bravo" }, "actor_bravo"),
    ]);

    const edit = new MarketingLeadService(agencyId, farm.instance(), activity as never, events as never);
    const contact = new MarketingLeadService(agencyId, farm.instance(), activity as never, events as never);
    await Promise.all([
      edit.update(alpha.id, { name: "Alpha edited", notes: "Retain this" }, "actor_edit"),
      contact.recordContact(alpha.id, "Called and answered", "actor_contact"),
    ]);

    const reader = new MarketingLeadService(agencyId, farm.instance(), activity as never, events as never);
    const listed = await reader.list();
    assert.deepEqual(listed.map(lead => lead.id).sort(), [alpha.id, bravo.id].sort());
    const final = await reader.get(alpha.id);
    assert.equal(final?.name, "Alpha edited");
    assert.equal(final?.notes, "Retain this");
    assert.deepEqual(final?.contactHistory.map(entry => entry.note), ["Called and answered"]);
  });

  it("preserves simultaneous campaign rows and channel indexes across instances", async () => {
    const agencyId = "agency_campaigns_durable";
    const farm = storageCluster();
    const emailService = new CampaignService(agencyId, farm.instance(), activity as never, events as never);
    const paidService = new CampaignService(agencyId, farm.instance(), activity as never, events as never);
    const [email, paid] = await Promise.all([
      emailService.create({ name: "Email durable", channel: "email" }, "actor_email", "gbp"),
      paidService.create({ name: "Paid durable", channel: "paid" }, "actor_paid", "gbp"),
    ]);

    const mover = new CampaignService(agencyId, farm.instance(), activity as never, events as never);
    const creator = new CampaignService(agencyId, farm.instance(), activity as never, events as never);
    const [, social] = await Promise.all([
      mover.update(email.id, { channel: "social", notes: "Moved without losing the row" }, "actor_move"),
      creator.create({ name: "Social durable", channel: "social" }, "actor_social", "gbp"),
    ]);

    const reader = new CampaignService(agencyId, farm.instance(), activity as never, events as never);
    assert.deepEqual((await reader.list()).map(row => row.id).sort(), [email.id, paid.id, social.id].sort());
    assert.deepEqual((await reader.listForChannel("email")).map(row => row.id), []);
    assert.deepEqual((await reader.listForChannel("paid")).map(row => row.id), [paid.id]);
    assert.deepEqual((await reader.listForChannel("social")).map(row => row.id).sort(), [email.id, social.id].sort());
    assert.equal((await reader.get(email.id))?.notes, "Moved without losing the row");
  });
});
