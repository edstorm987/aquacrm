// Standalone portal proxy smoke.
//
// Business OS middleware lived in the old combined app. This separated portal
// should only proxy portal routes; public Business OS paths belong elsewhere.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROXY = join(ROOT, "src", "proxy.ts");

describe("AquaCRM proxy", () => {
  it("matches authenticated portal and API routes", () => {
    const src = readFileSync(PROXY, "utf8");
    assert.ok(src.includes('matcher: ["/portal/:path*", "/api/:path*"]'));
    assert.ok(src.includes("publicShowcase"));
    assert.ok(src.includes("This public showcase is read-only."));
    assert.ok(!src.includes("/business-os"));
    assert.ok(!src.includes("/api/portal/business-os"));
    assert.ok(!src.includes("/embed/:slug/:variant"));
  });

  it("keeps strict portal security while forwarding the canonical route path", () => {
    const src = readFileSync(PROXY, "utf8");
    assert.ok(src.includes("NEXT_PUBLIC_PORTAL_SECURITY"));
    assert.ok(!src.includes("getSessionFromRequest"));

    const previousSecurity = process.env.NEXT_PUBLIC_PORTAL_SECURITY;
    process.env.NEXT_PUBLIC_PORTAL_SECURITY = "strict";
    try {
      const protectedPath = "/portal/agency";
      const unauthenticated = proxy(new NextRequest(`http://localhost:3032${protectedPath}`));
      assert.equal(unauthenticated.status, 307);
      const login = new URL(assertRequiredHeader(unauthenticated, "location"));
      assert.equal(login.pathname, "/login");
      assert.equal(login.searchParams.get("next"), protectedPath);

      const payload = Buffer.from(JSON.stringify({
        role: "agency-owner",
        exp: Math.floor(Date.now() / 1000) + 60,
      })).toString("base64url");
      const authenticated = proxy(new NextRequest(`http://localhost:3032${protectedPath}`, {
        headers: {
          cookie: `lk_session_v1=${payload}.test-signature`,
          "x-aqua-route-path": "/forged/inbound/path",
        },
      }));

      assert.equal(authenticated.status, 200);
      assert.equal(authenticated.headers.get("x-middleware-next"), "1");
      assert.equal(
        authenticated.headers.get("x-middleware-request-x-aqua-route-path"),
        protectedPath,
      );
      assert.ok(
        authenticated.headers.get("x-middleware-override-headers")?.split(",").includes("x-aqua-route-path"),
        "the continued request must override an inbound route-path header",
      );
    } finally {
      if (previousSecurity === undefined) delete process.env.NEXT_PUBLIC_PORTAL_SECURITY;
      else process.env.NEXT_PUBLIC_PORTAL_SECURITY = previousSecurity;
    }
  });
});

function assertRequiredHeader(response: Response, name: string): string {
  const value = response.headers.get(name);
  assert.ok(value, `expected ${name} response header`);
  return value;
}
