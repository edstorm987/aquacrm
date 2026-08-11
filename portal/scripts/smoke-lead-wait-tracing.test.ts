import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { formatElapsed, leadTimingSnapshot } from "../src/lib/leadTiming";
import { LeadService, normalizeLeadJourney } from "../src/built-ins/modules/leads-pipeline/src/server/leads";
import type { Lead } from "../src/built-ins/modules/leads-pipeline/src/lib/domain";
import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";

function leadService() {
  const values = new Map<string, unknown>();
  const activity: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const storage: PluginStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { values.set(key, value); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
  const service = new LeadService(
    "agency_wait_test",
    storage,
    { logActivity(input) { activity.push({ action: input.action, metadata: input.metadata }); return { id: "activity", ts: Date.now(), ...input }; }, listActivity() { return []; } },
    { emit() {} },
  );
  return { service, activity };
}

describe("lead wait-time tracing", () => {
  it("calculates live enquiry, response, follow-up and stage waits", () => {
    const waiting = leadTimingSnapshot({
      capturedAt: 1_000,
      lastEnquiryAt: 2_000,
      stageEnteredAt: 1_500,
      currentStageId: "new",
    }, 10_000);
    assert.equal(waiting.awaitingResponse, true);
    assert.equal(waiting.currentWaitMs, 8_000);
    assert.equal(waiting.stageAgeMs, 8_500);

    const replied = leadTimingSnapshot({
      capturedAt: 1_000,
      lastEnquiryAt: 2_000,
      lastEnquiryRespondedAt: 5_000,
      firstContactedAt: 4_000,
      lastContactedAt: 5_000,
      stageEnteredAt: 1_500,
      currentStageId: "contacted",
    }, 10_000);
    assert.equal(replied.awaitingResponse, false);
    assert.equal(replied.firstResponseMs, 3_000);
    assert.equal(replied.latestResponseMs, 3_000);
    assert.equal(formatElapsed(90 * 60_000), "1h 30m");
  });

  it("retains every repeat enquiry and resets only the latest response timer", async () => {
    const { service } = leadService();
    const first = await service.upsert({
      email: "repeat@example.test",
      source: "website:milesymedia",
      capturedAt: 1_000,
      tags: ["website-enquiry"],
      customFields: { enquiryId: "enquiry_1" },
    }, "owner");
    let lead = await service.recordContact(first.lead.id, { at: 2_000, channel: "email", outcome: "reached" }, "owner");
    assert.equal(lead?.lastEnquiryRespondedAt, 2_000);

    const repeated = await service.upsert({
      email: "repeat@example.test",
      source: "website:milesymedia",
      capturedAt: 5_000,
      tags: ["website-enquiry"],
      customFields: { enquiryId: "enquiry_2" },
    }, "owner");
    assert.equal(repeated.created, false);
    assert.equal(repeated.lead.enquiryCount, 2);
    assert.deepEqual(repeated.lead.enquiryIds, ["enquiry_1", "enquiry_2"]);
    assert.equal(repeated.lead.lastEnquiryAt, 5_000);
    assert.equal(repeated.lead.lastEnquiryRespondedAt, undefined);
    assert.equal(leadTimingSnapshot(repeated.lead, 8_000).awaitingResponse, true);

    lead = await service.recordContact(repeated.lead.id, { at: 7_000, channel: "call", outcome: "reached" }, "owner");
    assert.equal(lead?.firstContactedAt, 2_000);
    assert.equal(lead?.lastEnquiryRespondedAt, 7_000);
    assert.equal(lead?.journeyEvents?.filter(event => event.type === "enquiry-received").length, 2);
  });

  it("persists stage entries, meetings and client conversion in order", async () => {
    const { service } = leadService();
    const created = await service.upsert({ email: "trace@example.test", source: "manual", capturedAt: 1_000 }, "owner");
    await service.recordStageChange(created.lead.id, { fromStage: "new", toStage: "contacted", at: 2_000 }, "owner");
    await service.recordMeeting(created.lead.id, 10_000, "owner");
    const converted = await service.recordConversion(created.lead.id, "client_1", "owner", 4_000);
    assert.equal(converted?.currentStageId, "won");
    assert.equal(converted?.convertedAt, 4_000);
    assert.equal(converted?.convertedClientId, "client_1");
    assert.deepEqual(converted?.journeyEvents?.map(event => event.type), [
      "lead-captured",
      "stage-changed",
      "stage-changed",
      "meeting-scheduled",
      "stage-changed",
      "converted",
    ]);
  });

  it("migrates old lead records into a readable timing history", () => {
    const legacy = normalizeLeadJourney({
      id: "legacy",
      agencyId: "agency_wait_test",
      email: "legacy@example.test",
      tags: ["website-enquiry"],
      source: "website:legacy",
      capturedAt: 1_000,
      lastContactedAt: 3_000,
    } satisfies Lead);
    assert.equal(legacy.firstContactedAt, 3_000);
    assert.equal(legacy.currentStageId, "new");
    assert.equal(legacy.journeyEvents?.some(event => event.type === "enquiry-received"), true);
    assert.equal(legacy.journeyEvents?.some(event => event.type === "contact-recorded"), true);
  });

  it("wires the timing ledger into Journey, Inbox and repeat-enquiry alerts", async () => {
    const [workspace, page, inbox, alerts, statusRoute, handlers] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/pipelines/[slug]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/inbox/_MasterInbox.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/server/operationalAlerts.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/website-enquiries/status/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/built-ins/modules/leads-pipeline/src/api/handlers.ts", import.meta.url), "utf8"),
    ]);
    assert.match(workspace, /Awaiting first reply/);
    assert.match(workspace, /Time and journey trace/);
    assert.match(workspace, /Wait-time watch/);
    assert.match(page, /cardUpdatedAtByLeadId/);
    assert.match(inbox, /Elapsed since enquiry/);
    assert.match(inbox, /firstRespondedAt/);
    assert.match(alerts, /lastEnquiryRespondedAt/);
    assert.match(statusRoute, /inboxStatusHistory/);
    assert.match(handlers, /recordStageChange/);
    assert.match(handlers, /recordWebsiteEnquiryResponse/);
  });
});
