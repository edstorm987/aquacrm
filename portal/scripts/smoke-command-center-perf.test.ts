import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  shouldRunHeavyPanels,
  normalizeScanFlag,
  buildPausedBusinessRadar,
  buildPausedIntelligenceSnapshot,
} from "../src/app/portal/agency/commandPerformance";
import type { RadarPolicyConfiguration } from "../src/server/types";

const read = (path: string) => readFileSync(path, "utf8");

// The policy is only read for its operatingStage and stored verbatim on the
// placeholder radar, so a minimal cast is enough to exercise the builder.
const POLICY = { operatingStage: "setup" } as unknown as RadarPolicyConfiguration;

test("Performance mode gates the heavy panels: off = always build, on = paused unless a one-shot scan", () => {
  // Performance mode OFF → the eager build path is intact on every render.
  assert.equal(shouldRunHeavyPanels(false, false), true);
  assert.equal(shouldRunHeavyPanels(false, true), true);
  // Performance mode ON → paused by default (cached-or-on-button, not every
  // navigation), but a one-shot ?scan=1 render forces a fresh build.
  assert.equal(shouldRunHeavyPanels(true, false), false);
  assert.equal(shouldRunHeavyPanels(true, true), true);
});

test("normalizeScanFlag reads the one-shot ?scan=1 flag", () => {
  assert.equal(normalizeScanFlag("1"), true);
  assert.equal(normalizeScanFlag(["1"]), true);
  assert.equal(normalizeScanFlag(undefined), false);
  assert.equal(normalizeScanFlag("0"), false);
  assert.equal(normalizeScanFlag("scan"), false);
});

test("the paused radar placeholder is a well-formed empty sweep, never a fabricated failure", () => {
  const radar = buildPausedBusinessRadar(POLICY, 1_000);
  assert.equal(radar.generatedAt, 1_000);
  assert.equal(radar.summary.critical, 0);
  assert.equal(radar.summary.warning, 0);
  assert.equal(radar.summary.totalChecks, 0);
  assert.deepEqual(radar.incidents, []);
  assert.deepEqual(radar.domains, []);
  assert.deepEqual(radar.checks, []);
  // The agency's real configured policy still flows through so the operating
  // stage reads truthfully rather than being invented.
  assert.equal(radar.adaptive.operatingStage, "setup");
  assert.equal(radar.adaptive.policy, POLICY);
});

test("the paused intelligence placeholder carries no KPIs and honest empty commercial intelligence", () => {
  const snapshot = buildPausedIntelligenceSnapshot("GBP", 2_000);
  assert.equal(snapshot.generatedAt, 2_000);
  assert.equal(snapshot.currency, "GBP");
  assert.deepEqual(snapshot.kpis, []);
  assert.equal(snapshot.summary.connectedKpis, 0);
  assert.equal(snapshot.demandFlow.pageviews, null);
  assert.ok(snapshot.commercialIntelligence, "commercial intelligence must be present");
});

test("the Command Centre page gates radar + intelligence behind runHeavyPanels and keeps the OFF path intact", () => {
  const page = read("src/app/portal/agency/page.tsx");

  // The switch exists and drives a paused flag handed to the client.
  assert.match(page, /shouldRunHeavyPanels\(perfMode, scanRequested\)/);
  assert.match(page, /const scanPaused = !runHeavyPanels/);
  assert.match(page, /scanPaused=\{scanPaused\}/);

  // The heavy sweep is no longer unconditional — it only runs under
  // runHeavyPanels, and the paused branch swaps in the lightweight placeholder.
  assert.match(page, /if \(runHeavyPanels\) \{[\s\S]*getCachedBusinessIssueRadar\(agency\.id\)/);
  assert.match(page, /buildPausedBusinessRadar\(workspaceSettings\.advisor\.radarPolicy/);
  assert.match(page, /runHeavyPanels[\s\S]*buildCommandIntelligenceSnapshot\([\s\S]*buildPausedIntelligenceSnapshot\(/);

  // OFF path unchanged: with Performance mode off, runHeavyPanels is true, so
  // the original five-way Promise.all (radar + alerts + health + brands +
  // attention) still runs exactly as before.
  assert.match(page, /getCachedBusinessIssueRadar\(agency\.id\),\s*\n\s*perfMode \? Promise\.resolve<OperationalAlert\[\]>\(\[\]\) : getRequestOperationalAlerts\(agency\.id\)/);
});

test("the Command Centre client surfaces a Run scan control while paused", () => {
  const client = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  assert.match(client, /scanPaused\?: boolean/);
  assert.match(client, /scanPaused = false/);
  assert.match(client, /data-testid="command-scan-paused"/);
  assert.match(client, /Run scan/);
  // The one-shot flag is stripped after the heavy render so a later refresh
  // returns to the fast paused view rather than rebuilding again.
  assert.match(client, /params\.delete\("scan"\)/);
});
