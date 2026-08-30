// Canonical metric registry — enforcement + golden boundary cases.
//
// The registry (`lib/data/metricRegistry.ts`) adds semantics WITHOUT
// restating formulas; what keeps it honest is set equality against the two
// defining source files, extracted the same way the suite's other
// source-pinning tests do (readFileSync + anchored regex). A new metric
// cannot ship unregistered; a retired one cannot linger; a NEW bare-id
// collision between the command and commercial namespaces fails loudly while
// the one existing collision stays pinned.
//
// The golden half pins boundary semantics of metrics the registry marks as
// dedup hazards, against a fixed clock and a hand-computable fixture — real
// calculations, no fabricated data.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { Campaign, Lead } from "../src/built-ins/modules/leads-pipeline/src/lib/domain";
import { buildCommercialIntelligence } from "../src/lib/intelligence/commercialIntelligence";
import {
  CANONICAL_METRICS,
  KNOWN_DESCRIPTOR_ID_COLLISIONS,
  canonicalMetric,
  canonicalMetricForDescriptor,
  sameQuantityPairs,
} from "../src/lib/data/metricRegistry";
import type { Client, Pipeline, PipelineCard } from "../src/server/types";

const ROOT = join(__dirname, "..");

function idsFrom(file: string, pattern: RegExp): Set<string> {
  const source = readFileSync(join(ROOT, file), "utf-8");
  const ids = new Set<string>();
  for (const match of source.matchAll(pattern)) ids.add(match[1]!);
  return ids;
}

test("registry ids exactly match the metrics the source actually defines", () => {
  const commandIds = idsFrom("src/lib/server/commandIntelligenceService.ts", /makeKpi\(\{ id: "([a-z0-9-]+)"/g);
  const commercialIds = idsFrom("src/lib/intelligence/commercialIntelligence.ts", /makeFormula\(\{ id: "([a-z0-9-]+)"/g);
  assert.ok(commandIds.size >= 15, "extraction regex stopped matching commandIntelligenceService — update the anchor");
  assert.ok(commercialIds.size >= 30, "extraction regex stopped matching commercialIntelligence — update the anchor");

  const registeredCommand = new Set(CANONICAL_METRICS.filter(entry => entry.kind === "command").map(entry => entry.id));
  const registeredCommercial = new Set(CANONICAL_METRICS.filter(entry => entry.kind === "commercial").map(entry => entry.id));

  const missingCommand = [...commandIds].filter(id => !registeredCommand.has(id)).sort();
  const missingCommercial = [...commercialIds].filter(id => !registeredCommercial.has(id)).sort();
  const staleCommand = [...registeredCommand].filter(id => !commandIds.has(id)).sort();
  const staleCommercial = [...registeredCommercial].filter(id => !commercialIds.has(id)).sort();

  assert.deepEqual(missingCommand, [], `command KPIs defined in source but unregistered: ${missingCommand.join(", ")}`);
  assert.deepEqual(missingCommercial, [], `commercial formulas defined in source but unregistered: ${missingCommercial.join(", ")}`);
  assert.deepEqual(staleCommand, [], `registry names command KPIs the source no longer defines: ${staleCommand.join(", ")}`);
  assert.deepEqual(staleCommercial, [], `registry names commercial formulas the source no longer defines: ${staleCommercial.join(", ")}`);
});

test("canonical ids are globally unique and well-formed", () => {
  const seen = new Set<string>();
  for (const entry of CANONICAL_METRICS) {
    assert.equal(entry.canonicalId, `${entry.kind}:${entry.id}`, `${entry.canonicalId}: canonicalId must be <kind>:<id>`);
    assert.ok(!seen.has(entry.canonicalId), `duplicate canonical id ${entry.canonicalId}`);
    seen.add(entry.canonicalId);
    assert.ok(entry.definition.trim().length >= 15, `${entry.canonicalId}: definition too thin`);
    assert.ok(entry.computedBy.includes("src/"), `${entry.canonicalId}: computedBy must name the authoritative source file`);
    assert.ok(entry.grain.length > 0 && entry.window.length > 0 && entry.freshness.length > 0, `${entry.canonicalId}: grain/window/freshness required`);
  }
});

test("bare-id collisions across kinds are exactly the pinned set — a new one fails", () => {
  const byBareId = new Map<string, number>();
  for (const entry of CANONICAL_METRICS) byBareId.set(entry.id, (byBareId.get(entry.id) ?? 0) + 1);
  const collisions = [...byBareId.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
  assert.deepEqual(
    collisions,
    [...KNOWN_DESCRIPTOR_ID_COLLISIONS].sort(),
    "The flat descriptor id space collided beyond the pinned set. Namespace the new metric's id " +
      "(the evidence/custom kinds already prefix theirs) instead of widening the collision list.",
  );
});

test("every computedBy names a file that exists on disk", () => {
  for (const entry of CANONICAL_METRICS) {
    const path = entry.computedBy.split(" ")[0]!;
    assert.doesNotThrow(() => readFileSync(join(ROOT, path)), `${entry.canonicalId}: computedBy path missing: ${path}`);
  }
});

test("overlap links resolve and same-quantity claims are symmetric", () => {
  for (const entry of CANONICAL_METRICS) {
    for (const overlap of entry.overlaps ?? []) {
      const other = canonicalMetric(overlap.canonicalId);
      assert.ok(other, `${entry.canonicalId} overlaps unknown metric ${overlap.canonicalId}`);
      if (overlap.relation === "same-quantity") {
        const reciprocal = (other!.overlaps ?? []).some(
          back => back.canonicalId === entry.canonicalId && back.relation === "same-quantity",
        );
        assert.ok(reciprocal, `${entry.canonicalId} claims same-quantity with ${overlap.canonicalId}, which does not claim it back`);
      }
    }
  }
  // The registry currently knows these competing calculations; shrinking this
  // list is progress, growing it needs a recorded decision.
  assert.ok(sameQuantityPairs().length >= 6, "the known duplicate map lost entries without the dedup phase recording it");
});

test("descriptor resolution is deterministic for the pinned collision", () => {
  const ambiguous = canonicalMetricForDescriptor("campaign-roas");
  assert.equal(ambiguous?.canonicalId, "command:campaign-roas", "bare lookup must match the picker's .find() order");
  assert.equal(canonicalMetricForDescriptor("campaign-roas", "commercial")?.canonicalId, "commercial:campaign-roas");
  assert.equal(canonicalMetricForDescriptor("lead-to-client")?.canonicalId, "commercial:lead-to-client");
  assert.equal(canonicalMetricForDescriptor("no-such-metric"), undefined);
});

// ── Golden boundary cases for dedup-hazard metrics ─────────────────────────
//
// A fixed clock, a fixture small enough to verify by hand, and assertions on
// the exact boundary each formula declares. These pin the CURRENT canonical
// behaviour so the dedup phase can prove parity before switching consumers.

const NOW = Date.UTC(2026, 7, 30, 12);
const DAY = 86_400_000;

const pipeline: Pipeline = {
  id: "pipeline-leads", agencyId: "agency-g", kind: "leads", name: "Leads", slug: "leads",
  columns: [
    { id: "new", label: "New", order: 0 },
    { id: "contacted", label: "Contacted", order: 1 },
    { id: "proposal", label: "Proposal", order: 2 },
    { id: "won", label: "Won", order: 3 },
    { id: "lost", label: "Lost", order: 4 },
  ],
  allowedCardKinds: ["lead"], sortOrder: 0, createdAt: NOW - 90 * DAY, updatedAt: NOW,
};

function lead(id: string, overrides: Partial<Lead>): Lead {
  return {
    id, agencyId: "agency-g", email: `${id}@example.com`, name: id, tags: [], source: "manual",
    capturedAt: NOW - 30 * DAY, currentStageId: "new", stageEnteredAt: NOW - 30 * DAY, pipelineCardId: `card-${id}`,
    ...overrides,
  } as Lead;
}

// Four leads, hand-computable:
//  • won-fast: responded at EXACTLY 5 minutes (the SLA boundary — inclusive).
//  • lost-slow: responded at 5 minutes + 1 ms (just over the boundary).
//  • open-stale: stage entered EXACTLY 14 days ago (the staleness boundary — inclusive).
//  • open-fresh: stage entered 13 days 23h ago (just under).
const goldenLeads: Lead[] = [
  lead("won-fast", {
    lastEnquiryAt: NOW - 20 * DAY, lastEnquiryRespondedAt: NOW - 20 * DAY + 5 * 60_000,
    firstContactedAt: NOW - 20 * DAY + 5 * 60_000, currentStageId: "won", stageEnteredAt: NOW - 2 * DAY,
    convertedAt: NOW - 2 * DAY, convertedClientId: "client-g1", enquiryCount: 1,
  }),
  lead("lost-slow", {
    lastEnquiryAt: NOW - 25 * DAY, lastEnquiryRespondedAt: NOW - 25 * DAY + 5 * 60_000 + 1,
    firstContactedAt: NOW - 25 * DAY + 5 * 60_000 + 1, currentStageId: "lost", stageEnteredAt: NOW - 10 * DAY,
  }),
  lead("open-stale", { currentStageId: "contacted", firstContactedAt: NOW - 15 * DAY, stageEnteredAt: NOW - 14 * DAY }),
  lead("open-fresh", { currentStageId: "contacted", firstContactedAt: NOW - 5 * DAY, stageEnteredAt: NOW - 14 * DAY + 60 * 60_000 }),
];
const goldenCards: PipelineCard[] = goldenLeads.map(item => ({
  id: item.pipelineCardId!, pipelineId: pipeline.id, columnId: item.currentStageId!, order: 0, kind: "lead",
  lead: { leadId: item.id, email: item.email, name: item.name, source: item.source } as never,
  createdAt: item.capturedAt, updatedAt: item.stageEnteredAt ?? item.capturedAt,
}));
const goldenClients: Client[] = [{
  id: "client-g1", agencyId: "agency-g", name: "Golden Client", slug: "golden-client", brand: {} as Client["brand"],
  stage: "live", status: "active", metadata: { leadId: "won-fast" }, createdAt: NOW - 2 * DAY, updatedAt: NOW,
}];
const goldenCampaigns: Campaign[] = [];

function goldenSnapshot() {
  return buildCommercialIntelligence({
    leads: goldenLeads, clients: goldenClients, campaigns: goldenCampaigns, pipeline, cards: goldenCards,
    currency: "GBP", pageviews: 400, forms: 8, now: NOW,
  });
}

function formula(id: string) {
  const metric = goldenSnapshot().formulas.find(entry => entry.id === id);
  assert.ok(metric, `formula ${id} missing from snapshot`);
  return metric!;
}

test("golden: response-sla counts a response at exactly 5 minutes as met, one 1ms over as missed", () => {
  const sla = formula("response-sla");
  // Two measured responses: 5:00.000 (met, boundary inclusive) and 5:00.001 (missed).
  assert.equal(sla.numerator, 1);
  assert.equal(sla.denominator, 2);
  assert.equal(sla.value, 50);
});

test("golden: stale-open counts exactly-14-days as stale and 13d23h as fresh", () => {
  const stale = formula("stale-open");
  assert.equal(stale.numerator, 1, "the >= 14-day boundary is inclusive");
  assert.equal(stale.denominator, 2, "two open leads");
  assert.equal(stale.value, 50);
});

test("golden: decision-win excludes open pipeline from its denominator", () => {
  const win = formula("decision-win");
  assert.equal(win.numerator, 1, "one won decision");
  assert.equal(win.denominator, 2, "won + lost only — the two open leads are not decisions");
  assert.equal(win.value, 50);
});

test("golden: median-response over an even sample count averages the middle pair", () => {
  const median = formula("median-response");
  // Samples: 300,000 ms and 300,001 ms → median 300,000.5 ms.
  assert.equal(median.value, 300_000.5);
});

test("golden: lead-to-client counts churned as converted outcomes and reports one decimal", () => {
  const conversion = formula("lead-to-client");
  assert.equal(conversion.numerator, 1);
  assert.equal(conversion.denominator, 4);
  assert.equal(conversion.value, 25);
});

test("golden: form-to-lead may exceed 100% and stays a directional ratio", () => {
  const snapshot = buildCommercialIntelligence({
    leads: goldenLeads, clients: goldenClients, campaigns: goldenCampaigns, pipeline, cards: goldenCards,
    currency: "GBP", pageviews: 400, forms: 2, now: NOW,
  });
  const metric = snapshot.formulas.find(entry => entry.id === "form-to-lead");
  assert.equal(metric?.value, 200, "4 retained leads over 2 tracked forms — the >100% case the definition documents");
});

test("golden: zero campaign spend keeps ROAS learning — never Infinity, never zero", () => {
  const roas = formula("campaign-roas");
  assert.equal(roas.value, null);
  assert.equal(roas.status, "learning");
});

// ── The descriptor ↔ registry join ─────────────────────────────────────────
//
// Descriptors now stamp `canonicalId` (`<kind>:<id>`). Every commercial
// descriptor a real snapshot produces must resolve in the canonical registry
// — that is what makes the registry consumed rather than parallel.

test("every commercial descriptor's canonicalId resolves in the canonical registry", async () => {
  const { describeCommercialFormula } = await import("../src/lib/performance/kpiRegistry");
  for (const metric of goldenSnapshot().formulas) {
    const descriptor = describeCommercialFormula(metric, NOW);
    assert.equal(descriptor.canonicalId, `commercial:${metric.id}`);
    assert.ok(
      canonicalMetric(descriptor.canonicalId),
      `descriptor ${descriptor.canonicalId} has no canonical registry entry`,
    );
  }
});
