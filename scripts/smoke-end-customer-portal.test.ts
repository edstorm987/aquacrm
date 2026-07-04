// T1 R019 smoke — end-customer portal sub-routes + embed mode.
// Run via `npm run smoke:end-customer-portal` (tsx --test).
//
// We don't spin up the Next.js runtime in this smoke; we verify the
// shipped surface is structurally intact:
//   - The 5 sub-route page files exist + default-export a component.
//   - The shared SubrouteConfig helper exports a CustomerSubroute fn.
//   - Layout.tsx contains the embed cookie branch.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CUSTOMER = join(ROOT, "src", "app", "portal", "customer");

describe("End-customer portal sub-routes (R019)", () => {
  for (const route of ["orders", "account", "bookings", "membership", "affiliate"]) {
    it(`/portal/customer/${route}/page.tsx exists`, () => {
      assert.equal(existsSync(join(CUSTOMER, route, "page.tsx")), true);
    });

    it(`/portal/customer/${route}/page.tsx imports CustomerSubroute`, () => {
      const src = readFileSync(join(CUSTOMER, route, "page.tsx"), "utf8");
      assert.ok(src.includes("CustomerSubroute"), "should import the shared helper");
      assert.ok(src.includes("export default"), "should default-export a page component");
    });
  }

  it("_subroute.tsx exports CustomerSubroute helper", () => {
    const src = readFileSync(join(CUSTOMER, "_subroute.tsx"), "utf8");
    assert.ok(src.includes("export async function CustomerSubroute"));
    assert.ok(src.includes("redirect"), "should support redirectTo via next/navigation");
    assert.ok(src.includes("getInstall"), "should gate on plugin install presence");
  });

  it("layout.tsx has embed-mode branch (lk_demo_embed cookie)", () => {
    const src = readFileSync(join(CUSTOMER, "layout.tsx"), "utf8");
    assert.ok(src.includes("lk_demo_embed=1"), "should detect embed cookie");
    assert.ok(src.includes("portal-customer-embed"), "should set the embed testid");
  });
});

describe("End-customer portal subroute config contracts", () => {
  it("orders → ecommerce, no redirect (no customer surface yet)", () => {
    const src = readFileSync(join(CUSTOMER, "orders", "page.tsx"), "utf8");
    assert.ok(src.includes('pluginId: "ecommerce"'));
    assert.ok(!src.includes("redirectTo"), "ecommerce has no customer surface yet");
  });

  it("account → client-crm with redirect to /profile", () => {
    const src = readFileSync(join(CUSTOMER, "account", "page.tsx"), "utf8");
    assert.ok(src.includes('pluginId: "client-crm"'));
    assert.ok(src.includes("/portal/customer/profile"));
  });

  it("membership → memberships with redirect to /memberships", () => {
    const src = readFileSync(join(CUSTOMER, "membership", "page.tsx"), "utf8");
    assert.ok(src.includes('pluginId: "memberships"'));
    assert.ok(src.includes("/portal/customer/memberships"));
  });

  it("affiliate → affiliates with redirect to /affiliates", () => {
    const src = readFileSync(join(CUSTOMER, "affiliate", "page.tsx"), "utf8");
    assert.ok(src.includes('pluginId: "affiliates"'));
    assert.ok(src.includes("/portal/customer/affiliates"));
  });
});
