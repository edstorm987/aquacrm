// T1 R022 smoke — role-aware post-login redirect.
// Run via `npm run smoke:post-login-redirect` (tsx --test).
//
// We don't import the resolver directly: it pulls `@/server/tenants`
// which carries a `server-only` shim that throws under tsx. Instead we
// verify the routing table via source-marker assertions plus structural
// wire-up of the three production call-sites (login, signup, magic/verify).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const RESOLVER = join(ROOT, "src", "lib", "server", "auth", "postLoginRedirect.ts");
const LOGIN_ROUTE = join(ROOT, "src", "app", "api", "auth", "login", "route.ts");
const SIGNUP_ROUTE = join(ROOT, "src", "app", "api", "auth", "signup", "route.ts");
const MAGIC_ROUTE = join(ROOT, "src", "app", "api", "auth", "magic", "verify", "route.ts");
const DEV_POV_PAGE = join(ROOT, "src", "app", "(demo)", "dev", "pov", "page.tsx");
const LOGIN_FORM = join(ROOT, "src", "app", "login", "LoginForm.tsx");

describe("Post-login redirect resolver (R022)", () => {
  it("resolver file exists + exports resolvePostLoginPath", () => {
    assert.equal(existsSync(RESOLVER), true);
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes("export function resolvePostLoginPath"));
    assert.ok(src.includes("ResolveOptions"));
    assert.ok(src.includes("clientLookup"));
  });

  it("owners and managers route to the agency workspace while staff route to team", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "agency-owner"'));
    assert.ok(src.includes('case "agency-manager"'));
    assert.ok(src.includes('case "agency-staff"'));
    assert.match(src, /case "agency-manager":\s*return "\/portal\/agency";/);
    assert.match(src, /case "agency-staff":\s*return "\/portal\/team";/);
  });

  it("client-* roles route to /portal/customer with deleted-client fallback", () => {
    // Ed's 2026-08-27 placement decision: /portal/clients/<slug> is the
    // INTERNAL workspace for agency employees, so signing in as a client must
    // land in the client's OWN portal — the same answer /portal gives.
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "client-owner"'));
    assert.ok(src.includes('case "client-staff"'));
    assert.ok(!src.includes("`/portal/clients/${client.slug}`"),
      "sign-in is sending a client back into the internal agency-side workspace");
    assert.match(src, /const client = lookup\(src\.clientId\);[\s\S]{0,120}return "\/portal\/customer";/,
      "the client branch no longer resolves to /portal/customer");
    // Fallback path on missing client / clientId.
    assert.ok(src.includes('if (!src.clientId) return "/portal/agency"'));
    assert.ok(src.includes('if (!client) return "/portal/agency"'));
  });

  it("the resolver agrees with /portal's own role-aware redirect", () => {
    // Two places answered "where does this role belong?" and disagreed for the
    // client roles: /portal sent them to /portal/customer while sign-in sent
    // them to /portal/clients/<slug>. Whichever door they came through decided
    // where they ended up. Pin that they now say the same thing.
    const resolver = readFileSync(RESOLVER, "utf8");
    const index = readFileSync(join(ROOT, "src", "app", "portal", "page.tsx"), "utf8");
    assert.match(index, /session\.role === "client-owner" \|\| session\.role === "client-staff"\) redirect\("\/portal\/customer"\)/);
    assert.match(resolver, /case "client-staff": \{/);
    assert.doesNotMatch(resolver, /return\s+[`"']\/portal\/clients\//,
      "the resolver still returns the internal workspace; /portal does not");
  });

  it("freelancers route to their own workspace", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.match(src, /case "freelancer":\s*return "\/portal\/freelancer";/);
  });

  it("end-customer routes to /portal/customer", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "end-customer"'));
    assert.ok(src.includes('return "/portal/customer"'));
  });

  it("lead role stays out of portal workspaces until conversion", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('case "lead"'));
    assert.ok(src.includes('return "/login"'));
    assert.ok(!src.includes('return "/business-os"'));
  });

  it("null session/user falls back to /login", () => {
    const src = readFileSync(RESOLVER, "utf8");
    assert.ok(src.includes('return "/login"'));
  });
});

describe("Post-login redirect — call-site wire-up", () => {
  it("/api/auth/login imports + uses the role-aware resolver", () => {
    const src = readFileSync(LOGIN_ROUTE, "utf8");
    assert.ok(src.includes('import { resolvePostLoginPath }'));
    assert.ok(src.match(/const redirect\s*=\s*resolvePostLoginPath/));
    assert.ok(src.match(/redirect,\s*\n/));
    const matches = src.match(/resolvePostLoginPath\(/g) ?? [];
    assert.ok(matches.length >= 1, `expected a resolver call-site, got ${matches.length}`);
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

  it("does not ship the retired /dev/pov bypass", () => {
    assert.equal(existsSync(DEV_POV_PAGE), false);
  });

  it("LoginForm reads `redirect` from response (chained behind returnUrl)", () => {
    const src = readFileSync(LOGIN_FORM, "utf8");
    assert.ok(src.includes("data.returnUrl ?? data.redirect"));
    assert.ok(src.includes("redirect?: string"));
  });
});
