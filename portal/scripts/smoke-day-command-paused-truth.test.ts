import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  clientAttentionTruth,
  dayRadarTruth,
  daySensorWatchState,
  intelligenceAttentionTruth,
} from "../src/app/portal/agency/dayCommandTruth";

const read = (path: string) => readFileSync(path, "utf8");

test("paused zero-shaped Radar evidence is unknown, while a completed zero scan is clear", () => {
  assert.deepEqual(dayRadarTruth({ critical: 0, warning: 0 }, true), {
    state: "unknown",
    watchLabel: "Unknown",
    criticalLabel: "Unknown",
    warningLabel: "Unknown",
    contacts: null,
  });
  assert.deepEqual(dayRadarTruth({ critical: 0, warning: 0 }, false), {
    state: "clear",
    watchLabel: "Clear",
    criticalLabel: "0",
    warningLabel: "0",
    contacts: 0,
  });
});

test("known negative evidence remains visible even if another instrument is deferred", () => {
  assert.equal(dayRadarTruth({ critical: 2, warning: 1 }, true).state, "critical");
  assert.equal(daySensorWatchState({ critical: 0, warning: 0 }, true, ["critical"], true), "critical");
  assert.equal(daySensorWatchState({ critical: 0, warning: 0 }, true, [], true), "unknown");
  assert.equal(daySensorWatchState({ critical: 0, warning: 0 }, false, ["learning"], false), "learning");
  assert.equal(daySensorWatchState({ critical: 0, warning: 0 }, false, ["healthy"], false), "healthy");
});

test("empty client and KPI rollups need a completed scan before they can claim clear", () => {
  assert.deepEqual(clientAttentionTruth(0, 0, true), { tone: "info", label: "Not scanned" });
  assert.deepEqual(clientAttentionTruth(0, 0, false), { tone: "clear", label: "All clear" });
  assert.deepEqual(clientAttentionTruth(2, 1, true), { tone: "critical", label: "2 to review · 1 at risk" });
  assert.deepEqual(intelligenceAttentionTruth(0, true), { tone: "info", label: "KPI scan paused" });
  assert.deepEqual(intelligenceAttentionTruth(0, false), { tone: "clear", label: "0 on watch" });
});

test("every Day Command evidence surface consumes the reconciled paused state", () => {
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const briefing = read("src/app/portal/agency/_DayBriefingPanel.tsx");
  const sensor = read("src/app/portal/agency/_DayCommandSensorPanel.tsx");
  const kpis = read("src/app/portal/agency/_DayKpiIntelligencePanel.tsx");
  const clients = read("src/app/portal/agency/_ClientsNeedingAttention.tsx");

  assert.match(dashboard, /radarPaused=\{displayedRadarIsPaused\}/);
  assert.match(dashboard, /paused=\{displayedIntelligenceIsPaused\}/);
  assert.match(dashboard, /intelligencePaused=\{displayedIntelligenceIsPaused\}/);
  assert.match(dashboard, /<ClientsNeedingAttention items=\{clientsNeedingAttention\} radarPaused=\{displayedRadarIsPaused\}/);
  assert.match(dashboard, /!scanPaused && previousServerScanPausedRef\.current && radarSnapshot === previousServerRadarRef\.current/);
  assert.match(dashboard, /!scanPaused && previousServerIntelligenceScanPausedRef\.current && intelligenceState === previousServerIntelligenceRef\.current/);

  assert.match(briefing, /dayRadarTruth\(radar\.summary, radarPaused\)/);
  assert.match(briefing, /Radar evidence not loaded · run scan for current watch/);
  assert.match(sensor, /Critical unknown · warning unknown/);
  assert.match(sensor, /BUSINESS WATCH NOT SCANNED/);
  assert.match(kpis, /intelligenceAttentionTruth\(attention, paused\)/);
  assert.match(clients, /clientAttentionTruth\(items\.length, risk, radarPaused\)/);
});
