// T1 R030 smoke — basic observability.
// Run via `npm run smoke:observability` (tsx --test).
//
// Two surfaces:
//   - Pure runtime: requestLog formatter + skip rules (no server-only).
//   - Source-marker: /healthz/full route + app/error.tsx wiring +
//     observability.ts Sentry lazy-load.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatRequestLog,
  shouldSkipRequestLog,
} from "../src/lib/server/requestLog";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HEALTHZ_FULL = join(ROOT, "src", "app", "healthz", "full", "route.ts");
const ERROR_TSX = join(ROOT, "src", "app", "error.tsx");
const OBS = join(ROOT, "src", "lib", "server", "observability.ts");
const REQ_LOG = join(ROOT, "src", "lib", "server", "requestLog.ts");

describe("Observability — request log formatter (R030)", () => {
  it("emits flat JSON with required keys", () => {
    const line = formatRequestLog(
      { method: "GET", path: "/portal/agency", status: 200, durationMs: 42 },
      1234,
    );
    const parsed = JSON.parse(line);
    assert.equal(parsed.t, "req");
    assert.equal(parsed.ts, 1234);
    assert.equal(parsed.method, "GET");
    assert.equal(parsed.path, "/portal/agency");
    assert.equal(parsed.status, 200);
    assert.equal(parsed.durationMs, 42);
  });

  it("includes optional tenancy fields when set", () => {
    const line = formatRequestLog({
      method: "post", path: "/api/x", status: 201, durationMs: 12,
      userId: "usr_1", agencyId: "ag_1", clientId: "cl_1",
    });
    const parsed = JSON.parse(line);
    assert.equal(parsed.method, "POST", "method uppercased");
    assert.equal(parsed.userId, "usr_1");
    assert.equal(parsed.agencyId, "ag_1");
    assert.equal(parsed.clientId, "cl_1");
  });

  it("omits tenancy keys when undefined (no nulls leaking through)", () => {
    const line = formatRequestLog({ method: "GET", path: "/x", status: 200, durationMs: 1 });
    const parsed = JSON.parse(line);
    assert.equal("userId" in parsed, false);
    assert.equal("agencyId" in parsed, false);
  });

  it("flattens extras onto the top-level payload", () => {
    const line = formatRequestLog({
      method: "GET", path: "/x", status: 200, durationMs: 1,
      extra: { region: "iad1", cached: true },
    });
    const parsed = JSON.parse(line);
    assert.equal(parsed.region, "iad1");
    assert.equal(parsed.cached, true);
  });
});

describe("Observability — skip rules (R030)", () => {
  it("skips /healthz + /healthz/full", () => {
    assert.equal(shouldSkipRequestLog("/healthz"), true);
    assert.equal(shouldSkipRequestLog("/healthz/full"), true);
  });

  it("skips /_next + /favicon.ico + asset suffixes", () => {
    assert.equal(shouldSkipRequestLog("/_next/static/chunks/main.js"), true);
    assert.equal(shouldSkipRequestLog("/favicon.ico"), true);
    assert.equal(shouldSkipRequestLog("/some/path.css"), true);
    assert.equal(shouldSkipRequestLog("/img/hero.webp"), true);
    assert.equal(shouldSkipRequestLog("/fonts/inter.woff2"), true);
  });

  it("does NOT skip portal / api routes", () => {
    assert.equal(shouldSkipRequestLog("/portal/agency"), false);
    assert.equal(shouldSkipRequestLog("/api/auth/login"), false);
    assert.equal(shouldSkipRequestLog("/healthz-but-not-really"), false);
  });
});

describe("Observability — /healthz/full route (R030, source-marker)", () => {
  it("file exists + GET returns 200/503 based on DB probe", () => {
    assert.equal(existsSync(HEALTHZ_FULL), true);
    const src = readFileSync(HEALTHZ_FULL, "utf8");
    assert.ok(src.includes("export async function GET"));
    assert.ok(src.includes('SELECT 1'));
    assert.ok(src.includes('"connected"'));
    assert.ok(src.includes('"down"'));
    assert.ok(src.includes('"untested"'));
    assert.ok(src.includes("status: probe.ok ? 200 : 503"));
  });

  it("untested branch when PORTAL_BACKEND != postgres + DATABASE_URL unset", () => {
    const src = readFileSync(HEALTHZ_FULL, "utf8");
    assert.ok(src.includes("wantsPostgres"));
    assert.ok(src.match(/db:\s*"untested"/));
  });

  it("reports plugins count + uptime + sha + env", () => {
    const src = readFileSync(HEALTHZ_FULL, "utf8");
    assert.ok(src.includes("pluginInstalls"));
    assert.ok(src.includes("BOOT_AT"));
    assert.ok(src.includes("VERCEL_GIT_COMMIT_SHA"));
  });
});

describe("Observability — app/error.tsx wires Sentry (R030)", () => {
  it("error boundary exists + reports via captureError", () => {
    assert.equal(existsSync(ERROR_TSX), true);
    const src = readFileSync(ERROR_TSX, "utf8");
    assert.ok(src.startsWith('"use client"'));
    assert.ok(src.includes("captureError"));
    assert.ok(src.includes("digest"));
    assert.ok(src.includes("reset"));
  });
});

describe("Observability — Sentry lazy-load is no-throw without DSN (R030)", () => {
  it("observability.ts lazy-imports @sentry/nextjs + warns when missing", () => {
    const src = readFileSync(OBS, "utf8");
    assert.ok(src.includes('"@sentry/nextjs"'));
    assert.ok(src.includes("not installed"));
    assert.ok(src.includes("export function captureError"));
    assert.ok(src.includes("export function recordBreadcrumb"));
  });

  it("requestLog.ts skips emit when NODE_ENV=test (smoke runs quiet)", () => {
    const src = readFileSync(REQ_LOG, "utf8");
    assert.ok(src.includes('process.env.NODE_ENV === "test"'));
  });
});
