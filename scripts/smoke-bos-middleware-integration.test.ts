// T1 R031 smoke — BOS auth-gate middleware integration.
// Run via `npm run smoke:bos-middleware-integration` (tsx --test).
//
// The plugin's `evaluate` is pure runtime (no server-only) so we
// drive every decision branch directly, then source-marker the
// middleware wire-up + matcher extension.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchesBosPath, isBosAsset } from "../plugins/bos-auth-gate/src/lib/domain";
import { evaluate } from "../plugins/bos-auth-gate/src/server/services";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIDDLEWARE = join(ROOT, "middleware.ts");

describe("BOS middleware — matcher (R031)", () => {
  it("config.matcher includes /business-os + /api/portal/business-os subtrees", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    assert.ok(src.includes('"/business-os/:path*"'));
    assert.ok(src.includes('"/api/portal/business-os/:path*"'));
    assert.ok(src.includes('"/embed/:slug/:variant"'), "preserves R16 embed CSP matcher");
  });

  it("matchesBosPath excludes false-positive `/business-os-other`", () => {
    assert.equal(matchesBosPath("/business-os"), true);
    assert.equal(matchesBosPath("/business-os/dashboard"), true);
    assert.equal(matchesBosPath("/api/portal/business-os/me"), true);
    assert.equal(matchesBosPath("/business-os-other"), false, "prefix-only false positive must NOT match");
    assert.equal(matchesBosPath("/something/else"), false);
  });

  it("isBosAsset detects asset suffixes that browsers can't follow 302 on", () => {
    assert.equal(isBosAsset("/business-os/styles.css"), true);
    assert.equal(isBosAsset("/business-os/img/hero.webp"), true);
    assert.equal(isBosAsset("/business-os/dashboard"), false);
  });
});

describe("BOS middleware — decision branches (R031, runtime)", () => {
  it("anonymous → redirect to /login?from=bos&next=…", () => {
    const d = evaluate(
      { pathname: "/business-os/dashboard", signedIn: false },
      { loginPath: "/login" },
    );
    assert.equal(d.outcome, "redirect");
    assert.ok(d.redirect?.startsWith("/login"));
    assert.ok(d.redirect?.includes("from=bos"));
    assert.ok(d.redirect?.includes("next="));
  });

  it("signed lead → allow (funnel target role)", () => {
    const d = evaluate(
      { pathname: "/business-os/dashboard", signedIn: true, role: "lead" },
      {},
    );
    assert.equal(d.outcome, "allow");
  });

  it("signed agency-staff → allow (operator inspection)", () => {
    const d = evaluate(
      { pathname: "/business-os/dashboard", signedIn: true, role: "agency-staff" },
      {},
    );
    assert.equal(d.outcome, "allow");
  });

  it("signed end-customer → redirect (role_not_allowed)", () => {
    const d = evaluate(
      { pathname: "/business-os/dashboard", signedIn: true, role: "end-customer" },
      {},
    );
    assert.equal(d.outcome, "redirect");
    assert.equal(d.reason, "role_not_allowed");
  });

  it("static asset → allow regardless of auth state", () => {
    const d = evaluate(
      { pathname: "/business-os/styles.css", signedIn: false },
      {},
    );
    assert.equal(d.outcome, "allow");
    assert.equal(d.reason, "static_asset");
  });

  it("devBypass → dev-bypass with banner string", () => {
    const d = evaluate(
      { pathname: "/business-os/dashboard", signedIn: false },
      { devBypass: true },
    );
    assert.equal(d.outcome, "dev-bypass");
    assert.ok(d.banner);
  });

  it("out-of-scope path → trivially allow (defensive)", () => {
    const d = evaluate(
      { pathname: "/portal/agency", signedIn: true, role: "agency-owner" },
      {},
    );
    assert.equal(d.outcome, "allow");
    assert.equal(d.reason, "out_of_scope");
  });
});

describe("BOS middleware — wire-up (R031, source-marker)", () => {
  it("imports evaluate + matchesBosPath + isBosAsset from plugin", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    assert.ok(src.includes("matchesBosPath"));
    assert.ok(src.includes("isBosAsset"));
    assert.ok(src.includes("evaluateBosGate") || src.includes("evaluate as evaluateBosGate"));
    assert.ok(src.includes('"./plugins/bos-auth-gate/src/lib/domain"'));
    assert.ok(src.includes('"./plugins/bos-auth-gate/src/server/services"'));
  });

  it("translates evaluate outcomes into NextResponse", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    assert.ok(src.includes('case "allow"'));
    assert.ok(src.includes('case "redirect"'));
    assert.ok(src.includes('case "dev-bypass"'));
    assert.ok(src.includes("NextResponse.redirect"));
    assert.ok(src.includes('"bos_dev_banner"'));
  });

  it("uses lightweight session decode via getSessionFromRequest (no DB hit)", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    assert.ok(src.includes("getSessionFromRequest"));
  });

  it("reads NEXT_PUBLIC_DEV_BYPASS for the dev-bypass branch", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    assert.ok(src.includes('process.env.NEXT_PUBLIC_DEV_BYPASS === "1"'));
  });

  it("static asset short-circuit avoids session decode", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    assert.ok(src.match(/isBosAsset\(pathname\).+NextResponse\.next/s),
      "static asset path should return early before session decode");
  });
});
