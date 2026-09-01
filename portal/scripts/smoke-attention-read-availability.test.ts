import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adoptAttentionPlanSnapshot,
  attentionScopeKey,
  EMPTY_ATTENTION_PLAN_SNAPSHOT,
  unavailableAttentionPlanReads,
} from "../src/lib/inbox/attentionPlanRead";
import { loadAttentionPlanReads } from "../src/lib/server/attentionPlanReads";
import {
  listOperationalAlertsForResolution,
  websiteEnquiryIdsForResolutionLead,
  websiteEnquiryForResolutionAlert,
} from "../src/lib/server/resolutionAlertReads";
import type { ResolutionPlan } from "../src/lib/inbox/resolutionContext";
import type { ResolutionEvidence } from "../src/lib/inbox/resolutionEvidence";
import type { ResolutionExplain } from "../src/lib/inbox/resolutionExplain";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const plan: ResolutionPlan = {
  alertId: "alert-1",
  title: "Resolve the retained alert",
  steps: [{ id: "step-1", label: "Inspect it", href: "/portal/agency", done: false }],
};

const explain: ResolutionExplain = {
  alertId: "alert-1",
  title: "Retained alert",
  detail: "A retained fact needs attention.",
  evidence: ["The source answered."],
  kind: "in-app",
  records: [],
};

const evidence: ResolutionEvidence = {
  alertId: "alert-1",
  summary: "One retained record.",
  records: [{ id: "record-1", label: "Record", fields: [] }],
};

describe("attention details preserve read availability", () => {
  it("keeps three independent outcomes when one builder rejects", async () => {
    const calls: string[] = [];
    const reads = await loadAttentionPlanReads({
      plan: async () => { calls.push("plan"); return plan; },
      explain: async () => { calls.push("explain"); throw new Error("provider refused"); },
      evidence: async () => { calls.push("evidence"); return evidence; },
    });

    assert.deepEqual(calls.sort(), ["evidence", "explain", "plan"]);
    assert.deepEqual(reads.plan, { available: true, data: plan });
    assert.equal(reads.explain.available, false);
    assert.equal(reads.explain.data, null);
    assert.match(reads.explain.reason ?? "", /could not be read/i);
    assert.deepEqual(reads.evidence, { available: true, data: evidence });
  });

  it("distinguishes a confirmed absent detail from a failed read", async () => {
    const reads = await loadAttentionPlanReads({
      plan: async () => null,
      explain: async () => null,
      evidence: async () => null,
    });

    assert.deepEqual(reads.plan, { available: true, data: null });
    assert.deepEqual(reads.explain, { available: true, data: null });
    assert.deepEqual(reads.evidence, { available: true, data: null });
  });

  it("retains the last confirmed snapshot when a retry cannot read anything", () => {
    const confirmed = adoptAttentionPlanSnapshot(EMPTY_ATTENTION_PLAN_SNAPSHOT, {
      plan: { available: true, data: plan },
      explain: { available: true, data: explain },
      evidence: { available: true, data: evidence },
    });
    const failedRetry = unavailableAttentionPlanReads("Temporary refusal.");
    const retained = adoptAttentionPlanSnapshot(confirmed, failedRetry);

    assert.deepEqual(retained, confirmed);
    assert.notStrictEqual(retained, confirmed, "adoption returns a fresh state object");
    assert.equal(failedRetry.plan.available, false);
  });

  it("generates distinct component scopes for distinct alert ids", () => {
    assert.equal(attentionScopeKey("banner", "alert-1"), "banner:alert-1");
    assert.notEqual(
      attentionScopeKey("banner", "alert-1"),
      attentionScopeKey("banner", "alert-2"),
    );
    assert.notEqual(
      attentionScopeKey("banner", "alert-1"),
      attentionScopeKey("evidence", "alert-1"),
    );
  });

  it("matches lead-backed and enquiry-backed resolution identities", () => {
    const enquiries = [
      { id: "enquiry-1", leadId: "lead-1" },
      { id: "enquiry-2" },
      { id: "enquiry-legacy" },
    ] as never;

    assert.equal(websiteEnquiryForResolutionAlert(enquiries, "enquiry:lead-1")?.id, "enquiry-1");
    assert.equal(websiteEnquiryForResolutionAlert(enquiries, "website-message:enquiry-2")?.id, "enquiry-2");
    const linkedIds = websiteEnquiryIdsForResolutionLead("enquiry:lead-legacy", {
      id: "lead-legacy",
      enquiryIds: ["enquiry-older", "enquiry-legacy"],
      customFields: { enquiryId: "enquiry-legacy" },
    });
    assert.deepEqual(linkedIds, ["enquiry-legacy", "enquiry-older"]);
    assert.equal(
      websiteEnquiryForResolutionAlert(enquiries, "enquiry:lead-legacy", linkedIds)?.id,
      "enquiry-legacy",
      "a retained lead link must recover a provider row that lacks leadId",
    );
    assert.equal(websiteEnquiryForResolutionAlert(enquiries, "enquiry:missing"), null);
    assert.equal(websiteEnquiryForResolutionAlert(enquiries, "task:lead-1"), null);
    assert.deepEqual(
      websiteEnquiryIdsForResolutionLead("enquiry:another-lead", {
        id: "lead-legacy",
        customFields: { enquiryId: "enquiry-legacy" },
      }),
      [],
      "a link from a different lead must never be borrowed",
    );
  });

  it("propagates an exact enquiry-source refusal to every checked detail", async () => {
    let alertListCalls = 0;
    await assert.rejects(
      () => listOperationalAlertsForResolution("agency-1", "website-message:enquiry-1", 123, {
        websiteEnquiries: async () => { throw new Error("provider refused"); },
        operationalAlerts: async () => { alertListCalls += 1; return []; },
      }),
      /provider refused/,
    );
    assert.equal(alertListCalls, 0, "a refused exact source must not become a normal list with the requested id absent");
  });

  it("injects one confirmed enquiry read into explanation/evidence alert loading", async () => {
    const enquiries = [{ id: "enquiry-1", leadId: "lead-1" }] as never;
    let receivedOptions: unknown;
    const alerts = await listOperationalAlertsForResolution("agency-1", "enquiry:lead-1", 123, {
      websiteEnquiries: async () => enquiries,
      operationalAlerts: async (_agencyId, _now, options) => {
        receivedOptions = options;
        return [{ id: "enquiry:lead-1" }] as never;
      },
    });

    assert.deepEqual(alerts, [{ id: "enquiry:lead-1" }]);
    assert.deepEqual(receivedOptions, {
      websiteEnquiries: { available: true, data: enquiries },
    });
  });
});

describe("mounted attention consumers do not manufacture empty details", () => {
  it("the route returns first-class reads and no longer swallows builders to null", () => {
    const route = read("src", "app", "api", "portal", "attention", "plan", "route.ts");
    assert.match(route, /loadAttentionPlanReads/);
    assert.match(route, /\bok: true,\s*reads,/);
    assert.doesNotMatch(route, /resolutionPlanFor\([^)]*\)\.catch\(\(\) => null\)/);
    assert.doesNotMatch(route, /resolutionExplainFor\([^)]*\)\.catch\(\(\) => null\)/);
    assert.doesNotMatch(route, /resolutionEvidenceFor\([^)]*\)\.catch\(\(\) => null\)/);
    assert.match(route, /status: 503/, "an outer failure must not answer ok:true with three nulls");
  });

  it("the banner retains confirmed details, exposes retry and refuses stale auto-completion", () => {
    const banner = read("src", "components", "attention", "ResolutionBanner.tsx");
    assert.match(banner, /adoptAttentionPlanSnapshot/);
    assert.match(banner, /Retry details/);
    assert.match(banner, /resolutionReads\?\.plan\.available === true/);
    assert.match(banner, /completion will not be assumed/);
    assert.match(banner, /key=\{attentionScopeKey\("banner", alertId\)\}/);
  });

  it("the evidence card retains the confirmed record and makes a failed retry explicit", () => {
    const card = read("src", "components", "attention", "EvidenceCard.tsx");
    assert.match(card, /if \(next\.available\) setEvidence\(next\.data\)/);
    assert.match(card, /Retry records/);
    assert.match(card, /last confirmed evidence remains below and may be stale/);
    assert.match(card, /key=\{attentionScopeKey\("evidence", alertId\)\}/);
    assert.doesNotMatch(card, /setState\("none"\)/);
  });
});
