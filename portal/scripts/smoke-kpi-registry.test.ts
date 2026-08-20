import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { RadarEvidenceSeriesSummary } from "../src/engines/data/radar/businessRadar";
import type { CommandIntelligenceSnapshot, CommandKpi, CommercialFormulaMetric } from "../src/lib/intelligence/commandIntelligence";
import type { KpiTargetsConfig } from "../src/server/types";
import {
  applyKpiTargetOverride,
  clearKpiTargetOverride,
  describeCommandKpi,
  describeCommandKpis,
  describeCommercialFormula,
  describeCommercialFormulas,
  describeEvidenceSeries,
  computeCustomKpi,
  groupKpiDescriptorsByCategory,
  resolveKpiTarget,
  searchKpiDescriptors,
  suggestKpiTarget,
} from "../src/lib/performance/kpiRegistry";

/** A fully-formed command KPI fixture; override just the fields a case cares about. */
function makeKpi(overrides: Partial<CommandKpi> = {}): CommandKpi {
  return {
    id: "lead-conversion",
    rank: 6,
    label: "Lead-to-client conversion",
    shortLabel: "Lead conversion",
    domain: "sales",
    value: 24,
    display: "24%",
    format: "percent",
    status: "healthy",
    target: "20% or above after 5 leads",
    detail: "Retained leads with a recorded client conversion.",
    href: "/portal/clients?view=journey",
    sourceId: "commercial:lifecycle",
    measuredAt: 1_000,
    history: [{ at: 100, value: 18 }, { at: 200, value: 21 }, { at: 300, value: 24 }],
    evidence: ["12 converted", "3 lost"],
    plan: { baselineValue: 0, targetValue: 20, direction: "higher", cadence: "rolling", source: "Approved commercial conversion guardrail" },
    measurement: { unit: "percent of leads", basis: "retained leads with a known outcome", window: "retained lifecycle history", formula: "converted lead records divided by all retained lead records x 100" },
    scope: { id: "ecosystem", label: "Whole Aqua ecosystem", kind: "ecosystem" },
    ...overrides,
  };
}

const snapshotOf = (...kpis: CommandKpi[]) => ({ kpis } as unknown as CommandIntelligenceSnapshot);

test("the registry projects a command KPI into a descriptor without recomputing", () => {
  const descriptor = describeCommandKpi(makeKpi());
  assert.equal(descriptor.id, "lead-conversion");
  assert.equal(descriptor.category, "sales");           // domain -> category taxonomy
  assert.equal(descriptor.kind, "command");
  assert.equal(descriptor.format, "percent");
  assert.equal(descriptor.unit, "percent of leads");    // measurement.unit
  assert.equal(descriptor.formulaText, "converted lead records divided by all retained lead records x 100");
  assert.equal(descriptor.direction, "higher");         // plan.direction
  assert.equal(descriptor.target, 20);                  // plan.targetValue
  assert.equal(descriptor.baseline, 0);                 // plan.baselineValue
  assert.equal(descriptor.value, 24);
  assert.equal(descriptor.status, "healthy");
});

test("the descriptor carries the plottable series as a copy of the metric's history", () => {
  const kpi = makeKpi();
  const descriptor = describeCommandKpi(kpi);
  assert.deepEqual(descriptor.series, [{ at: 100, value: 18 }, { at: 200, value: 21 }, { at: 300, value: 24 }]);
  assert.notEqual(descriptor.series, kpi.history, "series should be a fresh array, not the KPI's own reference");
});

test("the registry stays honest: null target/baseline and empty series survive untouched", () => {
  const learning = describeCommandKpi(makeKpi({
    id: "active-clients",
    plan: { baselineValue: null, targetValue: null, direction: "higher", cadence: "monthly", source: "Awaiting an approved client-capacity target" },
    history: [],
  }));
  assert.equal(learning.target, null);
  assert.equal(learning.baseline, null);
  assert.deepEqual(learning.series, []);
});

test("describeCommandKpis registers every KPI on the snapshot, in order", () => {
  const descriptors = describeCommandKpis(snapshotOf(makeKpi({ id: "a", rank: 1 }), makeKpi({ id: "b", rank: 2 }), makeKpi({ id: "c", rank: 3 })));
  assert.deepEqual(descriptors.map(descriptor => descriptor.id), ["a", "b", "c"]);
  assert.ok(descriptors.every(descriptor => descriptor.kind === "command"));
  assert.ok(descriptors.every(descriptor => Array.isArray(descriptor.series)));
});

test("searchKpiDescriptors filters by label, category and unit; an empty query returns all", () => {
  const descriptors = describeCommandKpis(snapshotOf(
    makeKpi({ id: "lead-conversion", label: "Lead-to-client conversion", shortLabel: "Lead conversion", domain: "sales" }),
    makeKpi({ id: "mrr", label: "Monthly recurring revenue", shortLabel: "MRR", domain: "finance", measurement: { unit: "currency per month", basis: "active recurring plans", window: "current", formula: "sum of active plan monthly value" } }),
  ));
  assert.deepEqual(searchKpiDescriptors(descriptors, "").map(descriptor => descriptor.id), ["lead-conversion", "mrr"]);
  assert.deepEqual(searchKpiDescriptors(descriptors, "recurring").map(descriptor => descriptor.id), ["mrr"]);   // label
  assert.deepEqual(searchKpiDescriptors(descriptors, "finance").map(descriptor => descriptor.id), ["mrr"]);     // category
  assert.deepEqual(searchKpiDescriptors(descriptors, "currency").map(descriptor => descriptor.id), ["mrr"]);    // unit
  assert.deepEqual(searchKpiDescriptors(descriptors, "conversion").map(descriptor => descriptor.id), ["lead-conversion"]);
});

test("groupKpiDescriptorsByCategory buckets by category preserving first-seen order", () => {
  const groups = groupKpiDescriptorsByCategory(describeCommandKpis(snapshotOf(
    makeKpi({ id: "a", domain: "sales" }),
    makeKpi({ id: "b", domain: "finance" }),
    makeKpi({ id: "c", domain: "sales" }),
  )));
  assert.deepEqual(groups.map(group => group.category), ["sales", "finance"]);
  assert.deepEqual(groups[0]!.descriptors.map(descriptor => descriptor.id), ["a", "c"]);
  assert.deepEqual(groups[1]!.descriptors.map(descriptor => descriptor.id), ["b"]);
});

function makeFormula(overrides: Partial<CommercialFormulaMetric> = {}): CommercialFormulaMetric {
  return {
    id: "portfolio-churn",
    label: "Portfolio churn",
    category: "outcome",
    unit: "percent",
    value: 12,
    display: "12%",
    formula: "Churned / (active + churned) x100",
    target: "Below 10%",
    status: "warning",
    source: "client status",
    detail: "Share of client relationships lost.",
    href: "/portal/clients?view=health",
    evidence: ["3 churned"],
    ...overrides,
  };
}

const commercialSnapshotOf = (...formulas: CommercialFormulaMetric[]) =>
  ({ commercialIntelligence: { generatedAt: 5_000, formulas } } as unknown as CommandIntelligenceSnapshot);

test("the registry projects a commercial formula into a single-point descriptor", () => {
  const descriptor = describeCommercialFormula(makeFormula(), 5_000);
  assert.equal(descriptor.id, "portfolio-churn");
  assert.equal(descriptor.kind, "commercial");
  assert.equal(descriptor.category, "outcome");        // commercial taxonomy, not a radar domain
  assert.equal(descriptor.format, "percent");          // unit "percent" -> percent format
  assert.equal(descriptor.formulaText, "Churned / (active + churned) x100");
  assert.equal(descriptor.target, null);               // no numeric target on a commercial formula (yet)
  assert.equal(descriptor.baseline, null);
  assert.equal(descriptor.value, 12);
  assert.deepEqual(descriptor.series, [{ at: 5_000, value: 12 }]);   // single current point
});

test("a Learning commercial formula (null value) yields an empty series, never a fake point", () => {
  const descriptor = describeCommercialFormula(makeFormula({ id: "campaign-roas", value: null, display: "Learning" }), 5_000);
  assert.deepEqual(descriptor.series, []);
  assert.equal(descriptor.value, null);
});

test("commercial units map to value-axis formats", () => {
  const cases = [["count", "number"], ["percent", "percent"], ["currency", "currency"], ["duration", "duration"], ["ratio", "number"]] as const;
  for (const [unit, format] of cases) {
    assert.equal(describeCommercialFormula(makeFormula({ unit }), 0).format, format, `${unit} -> ${format}`);
  }
});

test("describeCommercialFormulas registers every formula on the snapshot", () => {
  const descriptors = describeCommercialFormulas(commercialSnapshotOf(makeFormula({ id: "lead-to-client" }), makeFormula({ id: "decision-win" })));
  assert.deepEqual(descriptors.map(descriptor => descriptor.id), ["lead-to-client", "decision-win"]);
  assert.ok(descriptors.every(descriptor => descriptor.kind === "commercial"));
});

function makeEvidenceSummary(overrides: Partial<RadarEvidenceSeriesSummary> = {}): RadarEvidenceSeriesSummary {
  return {
    id: "sales:lead-conversion-rate",
    domain: "sales",
    familyId: "lead-conversion-rate",
    familyLabel: "Lead Conversion Rate",
    sourceId: "commercial:lifecycle",
    expectedDirection: "higher",
    firstSeenAt: 100,
    lastSeenAt: 500,
    totalSamples: 40,
    retainedPointCount: 3,
    hourlyRollupCount: 2,
    latestValue: 24,
    latestStatus: "pass",
    rollingBaseline: 21,
    recentPoints: [{ at: 100, value: 18 }, { at: 300, value: 24 }] as RadarEvidenceSeriesSummary["recentPoints"],
    recentHourly: [],
    ...overrides,
  };
}

test("the registry projects a radar-evidence series into an evidence descriptor with a real trend", () => {
  const descriptor = describeEvidenceSeries(makeEvidenceSummary());
  assert.equal(descriptor.id, "evidence:sales:lead-conversion-rate");   // namespaced so it never collides with a command/commercial id
  assert.equal(descriptor.kind, "evidence");
  assert.equal(descriptor.category, "sales");
  assert.equal(descriptor.direction, "higher");                          // from expectedDirection
  assert.equal(descriptor.target, null);
  assert.equal(descriptor.value, 24);
  assert.deepEqual(descriptor.series, [{ at: 100, value: 18 }, { at: 300, value: 24 }]);   // real retained points, a genuine trend
  assert.equal(descriptor.baseline, 21);   // adaptive rolling baseline (Phase 5B) surfaced onto the descriptor
});

test("evidence descriptors map status honestly and survive a missing latest value", () => {
  assert.equal(describeEvidenceSeries(makeEvidenceSummary({ latestStatus: "critical" })).status, "critical");
  assert.equal(describeEvidenceSeries(makeEvidenceSummary({ expectedDirection: "lower" })).direction, "lower");
  const missing = describeEvidenceSeries(makeEvidenceSummary({ latestValue: undefined, latestStatus: undefined, recentPoints: [], rollingBaseline: undefined }));
  assert.equal(missing.value, null);
  assert.equal(missing.display, "—");
  assert.equal(missing.status, "learning");
  assert.deepEqual(missing.series, []);
  assert.equal(missing.baseline, null);   // no rolling baseline yet → honest null
});

test("resolveKpiTarget layers agency then company, most specific wins", () => {
  const config: KpiTargetsConfig = {
    byKpi: { "lead-conversion": { targetValue: 20, baselineValue: 0 } },
    byCompany: { "co-1": { "lead-conversion": { targetValue: 30 } } },
    updatedAt: 1,
  };
  assert.equal(resolveKpiTarget(config, "lead-conversion")?.targetValue, 20);            // agency level
  assert.equal(resolveKpiTarget(config, "lead-conversion", "co-1")?.targetValue, 30);    // company overrides
  assert.equal(resolveKpiTarget(config, "lead-conversion", "co-1")?.baselineValue, 0);   // inherits agency baseline
  assert.equal(resolveKpiTarget(config, "mrr"), undefined);                              // nothing set
  assert.equal(resolveKpiTarget(undefined, "mrr"), undefined);
});

test("applyKpiTargetOverride stamps effectiveFrom and versions the prior value into history", () => {
  const first = applyKpiTargetOverride(undefined, "revenue-target", { targetValue: 100 }, { now: 1_000, actorUserId: "u1" });
  assert.equal(first.byKpi["revenue-target"]!.targetValue, 100);
  assert.equal(first.byKpi["revenue-target"]!.effectiveFrom, 1_000);
  assert.deepEqual(first.byKpi["revenue-target"]!.history, []);
  const second = applyKpiTargetOverride(first, "revenue-target", { targetValue: 120 }, { now: 2_000, actorUserId: "u1" });
  assert.equal(second.byKpi["revenue-target"]!.targetValue, 120);
  assert.equal(second.byKpi["revenue-target"]!.effectiveFrom, 2_000);
  assert.deepEqual(second.byKpi["revenue-target"]!.history, [{ baselineValue: undefined, targetValue: 100, effectiveFrom: 1_000 }]);
});

test("applyKpiTargetOverride keeps prior fields on a partial patch and scopes company overrides", () => {
  const withBoth = applyKpiTargetOverride(undefined, "mrr", { baselineValue: 5, targetValue: 10 }, { now: 1 });
  const patched = applyKpiTargetOverride(withBoth, "mrr", { targetValue: 15 }, { now: 2 });   // only target changes
  assert.equal(patched.byKpi["mrr"]!.baselineValue, 5);   // baseline preserved
  assert.equal(patched.byKpi["mrr"]!.targetValue, 15);
  const company = applyKpiTargetOverride(undefined, "mrr", { targetValue: 99 }, { now: 3, companyId: "co-2" });
  assert.equal(company.byCompany!["co-2"]!["mrr"]!.targetValue, 99);
  assert.equal(company.byKpi["mrr"], undefined);          // company override leaves the agency level untouched
});

test("clearKpiTargetOverride removes the override at the requested level", () => {
  const config = applyKpiTargetOverride(undefined, "mrr", { targetValue: 10 }, { now: 1 });
  assert.equal(clearKpiTargetOverride(config, "mrr", { now: 2 }).byKpi["mrr"], undefined);
});

test("suggestKpiTarget nudges the rolling median in the favoured direction, honest without history", () => {
  const higher = suggestKpiTarget({ direction: "higher", series: [{ at: 1, value: 18 }, { at: 2, value: 20 }, { at: 3, value: 22 }] });
  assert.equal(higher?.baseline, 20);           // median
  assert.equal(higher?.target, 22);             // +10%
  assert.equal(higher?.changePercent, 10);
  assert.equal(higher?.sampleSize, 3);

  const lower = suggestKpiTarget({ direction: "lower", series: [{ at: 1, value: 10 }, { at: 2, value: 12 }, { at: 3, value: 14 }] });
  assert.equal(lower?.baseline, 12);
  assert.equal(lower?.target, 10.8);            // -10% (lower is better)
  assert.equal(lower?.changePercent, -10);

  assert.equal(suggestKpiTarget({ direction: "higher", series: [{ at: 1, value: 5 }, { at: 2, value: 6 }] }), null);   // <3 points → Learning
  assert.equal(suggestKpiTarget({ direction: "higher", series: [] }), null);
});

test("computeCustomKpi combines base metrics via the op, honest on zero/missing operands", () => {
  const numerator = describeCommandKpi(makeKpi({ id: "leads", value: 40, history: [{ at: 1, value: 30 }, { at: 2, value: 40 }] }));
  const denominator = describeCommandKpi(makeKpi({ id: "pageviews", value: 100, history: [{ at: 1, value: 80 }, { at: 2, value: 100 }] }));
  const byId = new Map([numerator, denominator].map(descriptor => [descriptor.id, descriptor]));

  const rate = computeCustomKpi({ id: "cvr", label: "Lead rate", numeratorId: "leads", denominatorId: "pageviews", op: "rate", createdAt: 0 }, byId);
  assert.equal(rate?.kind, "custom");
  assert.equal(rate?.id, "custom:cvr");
  assert.equal(rate?.format, "percent");
  assert.equal(rate?.value, 40);                               // 40 / 100 * 100
  assert.deepEqual(rate?.series, [{ at: 1, value: 37.5 }, { at: 2, value: 40 }]);   // aligned by matching `at`

  assert.equal(computeCustomKpi({ id: "r", label: "r", numeratorId: "leads", denominatorId: "pageviews", op: "ratio", createdAt: 0 }, byId)?.value, 0.4);
  assert.equal(computeCustomKpi({ id: "s", label: "s", numeratorId: "leads", denominatorId: "pageviews", op: "sum", createdAt: 0 }, byId)?.value, 140);
  assert.equal(computeCustomKpi({ id: "d", label: "d", numeratorId: "leads", denominatorId: "pageviews", op: "diff", createdAt: 0 }, byId)?.value, -60);

  const zeroDen = describeCommandKpi(makeKpi({ id: "zero", value: 0, history: [] }));
  const withZero = new Map([numerator, zeroDen].map(descriptor => [descriptor.id, descriptor]));
  assert.equal(computeCustomKpi({ id: "z", label: "z", numeratorId: "leads", denominatorId: "zero", op: "ratio", createdAt: 0 }, withZero)?.value, null);   // no fabricated number

  assert.equal(computeCustomKpi({ id: "m", label: "m", numeratorId: "nope", op: "sum", createdAt: 0 }, byId), null);   // missing operand
});

test("the KPI explorer is registry-backed and offers line, area and bar chart types", () => {
  const workspace = readFileSync("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx", "utf8");
  assert.match(workspace, /describeCommandKpis/, "selector should be fed from the registry");
  assert.match(workspace, /describeCommercialFormulas/, "explorer should also register the 40 commercial formulas");
  assert.match(workspace, /availableDescriptors/);
  assert.match(workspace, /kpi\.series/, "the chart pipeline should plot the registry series");
  assert.match(workspace, /type KpiChartType = "line" \| "area" \| "bar"/);
  assert.match(workspace, /chartType === "area"/);
  assert.match(workspace, /chartType === "bar"/);
  assert.match(workspace, /kpi-registry\/evidence/, "explorer should lazily load radar evidence series");
  assert.match(workspace, /kpi-registry\/targets/, "explorer should persist target overrides to the server");
  assert.match(workspace, /suggestKpiTarget/, "explorer should offer history-based target suggestions");
  assert.match(workspace, /describeCustomKpis/, "explorer should compute + plot custom KPIs");
  assert.match(workspace, /kpi-registry\/custom/, "explorer should create/list custom KPIs via the API");
  const trajectory = readFileSync("src/app/portal/agency/_CommandCentreKpiTrajectory.tsx", "utf8");
  assert.match(trajectory, /Explore all KPIs/, "the executive trajectory should surface the explorer");
  const evidenceRoute = readFileSync("src/app/api/portal/kpi-registry/evidence/route.ts", "utf8");
  assert.match(evidenceRoute, /buildEvidenceDescriptors/, "the evidence route should serve vault-backed descriptors");
});
