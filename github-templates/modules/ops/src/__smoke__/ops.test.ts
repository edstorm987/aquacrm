// In-process smoke for @aqua/plugin-ops.
//
// Drives MonitoringService against an in-memory PluginStorage. Since
// no provider creds are set, every panel falls back to fixture rows;
// after appending uptime samples, the uptime panel reports those
// samples instead of the fixture. Provider stubs are smoke-tested by
// asserting null-on-no-creds.

import test from "node:test";
import assert from "node:assert/strict";

import type { PluginStorage } from "../lib/aquaPluginTypes";
import { MonitoringService } from "../server/monitoringService";
import { runHealthcheckPass } from "../server/healthcheck";
import {
  buildFixtureSnapshot,
  deltaPct,
  formatLatency,
  formatMoney,
  formatUptime,
} from "../lib/monitoring";
import {
  fetchPostmarkSpendCents,
  fetchSentryErrorTotals,
  fetchStripeSpendCents,
  fetchVercelSlowRoutes,
  isSentryQueryable,
  isVercelAnalyticsQueryable,
  readProviderEnv,
} from "../server/providers";

function memStorage(): PluginStorage {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key) as undefined;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async del(key) {
      map.delete(key);
    },
    async list(prefix = "") {
      return Array.from(map.keys()).filter((k) => k.startsWith(prefix));
    },
  };
}

test("formatters handle null + happy path", () => {
  assert.equal(formatUptime(null), "—");
  assert.equal(formatUptime(99.95), "99.95%");
  assert.equal(formatLatency(null), "—");
  assert.equal(formatLatency(317.4), "317 ms");
  assert.equal(formatMoney(null), "—");
  assert.match(formatMoney(17_842, "USD"), /\$178\.42/);
  assert.equal(deltaPct(null, 100), null);
  assert.equal(deltaPct(100, 0), null);
  assert.equal(deltaPct(110, 100), 10);
});

test("buildFixtureSnapshot returns the four panels", () => {
  const snap = buildFixtureSnapshot(1_700_000_000_000);
  assert.equal(snap.generatedAt, 1_700_000_000_000);
  assert.ok(snap.uptime.length >= 1);
  assert.ok(snap.errorRate.length >= 1);
  assert.ok(snap.slowRoutes.length >= 1);
  assert.ok(snap.costs.length >= 1);
  // shared-portal fixture has top issues; per-client targets don't.
  const shared = snap.errorRate.find((r) => r.target.id === "shared-portal");
  assert.ok(shared);
  assert.ok((shared!.topIssues ?? []).length > 0);
});

test("MonitoringService.snapshot falls back to fixture with no creds", async () => {
  const service = new MonitoringService({ storage: memStorage() });
  const snap = await service.snapshot();
  assert.ok(snap.uptime.length > 0);
  assert.ok(snap.costs.every((c) => c.live === false));
  assert.ok(snap.slowRoutes.every((r) => r.source === "fixture"));
});

test("MonitoringService.appendUptimeSample bypasses fixture for that target", async () => {
  let now = 1_700_000_000_000;
  const service = new MonitoringService({ storage: memStorage(), now: () => now });
  await service.appendUptimeSample("shared-portal", { ok: true, latencyMs: 312, status: 200 });
  now += 60_000;
  await service.appendUptimeSample("shared-portal", { ok: true, latencyMs: 298, status: 200 });
  const snap = await service.snapshot();
  const shared = snap.uptime.find((r) => r.target.id === "shared-portal");
  assert.ok(shared);
  assert.equal(shared!.uptime24h, 100);
  assert.equal(shared!.lastSample?.latencyMs, 298);
  assert.ok(shared!.avgLatencyMs && shared!.avgLatencyMs > 290 && shared!.avgLatencyMs < 320);
});

test("UptimeStore expires samples older than the 24h window", async () => {
  let now = 1_700_000_000_000;
  const service = new MonitoringService({ storage: memStorage(), now: () => now });
  await service.appendUptimeSample("shared-portal", { ok: true });
  now += 25 * 60 * 60 * 1000;
  await service.appendUptimeSample("shared-portal", { ok: false, error: "HTTP 500" });
  const snap = await service.snapshot();
  const shared = snap.uptime.find((r) => r.target.id === "shared-portal");
  assert.ok(shared);
  // The first sample expired; only the second remains. uptime24h = 0%.
  assert.equal(shared!.uptime24h, 0);
});

test("provider stubs return null without creds", async () => {
  const env = {};
  assert.equal(await fetchSentryErrorTotals(env, 60_000), null);
  assert.equal(await fetchVercelSlowRoutes(env), null);
  assert.equal(await fetchStripeSpendCents(undefined, 60_000), null);
  assert.equal(await fetchPostmarkSpendCents(undefined, 60_000), null);
  assert.equal(isSentryQueryable(env), false);
  assert.equal(isVercelAnalyticsQueryable(env), false);
});

test("readProviderEnv reflects process.env", () => {
  const before = process.env["VERCEL_TOKEN"];
  process.env["VERCEL_TOKEN"] = "fake-token";
  try {
    const env = readProviderEnv();
    assert.equal(env.vercelToken, "fake-token");
    assert.equal(isVercelAnalyticsQueryable(env), true);
  } finally {
    if (before === undefined) delete process.env["VERCEL_TOKEN"];
    else process.env["VERCEL_TOKEN"] = before;
  }
});

test("runHealthcheckPass writes a sample per target via stubbed fetch", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url: string | URL | Request) => {
    calls++;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  try {
    let now = 1_700_000_000_000;
    const service = new MonitoringService({ storage: memStorage(), now: () => now });
    const results = await runHealthcheckPass(service);
    assert.equal(calls, results.length);
    assert.ok(results.every((r) => r.ok));
    const snap = await service.snapshot();
    // Every target now has a fresh sample, replacing the fixture row.
    for (const row of snap.uptime) {
      assert.ok(row.lastSample);
      assert.equal(row.lastSample!.ok, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runHealthcheckPass records the failure case", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const service = new MonitoringService({ storage: memStorage() });
    const results = await runHealthcheckPass(service, { timeoutMs: 100 });
    assert.ok(results.every((r) => r.ok === false));
    assert.ok(results.every((r) => typeof r.error === "string"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
