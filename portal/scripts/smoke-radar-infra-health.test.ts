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

// ══════════════════════════════════════════════════════════════════════════
// MODULE HEALTH — the second thing the sweep structure had to make true
// ══════════════════════════════════════════════════════════════════════════
//
// `systems:module-health` counts modules "reporting failed health" out of
// `PluginInstall.health`. Until 2026-08-30 that field had NO WRITER anywhere in
// `src/`: the plugin health route ran the hooks and returned them to the
// browser, and nothing was ever recorded. So the count was structurally 0 for
// every agency forever, drawn as a green tick — the exact shape of "a check
// that never ran, rendered as a pass" that the infra sweep above exists to
// refuse. It also dated the signal with `healthCheckedAt ?? installedAt`,
// reporting the day a module was INSTALLED as the day its health was last seen.
//
// The sweep writes the answers now; these four cases are what Radar must do
// with them. Every one of them fails against the old code: an unchecked install
// used to pass, and the family used to carry an install-date timestamp.

import { createClient } from "../src/server/tenants";
import { getInstall, recordInstallHealth, upsertInstall } from "../src/server/pluginInstalls";
import { runPluginHealthSweep } from "../src/lib/server/plugins/pluginHealthRunner";
import { buildBusinessIssueRadar } from "../src/engines/data/server/radar/businessIssueRadar";
import { createAgency } from "../src/server/tenants";
import type { BusinessIssueRadar } from "../src/engines/data/radar/businessRadar";

const DAY = 86_400_000;
// The twelve KPI-lens checks the family produces from the live observation. The
// four `history:` checks beside them are the evidence layer's own (they read the
// stored time-series, not this observation, and stay in "learning" until one
// exists) — folding them in here would hide whether the KPI reading moved.
const moduleHealthChecks = (radar: BusinessIssueRadar) =>
  radar.checks.filter(check => check.domain === "systems" && check.familyId === "module-health" && check.scope === "kpi");

async function agencyWithModule(): Promise<{ agencyId: string; clientId: string }> {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Module Health Co", ownerEmail: "owner@example.com" });
  const client = createClient(agency.id, { name: "Module Health Client" });
  await upsertInstall({
    pluginId: "client-crm",
    scope: { agencyId: agency.id, clientId: client.id },
    enabled: true,
    config: {},
    features: {},
  });
  return { agencyId: agency.id, clientId: client.id };
}

test("a module nobody has ever health-checked is a blind spot, not a pass", async () => {
  const { agencyId } = await agencyWithModule();
  const checks = moduleHealthChecks(await buildBusinessIssueRadar(agencyId, NOW));
  assert.ok(checks.length > 0, "the module-health family must be present at all");
  assert.ok(checks.every(check => check.status === "blind"),
    `an install with no recorded health cannot prove "0 modules failing": ${
      [...new Set(checks.map(check => check.status))].join(", ")}`);
  assert.ok(checks.every(check => check.lastSeenAt === undefined),
    "the install date is not a health-check date and must not stand in for one");
  assert.match(checks[0]?.detail ?? "", /never checked/,
    "the blind spot must say what is missing, not merely be blind");
});

test("once the sweep has asked, the answer is what Radar counts", async () => {
  const { agencyId, clientId } = await agencyWithModule();
  await runPluginHealthSweep(agencyId, { now: NOW });
  // The sweep ran the module's OWN hook and stored what it said.
  assert.equal(getInstall({ agencyId, clientId }, "client-crm")?.healthCheckedAt, NOW);

  const checks = moduleHealthChecks(await buildBusinessIssueRadar(agencyId, NOW));
  assert.ok(checks.some(check => check.status === "pass"),
    "a module that answered healthy must now be able to prove it");
  assert.ok(checks.every(check => check.lastSeenAt === NOW),
    "the signal is dated by the check that produced it");
});

test("an answer stops being proof once it goes stale", async () => {
  const { agencyId } = await agencyWithModule();
  await runPluginHealthSweep(agencyId, { now: NOW });
  const checks = moduleHealthChecks(await buildBusinessIssueRadar(agencyId, NOW + 3 * DAY));
  assert.ok(checks.every(check => check.status === "blind"),
    "a three-day-old 'healthy' is not evidence that a module is healthy now");
  assert.match(checks[0]?.detail ?? "", /not checked for over/,
    "…and the reading must say the answer aged out, rather than just going quiet");
});

test("a module that said no is never buried by a blind spot beside it", async () => {
  const { agencyId, clientId } = await agencyWithModule();
  // One module answered, and answered badly. A second was never asked — the
  // partial-coverage case, where a naive "not fully covered ⇒ blind" would hide
  // a proven failure behind an unknown.
  recordInstallHealth({ agencyId, clientId }, "client-crm",
    { health: { ok: false, message: "storage unreachable" }, healthCheckedAt: NOW });
  await upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId },
    enabled: true,
    config: {},
    features: {},
  });

  const checks = moduleHealthChecks(await buildBusinessIssueRadar(agencyId, NOW));
  assert.ok(checks.some(check => check.status === "warning" || check.status === "critical"),
    `a recorded failure must still fire: ${[...new Set(checks.map(check => check.status))].join(", ")}`);
  assert.match(checks.find(check => check.status === "warning" || check.status === "critical")?.detail ?? "", /never checked/,
    "…while still saying that the rest of the estate is unproven");
});

test("an expired failure is not a current failure either — the stale rule cuts both ways", async () => {
  // The mirror of the case above, and the one a one-directional stale rule gets
  // wrong. If an expired "no" still counted, the family would keep rendering a
  // CONNECTED failure — escalating from warning to critical as the answer aged —
  // off a reading the very same code refuses to accept as proof of health, with
  // a detail line beneath it saying nobody has a current answer at all.
  const { agencyId, clientId } = await agencyWithModule();
  recordInstallHealth({ agencyId, clientId }, "client-crm",
    { health: { ok: false, message: "storage unreachable" }, healthCheckedAt: NOW });

  const fresh = moduleHealthChecks(await buildBusinessIssueRadar(agencyId, NOW));
  assert.ok(fresh.some(check => check.status === "warning" || check.status === "critical"),
    "while it is current, the recorded failure must fire");

  const expired = moduleHealthChecks(await buildBusinessIssueRadar(agencyId, NOW + 3 * DAY));
  assert.ok(expired.every(check => check.status === "blind"),
    `a three-day-old "failing" is not evidence that a module is failing now: ${
      [...new Set(expired.map(check => check.status))].join(", ")}`);
  assert.match(expired[0]?.detail ?? "", /not checked for over/,
    "…and it must say the answer aged out rather than keep asserting the failure");
});

test("a module's coverage row is dated by a real check, never by its install date", async () => {
  const { agencyId } = await agencyWithModule();
  const before = await buildBusinessIssueRadar(agencyId, NOW);
  const row = (radar: BusinessIssueRadar) => radar.coverage.find(source => source.id.startsWith("module:client-crm"));
  assert.ok(row(before), "an installed module must appear as a coverage source");
  assert.equal(row(before)?.lastActivityAt, undefined,
    "a module nobody has contacted has no last-seen — installedAt was a substituted date");

  await runPluginHealthSweep(agencyId, { now: NOW });
  assert.equal(row(await buildBusinessIssueRadar(agencyId, NOW))?.lastActivityAt, NOW);
});
