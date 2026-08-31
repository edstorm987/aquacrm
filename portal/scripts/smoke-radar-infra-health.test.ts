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

// ══════════════════════════════════════════════════════════════════════════
// HOW OLD IS THIS? — issues #170
// ══════════════════════════════════════════════════════════════════════════
//
// The Infra sweep runs on `cron/radar-probes`, which is scheduled `15 6 * * *`
// — once a day. Every check above was stamped `measuredAt: now` from the Pulse
// that READ the snapshot, and no surface carried `snapshot.checkedAt` at all, so
// a reading taken 23 hours ago rendered byte-identically to one taken a second
// ago. That is the house's own "missing evidence is never a healthy pass" rule
// failing in its quieter form: expired evidence presented as a current pass.
//
// Each case below fails against the old builder: it had no `lastSeenAt`, no age
// evidence, no freshness check, and no staleness rule.

const PROBE_CADENCE_MS = 86_400_000; // vercel.json `15 6 * * *` → daily.

test("an infra check is dated by the probe that produced it, not by the page load", () => {
  // Pulse read six hours after the sweep ran — inside the daily cadence.
  const checks = buildInfraHealthChecks(snapshot(), NOW + 6 * 3_600_000);
  const reach = checks.find(c => c.id === "infra:database:primary:reachability");
  assert.equal(reach?.lastSeenAt, NOW, "the check must carry the snapshot's own checkedAt");
  assert.notEqual(reach?.lastSeenAt, reach?.measuredAt, "the probe time and the Pulse read time are two different facts");
  assert.ok(reach?.evidence.some(line => /Evidence checked 6h ago/.test(line)),
    `the age of the evidence must be readable on the check itself: ${reach?.evidence.join(" | ")}`);
  assert.ok(reach?.evidence.some(line => /Probe cadence 1d/.test(line)),
    "…beside the cadence it is being judged against");
  // Still inside the agreement, so it is still a real pass.
  assert.equal(reach?.status, "pass");
});

test("the snapshot's own age is a check, so 'how old is this?' is answerable on Radar", () => {
  const fresh = buildInfraHealthChecks(snapshot(), NOW + 3_600_000).find(c => c.id === "infra:probe:freshness");
  assert.ok(fresh, "the infra family must expose a probe-freshness check");
  assert.equal(fresh?.status, "pass");
  assert.equal(fresh?.scope, "infra");
  assert.match(fresh?.detail ?? "", /1h ago/, "the freshness check must state the actual age");

  const late = buildInfraHealthChecks(snapshot(), NOW + PROBE_CADENCE_MS + 3_600_000).find(c => c.id === "infra:probe:freshness");
  assert.equal(late?.status, "warning", "a sweep that missed its daily schedule is a warning, not silence");
  const abandoned = buildInfraHealthChecks(snapshot(), NOW + 4 * PROBE_CADENCE_MS).find(c => c.id === "infra:probe:freshness");
  assert.equal(abandoned?.status, "critical", "four days without a probe escalates");
});

test("evidence older than the probe cadence stops being proof — both ways", () => {
  const stale = buildInfraHealthChecks(snapshot(), NOW + 2 * PROBE_CADENCE_MS);
  const reach = stale.find(c => c.id === "infra:database:primary:reachability");
  assert.equal(reach?.status, "blind",
    "a two-day-old 'connected' is not evidence that the database is reachable now");
  assert.match(reach?.detail ?? "", /outside the 1d probe cadence/,
    "…and the reading must say the answer aged out rather than going quiet");
  assert.equal(stale.find(c => c.id === "infra:database:primary:latency")?.status, "blind");

  // The mirror case: an expired failure is not a current failure either.
  const staleDown = buildInfraHealthChecks(
    snapshot({ primary: db({ status: "down", latencyMs: 5000, error: "connection refused" }) }),
    NOW + 2 * PROBE_CADENCE_MS,
  );
  assert.equal(staleDown.find(c => c.id === "infra:database:primary:reachability")?.status, "blind",
    "a two-day-old 'down' is no more current than a two-day-old 'connected'");

  // …but "there is nothing to probe on this backend" does not become a blind
  // spot by ageing. Inactive is a statement about applicability, not evidence.
  const staleUntested = buildInfraHealthChecks(
    snapshot({ primary: db({ backend: "file", status: "untested", latencyMs: null }) }),
    NOW + 2 * PROBE_CADENCE_MS,
  );
  assert.equal(staleUntested.find(c => c.id === "infra:database:primary:reachability")?.status, "inactive");
});

test("the Pulse states when its probe evidence was actually collected", async () => {
  await storage.ensureHydrated({ fresh: true });
  // `radarInfraHealth` is app-wide and survives a fresh hydrate once a sweep in
  // an earlier test has written it, so clear it explicitly — this case is about
  // an estate that has never been probed at all.
  storage.mutate(state => { state.radarInfraHealth = undefined; });
  const agency = createAgency({ name: "Probe Age Co", ownerEmail: "owner@example.com" });

  // Nothing probed yet: the honest answer is "never", NOT the Pulse's own clock.
  const unprobed = await buildBusinessIssueRadar(agency.id, NOW);
  assert.equal(unprobed.summary.probeEvidenceCheckedAt, undefined,
    "with no probe evidence at all, the Pulse must not substitute its own build time");

  await runRadarInfraSweep(NOW);
  const later = NOW + 20 * 3_600_000;
  const radar = await buildBusinessIssueRadar(agency.id, later);
  assert.equal(radar.generatedAt, later);
  assert.equal(radar.summary.probeEvidenceCheckedAt, NOW,
    "the Pulse must report the age of the evidence it rendered, not the moment it rendered it");
  assert.notEqual(radar.summary.probeEvidenceCheckedAt, radar.generatedAt);
});

test("the Pulse reports its OLDEST probe evidence, not whichever sweep ran most recently", async () => {
  await storage.ensureHydrated({ fresh: true });
  storage.mutate(state => { state.radarInfraHealth = undefined; });
  const agency = createAgency({ name: "Split Cadence Co", ownerEmail: "owner@example.com" });

  // The scenario the daily cron actually produces: `runRadarProbeRefresh`
  // SWALLOWS a deep-sweep failure (it returns `ok:false` and leaves the previous
  // canary records untouched), while the Infra snapshot in the very same tick
  // refreshes fine. So a week-old canary sits beside a seconds-old DB reading.
  const staleCanaryAt = NOW - 7 * 86_400_000;
  storage.mutate(state => {
    state.radarSyntheticProbes[agency.id] = {
      "property-a": {
        id: "probe-a", agencyId: agency.id, propertyId: "property-a", label: "Property A",
        url: "https://example.test/", checkedAt: staleCanaryAt, durationMs: 120, ok: true,
        statusCode: 200, redirectCount: 0, dnsAddresses: ["203.0.113.10"],
        securityHeaders: { strictTransportSecurity: true, contentSecurityPolicy: true, frameProtection: true, contentTypeOptions: true, referrerPolicy: true, permissionsPolicy: true },
      },
    };
  });
  await runRadarInfraSweep(NOW);

  const radar = await buildBusinessIssueRadar(agency.id, NOW);
  assert.equal(radar.summary.probeEvidenceCheckedAt, staleCanaryAt,
    "reporting the newest probe would print 'evidence seconds old' over a week-old canary — the same fresh-timestamp-over-stale-evidence lie #170 exists to end");
  assert.notEqual(radar.summary.probeEvidenceCheckedAt, NOW,
    "the fresh Infra snapshot must not speak for the canaries that did not refresh");
});

test("both radar surfaces state the probe-evidence age beside the Pulse build time", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const dashboard = read("src/app/portal/agency/_BusinessRadarDashboard.tsx");
  const inspector = read("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx");
  // The Pulse deck: "Last sweep just now" was true of the Pulse and false about
  // everything under it, with nothing on the surface to tell the two apart.
  assert.match(dashboard, /probeEvidenceCheckedAt/);
  assert.match(dashboard, /probe evidence never collected/,
    "an un-probed deck must say so rather than borrow the Pulse's timestamp");
  assert.doesNotMatch(dashboard, /Last sweep \{formatRadarAge\(radar\.generatedAt\)\}/,
    "the deck calls the Pulse rebuild a 'sweep' again, which is what hid the probe cadence (issues #170)");
  // The inspection workspace: "Generated" alone was the Pulse's build time.
  assert.match(inspector, /Evidence checked/);
  assert.match(inspector, /probeEvidenceCheckedAt \? formatShortDate\(radar\.summary\.probeEvidenceCheckedAt\) : "Never probed"/);
});
