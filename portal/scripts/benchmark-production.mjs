#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  captureBenchmarkNextEnv,
  restoreBenchmarkNextEnv,
  snapshotNextEnv,
} from "./lib/production-benchmark-next-env.mjs";
import {
  evaluateHttpResponse,
  evaluateRepeatedHttpResponses,
} from "./production-benchmark-response-budget.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUN_ID = `${process.pid}-${Date.now()}`;
const REUSE_DIST = process.argv.find(value => value.startsWith("--reuse-dist="))?.slice("--reuse-dist=".length) ?? "";
const SEED_PREFLIGHT = process.argv.includes("--seed-preflight");
const DIST_NAME = REUSE_DIST || `.next-production-benchmark-${RUN_ID}`;
if (!/^\.next-production-benchmark-[A-Za-z0-9-]+$/.test(DIST_NAME)) {
  throw new Error("--reuse-dist must name an Aqua production benchmark directory.");
}
const DIST_PATH = join(ROOT, DIST_NAME);
const NEXT_ENV_PATH = join(ROOT, "next-env.d.ts");
const TEMP_ROOT = await mkdtemp(join(tmpdir(), "aqua-production-benchmark-"));
const DATA_FILE = join(TEMP_ROOT, "portal-state.json");
const TYPESCRIPT_CONFIG_DIRECTORY = join(ROOT, ".aqua-production-benchmark");
const TYPESCRIPT_CONFIG_PATH = join(TYPESCRIPT_CONFIG_DIRECTORY, `tsconfig.${RUN_ID}.json`);
const KEEP = process.argv.includes("--keep");
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const BENCHMARK_EMAIL = "benchmark-owner@aqua.invalid";
const BENCHMARK_PASSWORD = "AquaBenchmark-Only-2026!";
const BENCHMARK_SESSION_SECRET = "aqua-production-benchmark-session-secret-2026";

const BUDGETS = {
  buildMs: positiveNumber("AQUA_PRODUCTION_BUILD_BUDGET_MS", 10 * 60_000),
  seedMs: positiveNumber("AQUA_PRODUCTION_SEED_BUDGET_MS", 15_000),
  processReadyMs: positiveNumber("AQUA_PRODUCTION_PROCESS_READY_BUDGET_MS", 15_000),
  sessionMs: positiveNumber("AQUA_PRODUCTION_SESSION_BUDGET_MS", 1_000),
  freshProcessFirstHttpMs: positiveNumber("AQUA_PRODUCTION_FRESH_PROCESS_ROUTE_BUDGET_MS", 5_000),
  repeatedSampleMs: positiveNumber("AQUA_PRODUCTION_REPEATED_SAMPLE_BUDGET_MS", 1_500),
  routeBytes: positiveNumber("AQUA_PRODUCTION_ROUTE_BUDGET_BYTES", 512 * 1024),
};

const ROUTES = [
  { path: "/", label: "public-home", authenticated: false },
  { path: "/portal/agency", label: "agency", authenticated: true },
  { path: "/portal/dev-team", label: "dev-team", authenticated: true },
  { path: "/portal/dev-team/library", label: "library", authenticated: true },
  { path: "/portal/dev-team/library?view=logs", label: "logs", authenticated: true },
];
const SESSION_TARGET = {
  path: "/api/auth/me",
  label: "session-api",
  authenticated: true,
  accept: "application/json",
};

const activeChildren = new Set();
const allocatedPorts = new Set();
let cleanupStarted = false;
let nextEnvBeforeBuild = null;
let nextEnvGeneratedByBuild = null;

function positiveNumber(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return Math.round(value);
}

function benchmarkEnvironment() {
  return {
    ...process.env,
    NEXT_DIST_DIR: DIST_NAME,
    NEXT_TYPESCRIPT_CONFIG_PATH: `.aqua-production-benchmark/tsconfig.${RUN_ID}.json`,
    PORTAL_BACKEND: "file",
    PORTAL_DATA_FILE: DATA_FILE,
    PORTAL_SESSION_SECRET: BENCHMARK_SESSION_SECRET,
    PORTAL_VAULT_ENCRYPTION_KEY: "aqua-production-benchmark-vault-key-2026",
    FOUNDER_EMAIL: BENCHMARK_EMAIL,
    FOUNDER_PASSWORD: BENCHMARK_PASSWORD,
    FOUNDER_AGENCY_NAME: "Aqua production benchmark",
    NEXT_PUBLIC_PORTAL_BASE_URL: "http://127.0.0.1",
    // Never inherit a deployment identity: local file storage is deliberate
    // for this disposable process and must not resemble a hosted production
    // function.
    VERCEL: "",
    VERCEL_ENV: "",
    DATABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    OPENAI_API_KEY: "",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    TWILIO_ACCOUNT_SID: "",
    META_APP_SECRET: "",
    GITHUB_TOKEN: "",
    VERCEL_TOKEN: "",
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...benchmarkEnvironment(), ...(options.env ?? {}) },
      stdio: options.stdio ?? "inherit",
    });
    activeChildren.add(child);
    let timeout;
    let forceKillTimeout;
    let timedOut = false;
    const clearTimers = () => {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
    };
    child.once("error", error => {
      clearTimers();
      activeChildren.delete(child);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimers();
      activeChildren.delete(child);
      if (timedOut) {
        reject(new Error(`${basename(command)} exceeded its ${options.timeoutMs}ms deadline.`));
        return;
      }
      if (code === 0) resolve();
      else reject(new Error(`${basename(command)} exited with ${code ?? signal ?? "unknown"}.`));
    });
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimeout = setTimeout(() => {
          if (!childHasExited(child)) child.kill("SIGKILL");
        }, 5_000);
      }, options.timeoutMs);
    }
  });
}

async function freePort() {
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a benchmark port."));
        return;
      }
      const port = address.port;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
  if (allocatedPorts.has(port)) return freePort();
  allocatedPorts.add(port);
  return port;
}

async function waitForProcessReady(child, port, timeoutMs) {
  const startedAt = performance.now();
  let lastError = "not ready";
  while (performance.now() - startedAt < timeoutMs) {
    if (childHasExited(child)) {
      throw new Error(`Production server exited before readiness (${child.exitCode ?? child.signalCode ?? "unknown"}).`);
    }
    const probe = await probeTcpPort(port);
    if (probe.ok) return performance.now() - startedAt;
    lastError = probe.error;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Production server did not become ready: ${lastError}`);
}

async function probeTcpPort(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500, () => finish({ ok: false, error: "TCP probe timed out" }));
    socket.once("connect", () => finish({ ok: true, error: "" }));
    socket.once("error", error => finish({ ok: false, error: error.message }));
  });
}

async function timedRequest(base, path, cookie = "", init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: init.accept ?? "text/html",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
    redirect: init.redirect ?? "manual",
    signal: AbortSignal.timeout(Math.max(
      BUDGETS.sessionMs,
      BUDGETS.freshProcessFirstHttpMs,
      BUDGETS.repeatedSampleMs,
    ) + 5_000),
  });
  const headersMs = performance.now() - startedAt;
  const body = await response.arrayBuffer();
  return {
    status: response.status,
    headersMs: round(headersMs),
    totalMs: round(performance.now() - startedAt),
    bytes: body.byteLength,
    headers: response.headers,
  };
}

async function prepareSignedSession() {
  const seedProgram = [
    'const founderModule = await import("./src/lib/server/seeds/founderSeed.ts");',
    'const storageModule = await import("./src/server/storage.ts");',
    'const seedFounder = founderModule.seedFounder ?? founderModule.default?.seedFounder;',
    'const flushPendingWrites = storageModule.flushPendingWrites ?? storageModule.default?.flushPendingWrites;',
    'if (typeof seedFounder !== "function" || typeof flushPendingWrites !== "function") throw new Error("Benchmark seed exports are unavailable.");',
    "await seedFounder();",
    "await flushPendingWrites();",
  ].join("\n");
  await run(process.execPath, [
    "--conditions", "react-server",
    "--import", "tsx",
    "--input-type=module",
    "--eval", seedProgram,
  ], {
    env: { NODE_ENV: "production" },
    timeoutMs: BUDGETS.seedMs,
  });

  const state = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const user = Object.values(state.users ?? {}).find(candidate => candidate?.email === BENCHMARK_EMAIL);
  if (!user?.id || !user.agencyId || user.role !== "agency-owner") {
    throw new Error("Disposable benchmark owner was not seeded.");
  }
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: user.agencyId,
    agencyIds: [user.agencyId],
    activeAgencyId: user.agencyId,
    sessionRev: user.sessionRev ?? 0,
    accessRev: user.accessRev ?? 0,
    aal: "aal1",
    iat: now,
    exp: now + 3_600,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", BENCHMARK_SESSION_SECRET).update(body).digest("base64url");
  return `lk_session_v1=${body}.${signature}`;
}

async function prepareTypeScriptConfig() {
  await mkdir(TYPESCRIPT_CONFIG_DIRECTORY, { recursive: true, mode: 0o700 });
  await writeFile(
    TYPESCRIPT_CONFIG_PATH,
    `${JSON.stringify({ extends: "../tsconfig.json" }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
}

async function startProductionServer(label) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const startedAt = performance.now();
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: benchmarkEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  child.stdout.on("data", chunk => process.stderr.write(`[production-benchmark:${label}] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[production-benchmark:${label}] ${chunk}`));
  try {
    await waitForProcessReady(child, port, BUDGETS.processReadyMs + 5_000);
    return {
      child,
      base,
      port,
      processReadyMs: round(performance.now() - startedAt),
    };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function benchmarkRouteInFreshProcess(route, cookie, firstHttpBudgetMs) {
  const runtime = await startProductionServer(route.label);
  try {
    const authCookie = route.authenticated ? cookie : "";
    const requestOptions = route.accept ? { accept: route.accept } : undefined;
    // The TCP readiness probe above does not send HTTP. This target is the
    // fresh Node/Next process's first HTTP request. Repeated samples then use
    // that same warmed process. Host filesystem/page caches are not flushed.
    const freshProcessFirstHttp = await timedRequest(runtime.base, route.path, authCookie, requestOptions);
    const repeated = [];
    for (let index = 0; index < 3; index += 1) {
      repeated.push(withoutHeaders(await timedRequest(runtime.base, route.path, authCookie, requestOptions)));
    }
    const repeatedMaxMs = Math.max(...repeated.map(sample => sample.totalMs));
    const failures = [];
    if (runtime.processReadyMs > BUDGETS.processReadyMs) {
      failures.push(`process ready ${runtime.processReadyMs}ms > ${BUDGETS.processReadyMs}ms`);
    }
    failures.push(...evaluateHttpResponse(freshProcessFirstHttp, {
      label: "fresh-process first HTTP",
      maxBytes: BUDGETS.routeBytes,
    }));
    if (freshProcessFirstHttp.totalMs > firstHttpBudgetMs) {
      failures.push(`fresh-process first HTTP ${freshProcessFirstHttp.totalMs}ms > ${firstHttpBudgetMs}ms`);
    }
    if (repeatedMaxMs > BUDGETS.repeatedSampleMs) {
      failures.push(`repeated max ${repeatedMaxMs}ms > ${BUDGETS.repeatedSampleMs}ms`);
    }
    failures.push(...evaluateRepeatedHttpResponses(repeated, BUDGETS.routeBytes));
    return {
      ...route,
      port: runtime.port,
      processReadyMs: runtime.processReadyMs,
      freshProcessFirstHttp: withoutHeaders(freshProcessFirstHttp),
      repeated,
      repeatedMaxMs: round(repeatedMaxMs),
      failures,
    };
  } finally {
    await stopChild(runtime.child);
  }
}

function withoutHeaders(result) {
  const { headers: _headers, ...summary } = result;
  return summary;
}

async function directoryBytes(path) {
  const entry = await stat(path);
  if (!entry.isDirectory()) return entry.size;
  const children = await readdir(path);
  const sizes = await Promise.all(children.map(child => directoryBytes(join(path, child))));
  return sizes.reduce((total, size) => total + size, 0);
}

async function stopChild(child) {
  if (!child || childHasExited(child)) {
    if (child) activeChildren.delete(child);
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (!childHasExited(child)) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise(resolve => child.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 1_000)),
    ]);
  }
  activeChildren.delete(child);
}

function childHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  await Promise.all([...activeChildren].map(child => stopChild(child)));
  let nextEnvRestoreError = null;
  try {
    if (nextEnvBeforeBuild && !nextEnvGeneratedByBuild) {
      nextEnvGeneratedByBuild = await captureBenchmarkNextEnv(NEXT_ENV_PATH, DIST_NAME);
    }
    const outcome = await restoreBenchmarkNextEnv({
      path: NEXT_ENV_PATH,
      distName: DIST_NAME,
      before: nextEnvBeforeBuild,
      generated: nextEnvGeneratedByBuild,
    });
    if (outcome === "skipped-concurrent-change") {
      console.warn("[production-benchmark] next-env.d.ts changed concurrently; leaving it untouched.");
    }
  } catch (error) {
    // Artifact cleanup must still run even if restoring the shared generated
    // file fails; report the restoration failure afterwards.
    nextEnvRestoreError = error;
  }
  if (!KEEP) {
    if (dirname(DIST_PATH) !== ROOT || !basename(DIST_PATH).startsWith(".next-production-benchmark-")) {
      throw new Error(`Refusing to clean unexpected dist path: ${DIST_PATH}`);
    }
    await rm(DIST_PATH, { recursive: true, force: true });
    await rm(TEMP_ROOT, { recursive: true, force: true });
    await rm(TYPESCRIPT_CONFIG_PATH, { force: true });
    await rmdir(TYPESCRIPT_CONFIG_DIRECTORY).catch(error => {
      if (error?.code !== "ENOTEMPTY" && error?.code !== "ENOENT") throw error;
    });
  }
  if (nextEnvRestoreError) throw nextEnvRestoreError;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

async function main() {
  if (SEED_PREFLIGHT) {
    const cookie = await prepareSignedSession();
    process.stdout.write(`${JSON.stringify({
      seedPreflight: true,
      cookieName: cookie.slice(0, cookie.indexOf("=")),
      cookieBytes: Buffer.byteLength(cookie),
      dataFile: DATA_FILE,
      distDir: DIST_PATH,
      typescriptConfigPath: TYPESCRIPT_CONFIG_PATH,
    })}\n`);
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    distDir: DIST_NAME,
    dataFile: DATA_FILE,
    budgets: BUDGETS,
    measurementModel: {
      mode: "per-route-fresh-process",
      processReady: "Each target starts a new production process on a new random loopback port; readiness is TCP-only and sends no HTTP.",
      freshProcessFirstHttp: "The target itself is that fresh process's first HTTP request. The build and host filesystem/page caches are shared and are not flushed.",
      repeatedSamples: "Three immediately repeated target requests run in the same now-warmed process before it is stopped.",
    },
    buildMs: 0,
    buildReused: Boolean(REUSE_DIST),
    distBytes: 0,
    session: null,
    routes: [],
    failures: [],
  };

  await prepareTypeScriptConfig();
  if (REUSE_DIST) {
    report.buildMs = positiveNumber("AQUA_REUSED_BUILD_MS", 1);
  } else {
    nextEnvBeforeBuild = await snapshotNextEnv(NEXT_ENV_PATH);
    const buildStartedAt = performance.now();
    try {
      await run(process.execPath, [NEXT_BIN, "build", "--webpack"], { timeoutMs: BUDGETS.buildMs });
    } finally {
      nextEnvGeneratedByBuild = await captureBenchmarkNextEnv(NEXT_ENV_PATH, DIST_NAME);
    }
    report.buildMs = round(performance.now() - buildStartedAt);
  }
  report.distBytes = await directoryBytes(DIST_PATH);
  if (report.buildMs > BUDGETS.buildMs) {
    report.failures.push(`build ${report.buildMs}ms > ${BUDGETS.buildMs}ms`);
  }

  const cookie = await prepareSignedSession();
  report.session = await benchmarkRouteInFreshProcess(SESSION_TARGET, cookie, BUDGETS.sessionMs);
  report.failures.push(...report.session.failures.map(failure => `${SESSION_TARGET.label}: ${failure}`));

  for (const route of ROUTES) {
    const result = await benchmarkRouteInFreshProcess(route, cookie, BUDGETS.freshProcessFirstHttpMs);
    report.routes.push(result);
    report.failures.push(...result.failures.map(failure => `${route.label}: ${failure}`));
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length) process.exitCode = 1;
}

process.once("SIGINT", () => { void cleanup().finally(() => process.exit(130)); });
process.once("SIGTERM", () => { void cleanup().finally(() => process.exit(143)); });

try {
  await main();
} catch (error) {
  console.error(`[production-benchmark] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 2;
} finally {
  await cleanup();
}
