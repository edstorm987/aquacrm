import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  evaluateHttpResponse,
  evaluateRepeatedHttpResponses,
} from "./production-benchmark-response-budget.mjs";

const source = readFileSync(new URL("./benchmark-production.mjs", import.meta.url), "utf8");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("production benchmark isolates build output, state, credentials and port", () => {
  assert.match(source, /\.next-production-benchmark-/);
  assert.match(source, /mkdtemp\(join\(tmpdir\(\), "aqua-production-benchmark-"\)\)/);
  assert.match(source, /PORTAL_DATA_FILE: DATA_FILE/);
  assert.match(source, /NEXT_TYPESCRIPT_CONFIG_PATH/);
  assert.match(source, /extends: "\.\.\/tsconfig\.json"/);
  assert.match(source, /probe\.listen\(0, "127\.0\.0\.1"/);
  assert.doesNotMatch(source, /3032/);
  assert.doesNotMatch(source, /npm run build/);
});

test("production benchmark restores only the next-env bytes owned by its build", () => {
  assert.match(source, /nextEnvBeforeBuild = await snapshotNextEnv\(NEXT_ENV_PATH\)/);
  assert.match(source, /finally \{\s*nextEnvGeneratedByBuild = await captureBenchmarkNextEnv\(NEXT_ENV_PATH, DIST_NAME\);\s*\}/s);
  assert.match(source, /restoreBenchmarkNextEnv\(\{/);
  assert.match(source, /outcome === "skipped-concurrent-change"/);
  assert.match(source, /Artifact cleanup must still run/);
});

test("production benchmark cannot inherit live providers or hosted identity", () => {
  for (const key of [
    "VERCEL_ENV",
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "STRIPE_SECRET_KEY",
    "TWILIO_ACCOUNT_SID",
    "META_APP_SECRET",
    "GITHUB_TOKEN",
    "VERCEL_TOKEN",
  ]) {
    assert.match(source, new RegExp(`${key}: ""`));
  }
  assert.match(source, /prepareSignedSession/);
  assert.match(source, /createHmac\("sha256", BENCHMARK_SESSION_SECRET\)/);
  assert.doesNotMatch(source, /\/api\/auth\/login/);
});

test("production benchmark seed preflight creates an offline signed session and cleans up", () => {
  const result = spawnSync(process.execPath, ["scripts/benchmark-production.mjs", "--seed-preflight"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    timeout: 15_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.seedPreflight, true);
  assert.equal(report.cookieName, "lk_session_v1");
  assert.ok(report.cookieBytes > 100);
  assert.equal(existsSync(report.dataFile), false);
  assert.equal(existsSync(report.distDir), false);
  assert.equal(existsSync(report.typescriptConfigPath), false);
});

test("production benchmark gives every target a fresh process and first HTTP sample", () => {
  assert.match(source, /AQUA_PRODUCTION_BUILD_BUDGET_MS/);
  assert.match(source, /AQUA_PRODUCTION_SEED_BUDGET_MS/);
  assert.match(source, /AQUA_PRODUCTION_PROCESS_READY_BUDGET_MS/);
  assert.match(source, /AQUA_PRODUCTION_FRESH_PROCESS_ROUTE_BUDGET_MS/);
  assert.match(source, /AQUA_PRODUCTION_REPEATED_SAMPLE_BUDGET_MS/);
  assert.match(source, /AQUA_PRODUCTION_ROUTE_BUDGET_BYTES/);
  assert.match(source, /waitForProcessReady/);
  assert.match(source, /createConnection\(\{ host: "127\.0\.0\.1", port \}\)/);
  assert.match(source, /async function benchmarkRouteInFreshProcess/);
  assert.match(source, /const runtime = await startProductionServer\(route\.label\)/);
  assert.match(source, /report\.session = await benchmarkRouteInFreshProcess\(SESSION_TARGET/);
  assert.match(source, /freshProcessFirstHttp = await timedRequest\(runtime\.base, route\.path/);
  assert.match(source, /freshProcessFirstHttp\.totalMs > firstHttpBudgetMs/);
  assert.match(source, /repeatedMaxMs > BUDGETS\.repeatedSampleMs/);
  assert.match(source, /evaluateHttpResponse\(freshProcessFirstHttp/);
  assert.match(source, /mode: "per-route-fresh-process"/);
  assert.match(source, /readiness is TCP-only and sends no HTTP/);
  assert.match(source, /Host filesystem\/page caches are not flushed/);
  assert.match(source, /if \(allocatedPorts\.has\(port\)\) return freePort\(\)/);
  assert.doesNotMatch(source, /timedRequest\([^\n]*"\/login"/);
  assert.doesNotMatch(source, /firstSampleAfterReadiness/);
  assert.doesNotMatch(source, /readinessProbe/);
});

test("production benchmark rejects failed or oversized repeated responses", () => {
  assert.deepEqual(
    evaluateRepeatedHttpResponses([
      { status: 200, bytes: 120 },
      { status: 500, bytes: 90 },
      { status: 200, bytes: 700 },
    ], 512),
    ["repeated 2 status 500", "repeated 3 payload 700B > 512B"],
  );
  assert.deepEqual(
    evaluateHttpResponse({ status: 307, bytes: 20 }, { label: "first", maxBytes: 512 }),
    ["first status 307"],
  );
  assert.match(source, /evaluateRepeatedHttpResponses\(repeated, BUDGETS\.routeBytes\)/);
});

test("every fresh route process is stopped before the next target and all child commands are bounded", () => {
  assert.match(source, /finally \{\s*await stopChild\(runtime\.child\);\s*\}/s);
  assert.match(source, /for \(const route of ROUTES\) \{\s*const result = await benchmarkRouteInFreshProcess/s);
  assert.match(source, /timeoutMs: BUDGETS\.buildMs/);
  assert.match(source, /timeoutMs: BUDGETS\.seedMs/);
  assert.match(source, /await Promise\.all\(\[\.\.\.activeChildren\]\.map\(child => stopChild\(child\)\)\)/);
});

test("production benchmark includes the priority production routes", () => {
  for (const path of [
    "/portal/agency",
    "/portal/dev-team",
    "/portal/dev-team/library",
    "/portal/dev-team/library?view=logs",
  ]) {
    assert.match(source, new RegExp(path.replace(/[/?]/g, match => `\\${match}`)));
  }
});

test("production benchmark cleanup is path-guarded and stops its child server", () => {
  assert.match(source, /child\.kill\("SIGTERM"\)/);
  assert.match(source, /child\.kill\("SIGKILL"\)/);
  assert.match(source, /dirname\(DIST_PATH\) !== ROOT/);
  assert.match(source, /basename\(DIST_PATH\)\.startsWith\("\.next-production-benchmark-"\)/);
  assert.match(source, /rm\(DIST_PATH, \{ recursive: true, force: true \}\)/);
  assert.match(source, /rm\(TEMP_ROOT, \{ recursive: true, force: true \}\)/);
  assert.match(source, /rm\(TYPESCRIPT_CONFIG_PATH, \{ force: true \}\)/);
});
