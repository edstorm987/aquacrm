// Platform hardening — assume-breach containment, Phase 4 (first tranche).
//
//   1. `/healthz/full` stops handing reconnaissance to anonymous production
//      callers: commit sha, platform, plugin count and the readiness item list
//      (which controls are unconfigured) now require an internal session or the
//      PORTAL_HEALTH_TOKEN bearer. The STATUS CODE — all a deploy gate or
//      uptime monitor consumes — is unchanged either way.
//   2. `clientIpFromHeaders` stops trusting the CLIENT-SUPPLIED first
//      X-Forwarded-For entry (rate-limit evasion + attribution poisoning);
//      the trusted entry is the one the edge proxy APPENDED (the last, or N
//      from the end via PORTAL_TRUSTED_PROXY_HOPS).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test, { beforeEach } from "node:test";

import { clientIpFromHeaders } from "../src/lib/server/rateLimit";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(() => {
  delete process.env.PORTAL_TRUSTED_PROXY_HOPS;
});

test("a client-chosen X-Forwarded-For prefix cannot pick the rate-limit bucket", () => {
  // The attacker sent "6.6.6.6"; the trusted edge appended the real address.
  const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
  assert.equal(clientIpFromHeaders(headers), "203.0.113.9");

  // A rotating fake prefix must not rotate the bucket.
  const rotated = new Headers({ "x-forwarded-for": "7.7.7.7, 203.0.113.9" });
  assert.equal(clientIpFromHeaders(rotated), "203.0.113.9");
});

test("multiple trusted hops are honoured via PORTAL_TRUSTED_PROXY_HOPS", () => {
  process.env.PORTAL_TRUSTED_PROXY_HOPS = "2";
  // client-spoofed, real-client, CDN — with 2 trusted hops the real client is
  // second from the end.
  const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 198.51.100.4" });
  assert.equal(clientIpFromHeaders(headers), "203.0.113.9");
});

test("a single-entry header (direct or dev traffic) still resolves", () => {
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIpFromHeaders(new Headers()), "anonymous");
});

test("healthz/full withholds the detailed body from anonymous production callers", () => {
  const source = readFileSync(join(ROOT, "src/app/healthz/full/route.ts"), "utf8");
  // The gate exists, defaults closed in production, and the anonymous body is
  // status-only.
  assert.match(source, /mayViewDetails/, "the disclosure gate must exist");
  assert.match(source, /env\.NODE_ENV !== "production"\) return true/, "non-production keeps full detail");
  assert.match(source, /PORTAL_HEALTH_TOKEN/, "the operator monitor authenticates with the health token");
  assert.match(source, /timingSafeEqual/, "token comparison must be timing-safe");
  assert.match(source, /\{ ok, ts: body\.ts \}/, "the anonymous production body must be status-only");
  assert.match(source, /getSessionFromRequest/, "an internal session may still see detail");
});

test("the status code decision is independent of the disclosure gate", () => {
  const source = readFileSync(join(ROOT, "src/app/healthz/full/route.ts"), "utf8");
  // `ok` (and therefore the 200/503 the deploy gate consumes) must be computed
  // before, and untouched by, the detail decision.
  const gateIndex = source.indexOf("const detailed = await mayViewDetails");
  const statusIndex = source.indexOf("resolveFullHealthOk");
  assert.ok(statusIndex > -1 && gateIndex > -1 && statusIndex < gateIndex, "status decision must precede the disclosure gate");
  assert.match(source, /status: ok \? 200 : 503/);
});
