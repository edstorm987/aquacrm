import assert from "node:assert/strict";
import { test } from "node:test";

import type { RadarCheckScope, RadarCheckTier, RadarDataDependency } from "../src/lib/radar/businessRadar";
import {
  RADAR_TIER_BY_SCOPE,
  classifyRadarCheck,
  radarCheckTier,
  radarDataDependency,
} from "../src/lib/radar/radarClassification";
import { BUSINESS_RADAR_RULE_CATALOG } from "../src/lib/radar/radarRuleCatalog";

// Radar upgrade — Stage 2: check classification metadata (tier + dataDependency).
// Additive over the catalogue: every one of the 2,064 rules and every scope
// classifies to a valid tier + data dependency, with no id or count change.

const SCOPES: RadarCheckScope[] = ["kpi", "source", "property", "synthetic", "history", "watchdog", "infra"];
const TIERS = new Set<RadarCheckTier>(["instant", "probe", "rollup"]);
const DEPENDENCIES = new Set<RadarDataDependency>(["in-state", "derived", "external"]);
const HISTORY_DEPENDENT_LENSES = new Set(["trend", "anomaly", "baseline", "forecast", "volatility"]);

test("every scope maps to a valid tier", () => {
  for (const scope of SCOPES) {
    const tier = RADAR_TIER_BY_SCOPE[scope];
    assert.ok(TIERS.has(tier), `${scope} → ${tier} is not a valid tier`);
    assert.equal(radarCheckTier(scope), tier);
  }
  // Scope records how a check is produced, so tier follows it exactly.
  assert.equal(RADAR_TIER_BY_SCOPE.kpi, "instant");
  assert.equal(RADAR_TIER_BY_SCOPE.synthetic, "probe");
  assert.equal(RADAR_TIER_BY_SCOPE.history, "rollup");
});

test("classifyRadarCheck resolves both axes for representative checks", () => {
  assert.deepEqual(classifyRadarCheck({ scope: "kpi", lens: "threshold" }), { tier: "instant", dataDependency: "in-state" });
  // A history-leaning lens on an in-state scope flags a derived dependency.
  assert.deepEqual(classifyRadarCheck({ scope: "kpi", lens: "baseline" }), { tier: "instant", dataDependency: "derived" });
  assert.deepEqual(classifyRadarCheck({ scope: "kpi", lens: "trend" }), { tier: "instant", dataDependency: "derived" });
  // A live network probe — the answer comes from outside AquaCRM.
  assert.deepEqual(classifyRadarCheck({ scope: "synthetic", lens: "connection" }), { tier: "probe", dataDependency: "external" });
  // Tag telemetry is external even though the sentinel is assembled in-state.
  assert.deepEqual(classifyRadarCheck({ scope: "property", lens: "threshold" }), { tier: "instant", dataDependency: "external" });
  // The evidence-layer checks are the rollup tier and depend on retained history.
  assert.deepEqual(classifyRadarCheck({ scope: "history", lens: "anomaly" }), { tier: "rollup", dataDependency: "derived" });
  assert.deepEqual(classifyRadarCheck({ scope: "watchdog", lens: "freshness" }), { tier: "instant", dataDependency: "in-state" });
  // Infra (DB/storage) is a live probe → probe tier, external dependency (Stage 4).
  assert.deepEqual(classifyRadarCheck({ scope: "infra", lens: "connection" }), { tier: "probe", dataDependency: "external" });
});

test("every catalogue rule carries a valid, correct classification (all 2,064)", () => {
  assert.equal(BUSINESS_RADAR_RULE_CATALOG.length, 2064, "catalogue rule count must not change");
  for (const rule of BUSINESS_RADAR_RULE_CATALOG) {
    // Catalogue rules are all kpi-scope → instant tier.
    assert.equal(rule.tier, "instant", `${rule.id} should be instant`);
    assert.ok(TIERS.has(rule.tier), `${rule.id} has invalid tier ${rule.tier}`);
    assert.ok(DEPENDENCIES.has(rule.dataDependency), `${rule.id} has invalid dependency ${rule.dataDependency}`);
    const expected = HISTORY_DEPENDENT_LENSES.has(rule.lens) ? "derived" : "in-state";
    assert.equal(rule.dataDependency, expected, `${rule.id} dependency should be ${expected}`);
    assert.deepEqual({ tier: rule.tier, dataDependency: rule.dataDependency }, classifyRadarCheck({ scope: "kpi", lens: rule.lens }));
  }
});

test("radarDataDependency is exposed directly and agrees with classifyRadarCheck", () => {
  assert.equal(radarDataDependency({ scope: "kpi", lens: "integrity" }), "in-state");
  assert.equal(radarDataDependency({ scope: "synthetic", lens: "threshold" }), "external");
  assert.equal(radarDataDependency({ scope: "history", lens: "baseline" }), "derived");
});
