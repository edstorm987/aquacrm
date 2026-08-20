import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdvisorDomain, BusinessIssueRadar, RadarCheckTier, RadarDataDependency } from "../src/lib/radar/businessRadar";
import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { buildBusinessIssueRadar } from "../src/lib/server/radar/businessIssueRadar";

// Radar upgrade — Stage 3: fixture-driven golden sweep.
//
// Seeds a KNOWN PortalState fixture (one fresh agency, no clients / installs /
// telemetry) and runs the *real* Pulse (`buildBusinessIssueRadar`) end-to-end —
// observations → 2,052-check matrix → correlations → sentinels → watchdog →
// policy → memory. Then asserts the produced structure. Unlike the contract
// tests (which read source text), this proves the sweep actually evaluates:
// if the pipeline's behaviour drifts, the counts move and this fails.
//
// Structural counts are date-independent (verified across dates), so they are
// snapshotted exactly; time-sensitive status counts are asserted as invariants.

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const TIERS = new Set<RadarCheckTier>(["instant", "probe", "rollup"]);
const DEPENDENCIES = new Set<RadarDataDependency>(["in-state", "derived", "external"]);
const DOMAINS: AdvisorDomain[] = ["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"];

async function goldenSweep(now = NOW): Promise<BusinessIssueRadar> {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Golden Fixture Co", ownerEmail: "owner@example.com" });
  return buildBusinessIssueRadar(agency.id, now);
}

test("golden sweep produces the expected catalogue + check structure", async () => {
  const radar = await goldenSweep();
  // The 2,064-rule catalogue is intact and is the core of the check set.
  // (2,040 + two 12-lens Phase-5 families: sales:enquiry-routing + development:injection-coverage.)
  assert.equal(radar.summary.catalogChecks, 2064, "the 2,064-rule catalogue must run in full");
  // Full structural shape for the empty-agency fixture (date-independent).
  // 2,957 baseline (+32 for the two new families: 24 catalogue lenses + 8 evidence-layer
  // checks) + 1 infra check (un-probed) + 1 coverage-gaps watchdog check (Stage 6).
  assert.equal(radar.summary.totalChecks, 2959);
  assert.equal(radar.summary.infraChecks, 1, "Pulse-only build shows one un-probed infra check");
  assert.equal(radar.checks.length, radar.summary.totalChecks, "summary count must match the actual checks array");
  assert.equal(radar.summary.totalSources, 16);
  assert.equal(radar.summary.sentinelChecks, 145); // includes the +1 coverage-gaps watchdog check (Stage 6)
  assert.equal(radar.summary.watchdogChecks, 17);
  // The infra check exists, is infra-scope, and is honestly "learning" (not a fake pass) before any sweep.
  const infra = radar.checks.find(check => check.scope === "infra");
  assert.ok(infra, "an infra-scope check must be present");
  assert.equal(infra?.status, "learning");
  assert.equal(infra?.tier, "probe");
  assert.equal(infra?.dataDependency, "external");
});

test("golden sweep partitions every check into exactly one status bucket", async () => {
  const s = (await goldenSweep()).summary;
  const partition = s.passedChecks + s.firingChecks + s.watchChecks + s.blindChecks + s.learningChecks + s.inactiveChecks;
  assert.equal(partition, s.totalChecks, "every check must fall into exactly one status bucket");
  // A blind check is never counted as assured (the core blind-spot contract).
  assert.equal(s.assuredChecks, s.passedChecks + s.firingChecks);
  assert.equal(s.applicableChecks, s.totalChecks - s.inactiveChecks);
});

test("golden sweep stamps every check with a valid tier + data dependency (Stage 2 wired in)", async () => {
  const radar = await goldenSweep();
  for (const check of radar.checks) {
    assert.ok(check.tier && TIERS.has(check.tier), `${check.id} is missing a valid tier`);
    assert.ok(check.dataDependency && DEPENDENCIES.has(check.dataDependency), `${check.id} is missing a valid data dependency`);
  }
  // Every domain is represented in the sweep's domain summary.
  const summarised = new Set(radar.domains.map(domain => domain.domain));
  for (const domain of DOMAINS) assert.ok(summarised.has(domain), `domain ${domain} missing from the sweep`);
});

test("golden sweep honours zero-blindness for an uninstrumented agency", async () => {
  const radar = await goldenSweep();
  // A fresh agency proves nothing yet, so it must carry visible blind spots — never a false pass.
  assert.ok(radar.summary.blindChecks > 0, "an uninstrumented agency must surface blind checks");
  assert.ok(radar.summary.blindSpots > 0, "disconnected sources must surface as coverage blind spots");
  // The disconnected-source blind-spot incident is raised (deterministic: 1 of 16 sources connected).
  assert.ok(
    radar.issues.some(issue => issue.id === "coverage:business-blind-spots"),
    "the business blind-spots coverage issue must be present",
  );
});

test("golden sweep is deterministic for a fixed clock", async () => {
  const first = await goldenSweep();
  const second = await goldenSweep();
  // Same fixture + same now → identical summary. Guards against hidden wall-clock/randomness in the pipeline.
  assert.deepEqual(second.summary, first.summary);
});
