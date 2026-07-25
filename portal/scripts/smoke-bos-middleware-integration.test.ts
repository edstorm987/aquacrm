// Standalone portal proxy smoke.
//
// Business OS middleware lived in the old combined app. This separated portal
// should only proxy portal routes; public Business OS paths belong elsewhere.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROXY = join(ROOT, "src", "proxy.ts");

describe("Standalone portal proxy", () => {
  it("matches only portal routes", () => {
    const src = readFileSync(PROXY, "utf8");
    assert.ok(src.includes('matcher: ["/portal/:path*"]'));
    assert.ok(!src.includes("/business-os"));
    assert.ok(!src.includes("/api/portal/business-os"));
    assert.ok(!src.includes("/embed/:slug/:variant"));
  });

  it("keeps strict portal security in the proxy", () => {
    const src = readFileSync(PROXY, "utf8");
    assert.ok(src.includes("NextResponse.next()"));
    assert.ok(src.includes("NEXT_PUBLIC_PORTAL_SECURITY"));
    assert.ok(src.includes("NextResponse.redirect"));
    assert.ok(src.includes('url.pathname = "/login"'));
    assert.ok(src.includes('url.searchParams.set("next", path)'));
    assert.ok(!src.includes("getSessionFromRequest"));
  });
});
