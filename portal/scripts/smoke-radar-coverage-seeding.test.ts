import assert from "node:assert/strict";
import { test } from "node:test";

import type { RadarTelemetrySnapshot } from "../src/lib/server/radarTelemetry";
import {
  RADAR_COVERAGE_TEMPLATES,
  coverageTemplateFor,
  resolveRadarCoverage,
  type RadarCoverageInputEntity,
} from "../src/lib/radarCoverageRegistry";
import { buildRadarWatchdogChecks } from "../src/lib/radarSentinels";
import * as storage from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { buildBusinessIssueRadar, getCachedBusinessIssueRadar } from "../src/lib/server/businessIssueRadar";

// Radar upgrade — Stage 6: auto-coverage for new entities (registry + seeder + watchdog proof).

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const EMPTY_TELEMETRY = { properties: [] } as unknown as RadarTelemetrySnapshot;

test("every covered entity type has a template, plus a generic fallback", () => {
  for (const type of ["client", "product", "property", "integration", "portal-connection", "trading-company", "generic"] as const) {
    assert.ok(RADAR_COVERAGE_TEMPLATES[type], `${type} template missing`);
    assert.ok(RADAR_COVERAGE_TEMPLATES[type].checkFloor >= 3, `${type} should seed at least 3 checks`);
  }
  // An unknown entity type falls to the generic pack rather than erroring.
  assert.equal(coverageTemplateFor("something-new").packId, "generic");
  assert.equal(coverageTemplateFor("client").packId, "client-core");
});

test("resolveRadarCoverage resolves known types bespoke, unknown to fallback, and flags true gaps", () => {
  const entities: RadarCoverageInputEntity[] = [
    { type: "client", id: "c1", label: "Client One", active: true },
    { type: "product", id: "p1", label: "Product One" }, // calibrating (no active flag)
    { type: "widget", id: "w1", label: "Unknown widget" }, // unknown type → fallback
    { type: "client", id: "", label: "Broken" }, // missing id → gap
  ];
  const manifest = resolveRadarCoverage(entities);
  assert.equal(manifest.entries.length, 3, "the id-less entity is dropped as a gap, not an entry");
  assert.equal(manifest.covered, 2, "client + product are bespoke");
  assert.equal(manifest.fallback, 1, "the unknown widget is on the generic fallback");
  assert.equal(manifest.gaps, 1, "the id-less entity is a gap");
  assert.equal(manifest.calibrating, 2, "the product and the widget are calibrating");
  assert.equal(manifest.byType.client, 1);
});

test("the watchdog coverage-gaps check proves seeding, and is absent without a manifest", () => {
  const base = { checks: [], coverage: [], telemetry: EMPTY_TELEMETRY, correlationIssues: [], now: NOW };
  // No manifest → no coverage-gaps check (back-compat with existing callers).
  assert.equal(buildRadarWatchdogChecks(base).some(c => c.familyId === "watchdog:coverage-gaps"), false);
  // All bespoke → pass.
  const clean = buildRadarWatchdogChecks({ ...base, coverageManifest: resolveRadarCoverage([{ type: "client", id: "c1", label: "C1" }]) });
  assert.equal(clean.find(c => c.familyId === "watchdog:coverage-gaps")?.status, "pass");
  // A fallback entity → watch (covered, but generically).
  const fallback = buildRadarWatchdogChecks({ ...base, coverageManifest: resolveRadarCoverage([{ type: "mystery", id: "m1", label: "M1" }]) });
  assert.equal(fallback.find(c => c.familyId === "watchdog:coverage-gaps")?.status, "watch");
  // A true gap → critical blind spot.
  const gap = buildRadarWatchdogChecks({ ...base, coverageManifest: resolveRadarCoverage([{ type: "client", id: "", label: "broken" }]) });
  assert.equal(gap.find(c => c.familyId === "watchdog:coverage-gaps")?.status, "critical");
});

test("a real sweep produces a coverage manifest with no gaps and the watchdog agrees", async () => {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Coverage Fixture Co", ownerEmail: "owner@example.com" });
  const radar = await buildBusinessIssueRadar(agency.id, NOW);
  assert.equal(radar.coverageManifest.gaps, 0, "a real sweep must never leave an entity un-watched");
  assert.equal(radar.summary.coverageGaps, 0);
  const gapsCheck = radar.checks.find(check => check.familyId === "watchdog:coverage-gaps");
  assert.ok(gapsCheck, "the coverage-gaps watchdog check is present in a real sweep");
  assert.notEqual(gapsCheck?.status, "critical");
});

test("creating a client auto-seeds its coverage on the next sweep (event invalidates the cache)", async () => {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Seeding Fixture Co", ownerEmail: "owner@example.com" });
  // Prime the 30s Pulse cache with the empty picture.
  const before = await getCachedBusinessIssueRadar(agency.id, NOW);
  assert.equal(before.coverageManifest.byType.client, 0);
  // Create a client — client.created fires, the seeding hook invalidates the cache.
  const client = createClient(agency.id, { name: "Fresh Client" });
  // The eventBus dispatches handlers as microtasks; let them settle (a real
  // request after creation is a later tick, so the cache is invalidated by then).
  await new Promise(resolve => setTimeout(resolve, 0));
  const after = await getCachedBusinessIssueRadar(agency.id, NOW + 1);
  const entry = after.coverageManifest.entries.find(e => e.id === client.id);
  assert.ok(entry, "the new client must appear in coverage immediately, not after the cache TTL");
  assert.equal(entry?.type, "client");
  assert.equal(entry?.template, "bespoke");
});
