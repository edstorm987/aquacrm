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
import { isCrossOriginBrowserMutation, isOutOfBandWriteFreezeRefusal } from "../src/proxy";

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

// ─── CSRF gate: exact-origin + Fetch Metadata (Phase 4 repair) ──────────────

test("a cross-site mutation on every cookie-authed API root is refused; same-origin passes", () => {
  // /api/tenants/* is cookie-authenticated (requireRoleForClient) — the merge
  // wrongly exempted it; it MUST be guarded now.
  for (const path of ["/api/portal/tasks", "/api/auth/password", "/api/tenants/client-files/upload", "/api/tenants/client-notes", "/api/internal/sweep"]) {
    const guarded = { method: "POST", path, host: "www.aqua-crm.com" };
    assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: "https://evil.example" }), true, `${path} cross-site must be refused`);
    assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: "https://www.aqua-crm.com" }), false, `${path} same-origin must pass`);
    assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: "https://WWW.AQUA-CRM.COM" }), false, `${path} case-insensitive host`);
  }
});

test("a malicious SAME-SITE sibling subdomain is refused (exact host, not eTLD+1)", () => {
  const guarded = { method: "POST", path: "/api/tenants/client-status", host: "www.aqua-crm.com" };
  // Sibling subdomain via Origin host mismatch.
  assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: "https://evil.aqua-crm.com" }), true);
  // Sibling subdomain via Fetch Metadata alone (Origin stripped).
  assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: null, secFetchSite: "same-site" }), true);
});

test("Fetch Metadata cross-site/same-site is refused; same-origin/none pass", () => {
  const g = { method: "POST", path: "/api/portal/tasks", host: "www.aqua-crm.com", origin: null };
  assert.equal(isCrossOriginBrowserMutation({ ...g, secFetchSite: "cross-site" }), true);
  assert.equal(isCrossOriginBrowserMutation({ ...g, secFetchSite: "same-site" }), true);
  assert.equal(isCrossOriginBrowserMutation({ ...g, secFetchSite: "same-origin" }), false);
  assert.equal(isCrossOriginBrowserMutation({ ...g, secFetchSite: "none" }), false);
});

test("safe methods are never gated, and token/public/webhook surfaces stay exempt", () => {
  assert.equal(
    isCrossOriginBrowserMutation({ method: "GET", path: "/api/portal/tasks", origin: "https://evil.example", host: "www.aqua-crm.com" }),
    false,
  );
  // Verified NON-cookie surfaces: cross-origin BY DESIGN, per-request auth.
  for (const path of ["/api/v1/records", "/api/public/careers", "/api/public/brand-enquiry", "/api/webhooks/meta", "/api/telemetry/collect"]) {
    assert.equal(
      isCrossOriginBrowserMutation({ method: "POST", path, origin: "https://client-site.example", host: "www.aqua-crm.com", secFetchSite: "cross-site" }),
      false,
      `${path} must not be origin-gated`,
    );
  }
});

test("absent Origin+metadata passes (non-browser, no ambient cookie); null/malformed Origin refused", () => {
  const guarded = { method: "POST", path: "/api/tenants/client-notes", host: "www.aqua-crm.com" };
  assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: null }), false);
  assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: "null" }), true);
  assert.equal(isCrossOriginBrowserMutation({ ...guarded, origin: "not a url" }), true);
});

test("the out-of-band freeze refuses HTTP effects before route code but preserves incident control", () => {
  for (const path of [
    "/api/portal/website-enquiries/status",
    "/api/portal/website-enquiries/erase",
    "/api/portal/website-enquiries/reply",
    "/api/public/brand-enquiry",
  ]) {
    assert.equal(isOutOfBandWriteFreezeRefusal({ frozen: "1", method: "POST", path }), true, path);
  }
  assert.equal(isOutOfBandWriteFreezeRefusal({ frozen: "1", method: "GET", path: "/api/cron/radar-probes" }), true);
  assert.equal(isOutOfBandWriteFreezeRefusal({ frozen: "1", method: "GET", path: "/api/portal/tasks" }), false);
  for (const path of [
    "/api/auth/login",
    "/api/auth/login/browser",
    "/api/auth/logout",
    "/api/portal/security/actions",
  ]) {
    assert.equal(isOutOfBandWriteFreezeRefusal({ frozen: "1", method: "POST", path }), false, path);
  }
  assert.equal(isOutOfBandWriteFreezeRefusal({ frozen: "true", method: "POST", path: "/api/portal/tasks" }), false);
});
