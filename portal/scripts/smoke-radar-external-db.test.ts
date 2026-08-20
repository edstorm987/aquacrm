import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInfraHealthChecks } from "../src/engines/data/radar/radarInfraChecks";
import { databaseStorageHealth } from "../src/lib/server/databaseStorageHealth";

// Radar upgrade — Stage 4 follow-up: prove the external-database registry is
// wired end to end. External targets are declared in RADAR_EXTERNAL_DB_TARGETS
// (JSON) and their connection strings live in the referenced env var — never in
// the target list, never in state. These tests exercise that path against
// deliberately-unreachable / unconfigured targets, so no real database is
// needed and no secret is handled.

const NOW = Date.parse("2026-08-16T12:00:00.000Z");

function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>): () => Promise<void> {
  return async () => {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
      previous[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      await run();
    } finally {
      for (const key of Object.keys(vars)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  };
}

test("a registered target with no connection string is honestly untested", withEnv({
  RADAR_EXTERNAL_DB_TARGETS: JSON.stringify([{ id: "personal-site", label: "Personal site DB", urlEnvVar: "PERSONAL_SITE_DATABASE_URL" }]),
  PERSONAL_SITE_DATABASE_URL: undefined,
}, async () => {
  const health = await databaseStorageHealth(NOW);
  assert.equal(health.external.length, 1);
  const target = health.external[0]!;
  assert.equal(target.id, "personal-site");
  assert.equal(target.label, "Personal site DB");
  assert.equal(target.external, true);
  assert.equal(target.status, "untested", "no connection string wired → untested, not down and not a fake pass");
  assert.match(target.error ?? "", /PERSONAL_SITE_DATABASE_URL/);
}));

test("a registered target with an unreachable connection string reports down after a real probe", withEnv({
  RADAR_EXTERNAL_DB_TARGETS: JSON.stringify([{ id: "offline-db", label: "Offline DB", urlEnvVar: "OFFLINE_DATABASE_URL" }]),
  // 127.0.0.1:1 is a closed port — the probe makes a real connection attempt that fails fast.
  OFFLINE_DATABASE_URL: "postgresql://probe:probe@127.0.0.1:1/probe",
}, async () => {
  const health = await databaseStorageHealth(NOW);
  const target = health.external[0]!;
  assert.equal(target.status, "down", "an unreachable DB is a real down finding");
  assert.equal(typeof target.latencyMs, "number", "latency is measured even on failure");
  assert.ok(target.error && target.error.length > 0, "the failure reason is captured");
  // And it becomes a critical infra check, not a fake pass.
  const checks = buildInfraHealthChecks(health, NOW);
  const reach = checks.find(c => c.id === "infra:database:offline-db:reachability");
  assert.equal(reach?.status, "critical");
  assert.match(reach?.title ?? "", /External database Offline DB/);
}));

test("multiple targets are each probed independently", withEnv({
  RADAR_EXTERNAL_DB_TARGETS: JSON.stringify([
    { id: "db-a", label: "DB A", urlEnvVar: "DB_A_URL" },
    { id: "db-b", label: "DB B", urlEnvVar: "DB_B_URL" },
  ]),
  DB_A_URL: undefined,
  DB_B_URL: "postgresql://probe:probe@127.0.0.1:1/probe",
}, async () => {
  const health = await databaseStorageHealth(NOW);
  assert.equal(health.external.length, 2);
  assert.equal(health.external.find(t => t.id === "db-a")?.status, "untested");
  assert.equal(health.external.find(t => t.id === "db-b")?.status, "down");
}));

test("malformed or empty target config is ignored gracefully (no external targets)", withEnv({
  RADAR_EXTERNAL_DB_TARGETS: "{not valid json",
}, async () => {
  const health = await databaseStorageHealth(NOW);
  assert.equal(health.external.length, 0);
}));
