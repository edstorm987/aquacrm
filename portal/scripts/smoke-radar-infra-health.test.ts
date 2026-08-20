import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { RadarInfraDatabaseHealth, RadarInfraHealthSnapshot } from "../src/engines/data/radar/businessRadar";
import { buildInfraHealthChecks } from "../src/engines/data/radar/radarInfraChecks";
import * as storage from "../src/server/storage";
import { databaseStorageHealth } from "../src/lib/server/databaseStorageHealth";
import { runRadarInfraSweep } from "../src/engines/data/server/radar/radarSweeps";

// Radar upgrade — Stage 4: DB & storage health (the first new signal on the sweep structure).

const NOW = Date.parse("2026-08-16T12:00:00.000Z");

function db(overrides: Partial<RadarInfraDatabaseHealth>): RadarInfraDatabaseHealth {
  return { id: "primary", label: "AquaCRM database", backend: "postgres", status: "connected", latencyMs: 40, external: false, ...overrides };
}

function snapshot(overrides: Partial<RadarInfraHealthSnapshot> = {}): RadarInfraHealthSnapshot {
  return {
    checkedAt: NOW,
    primary: db({}),
    external: [],
    storage: { backend: "postgres", bucketBytes: null, measurable: false, note: "not available in-app" },
    ...overrides,
  };
}

test("infra checks map a connected DB to pass, a down DB to critical", () => {
  const checks = buildInfraHealthChecks(snapshot(), NOW);
  const reach = checks.find(c => c.id === "infra:database:primary:reachability");
  const latency = checks.find(c => c.id === "infra:database:primary:latency");
  assert.equal(reach?.status, "pass");
  assert.equal(reach?.scope, "infra");
  assert.equal(latency?.status, "pass"); // 40ms is well under the guardrail

  const down = buildInfraHealthChecks(snapshot({ primary: db({ status: "down", latencyMs: 5000, error: "connection refused" }) }), NOW);
  assert.equal(down.find(c => c.id === "infra:database:primary:reachability")?.status, "critical");
  assert.equal(down.find(c => c.id === "infra:database:primary:latency")?.status, "critical");
});

test("a slow DB warns before it is critical", () => {
  assert.equal(buildInfraHealthChecks(snapshot({ primary: db({ latencyMs: 600 }) }), NOW).find(c => c.id === "infra:database:primary:latency")?.status, "warning");
  assert.equal(buildInfraHealthChecks(snapshot({ primary: db({ latencyMs: 1200 }) }), NOW).find(c => c.id === "infra:database:primary:latency")?.status, "critical");
});

test("an untested backend is inactive — never a fake pass", () => {
  const checks = buildInfraHealthChecks(snapshot({ primary: db({ backend: "file", status: "untested", latencyMs: null }) }), NOW);
  assert.equal(checks.find(c => c.id === "infra:database:primary:reachability")?.status, "inactive");
  assert.equal(checks.find(c => c.id === "infra:database:primary:latency")?.status, "inactive");
});

test("external database targets get their own reachability + latency checks", () => {
  const checks = buildInfraHealthChecks(snapshot({
    external: [db({ id: "personal-site", label: "Personal site DB", external: true, status: "down", latencyMs: 9000, error: "timeout" })],
  }), NOW);
  const reach = checks.find(c => c.id === "infra:database:personal-site:reachability");
  assert.ok(reach, "external target must produce a reachability check");
  assert.equal(reach?.status, "critical");
  assert.match(reach?.title ?? "", /External database Personal site DB/);
});

test("storage bytes are shown as not-available rather than faked", () => {
  const storageCheck = buildInfraHealthChecks(snapshot(), NOW).find(c => c.id === "infra:storage:usage");
  assert.equal(storageCheck?.status, "inactive");
  assert.match(storageCheck?.detail ?? "", /not available/i);
});

test("with no snapshot the Pulse shows one honest un-probed check", () => {
  const checks = buildInfraHealthChecks(undefined, NOW);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]?.status, "learning");
  assert.equal(checks[0]?.scope, "infra");
});

test("databaseStorageHealth probes the memory backend honestly (untested, no external)", async () => {
  await storage.ensureHydrated({ fresh: true });
  const health = await databaseStorageHealth(NOW);
  // The test backend is memory → no external DB to reach → untested, not down, not a fake connected.
  assert.equal(health.primary.status, "untested");
  assert.equal(health.primary.external, false);
  assert.equal(health.external.length, 0);
  assert.equal(health.storage.measurable, false);
});

test("runRadarInfraSweep persists the snapshot to radarInfraHealth", async () => {
  await storage.ensureHydrated({ fresh: true });
  assert.equal(storage.getState().radarInfraHealth, undefined);
  const health = await runRadarInfraSweep(NOW);
  assert.equal(health.checkedAt, NOW);
  assert.deepEqual(storage.getState().radarInfraHealth, health);
});

test("the Command Centre renders a Database & storage health panel from radar.infra", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const panel = read("src/app/portal/agency/_InfraHealthPanel.tsx");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const healthz = read("src/app/healthz/full/route.ts");
  // The panel exists and reads the infra snapshot.
  assert.match(panel, /Database &amp; storage health/);
  assert.match(panel, /RadarInfraHealthSnapshot/);
  assert.match(panel, /not available in-app|storage\.note/);
  // It is wired into the Command Centre radar feed with the live snapshot.
  assert.match(dashboard, /InfraHealthPanel/);
  assert.match(dashboard, /<InfraHealthPanel infra=\{businessRadar\.infra\}/);
  // healthz/full reuses the promoted probe rather than its own probeDb copy.
  assert.match(healthz, /databaseStorageHealth/);
  assert.match(healthz, /primaryDbProbeStatus/);
});
