// T1 R022 smoke — role-aware post-login redirect.
// Run via `npm run smoke:post-login-redirect` (tsx --test).
//
// We don't import the resolver directly: it pulls `@/server/tenants`
// which carries a `server-only` shim that throws under tsx. Instead we
// verify the routing table via source-marker assertions plus structural
// wire-up of the four call-sites (login, signup, magic/verify, dev/pov).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const RESOLVER = join(ROOT, "src", "lib", "server", "postLoginRedirect.ts");
const LOGIN_ROUTE = join(ROOT, "src", "app", "api", "auth", "login", "route.ts");
const SIGNUP_ROUTE = join(ROOT, "src", "app", "api", "auth", "signup", "route.ts");
const MAGIC_ROUTE = join(ROOT, "src", "app", "api", "auth", "magic", "verify", "route.ts");
const POV_PAGE = join(ROOT, "src", "app", "dev", "pov", "page.tsx");
const LOGIN_FORM = join(ROOT, "src", "app", "login", "LoginForm.tsx");

describe("Post-login redirect resolver (R022)", () => {
  it("resolver file exists + exports resolvePostLoginPath", () => {
    assert.equal(existsSync(RESOLVER), true);
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes("export function resolvePostLoginPath"));
    assert.ok(src.includes("ResolveOptions"));
    assert.ok(src.includes("clientLookup"));
  });

  it("agency-* roles route to /portal/agency", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "agency-owner"'));
    assert.ok(src.includes('case "agency-manager"'));
    assert.ok(src.includes('case "agency-staff"'));
    // The agency arm returns the bare string.
    assert.ok(src.includes('return "/portal/agency"'));
  });

  it("client-* roles route to /portal/clients/<slug> with deleted-client fallback", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "client-owner"'));
    assert.ok(src.includes('case "client-staff"'));
    assert.ok(src.includes('case "freelancer"'));
    assert.ok(src.includes("`/portal/clients/${client.slug}`"));
    // Fallback path on missing client / clientId.
    assert.ok(src.includes('if (!src.clientId) return "/portal/agency"'));
    assert.ok(src.includes('if (!client) return "/portal/agency"'));
  });

  it("end-customer routes to /portal/customer", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "end-customer"'));
    assert.ok(src.includes('return "/portal/customer"'));
  });

  it("lead role (R023, defensive) routes to /business-os", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "lead"'));
    assert.ok(src.includes('return "/business-os"'));
  });

  it("null session/user falls back to /login", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('return "/login"'));
  });
});

describe("Post-login redirect — call-site wire-up", () => {
  it("/api/auth/login imports + uses resolver in both bootstrap and standard responses", () => {
    const src = readFileSync(LOGIN_ROUTE, "utf8");
    assert.ok(src.includes('import { resolvePostLoginPath }'));
    assert.ok(src.match(/redirect:\s*resolvePostLoginPath/g));
    // Two callsites: bootstrap response + standard login response.
    const matches = src.match(/resolvePostLoginPath\(/g) ?? [];
    assert.ok(matches.length >= 2, `expected ≥2 call-sites, got ${matches.length}`);
    assert.ok(!src.match(/redirect:\s*"\/portal\/agency"/), "no hardcoded /portal/agency redirect should remain");
  });

  it("/api/auth/signup imports + uses resolver (no hardcoded redirect)", () => {
    const src = readFileSync(SIGNUP_ROUTE, "utf8");
    assert.ok(src.includes('import { resolvePostLoginPath }'));
    assert.ok(src.includes("redirect: resolvePostLoginPath"));
    assert.ok(!src.match(/redirect:\s*"\/portal\/agency"/), "no hardcoded /portal/agency should remain");
  });

  it("/api/auth/magic/verify uses resolver as fallback when no `return` query", () => {
    const src = readFileSync(MAGIC_ROUTE, "utf8");
    assert.ok(src.includes('import { resolvePostLoginPath }'));
    assert.ok(src.includes("resolvePostLoginPath"));
    assert.ok(src.includes("ret && ret.startsWith"), "should still honor an explicit ?return path when same-origin");
  });

  it("/dev/pov uses resolver (drops hardcoded landing per persona)", () => {
    const src = readFileSync(POV_PAGE, "utf8");
    assert.ok(src.includes('import { resolvePostLoginPath }'));
    assert.ok(src.includes("resolvePostLoginPath(null, user)"));
  });

  it("LoginForm reads `redirect` from response (chained behind returnUrl)", () => {
    const src = readFileSync(LOGIN_FORM, "utf8");
    assert.ok(src.includes("data.returnUrl ?? data.redirect"));
    assert.ok(src.includes("redirect?: string"));
  });
});
