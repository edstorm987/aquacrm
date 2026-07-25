// Smoke test — imports the manifest and asserts every promised piece
// is present.
//
// Why this isn't tsc-only:
//   - tsc catches type mismatches but won't surface a circular import or
//     a runtime require()-fails-but-types-line-up bug.
//   - Walking the registry forces every block module to actually
//     evaluate.
//   - Hitting the manifest counts confirms the api/pages/blocks arrays
//     are populated, not empty.
//
// Run via `npm test`. Exits non-zero on any assertion failure.

import manifest from "../../index";
import {
  BLOCK_REGISTRY,
  BLOCK_DESCRIPTORS,
  RENDERER_REGISTRATIONS,
  getBlockRenderer,
  registerExternalBlockRenderers,
} from "../components/blockRegistry";
import { listStarterIds, loadStarterTree } from "../server/starterLoader";
import { applyStarterVariant } from "../server/portalVariants";
import type { PluginStorage } from "../lib/aquaPluginTypes";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeMemoryStorage(): PluginStorage {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return data.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      data.set(key, value);
    },
    async del(key: string): Promise<void> {
      data.delete(key);
    },
    async list(prefix?: string): Promise<string[]> {
      const all = Array.from(data.keys());
      return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
    },
  };
}

async function main(): Promise<void> {
  console.log("manifest");
  expect("id is website-editor", manifest.id === "website-editor");
  expect("category is content", manifest.category === "content");
  expect("navItems has 9 entries (R6 +git-status)", manifest.navItems.length === 9, `actual: ${manifest.navItems.length}`);
  expect("pages has 13 entries (R10 +edit-website deep-link)", manifest.pages.length === 13, `actual: ${manifest.pages.length}`);
  expect(
    "api has at least 30 entries",
    manifest.api.length >= 30,
    `actual: ${manifest.api.length}`,
  );
  expect("storefront.blocks present", Boolean(manifest.storefront?.blocks));
  expect(
    "storefront.blocks has 61 entries",
    (manifest.storefront?.blocks?.length ?? 0) === 61,
    `actual: ${manifest.storefront?.blocks?.length}`,
  );
  expect("features has 8 entries", manifest.features.length === 8, `actual: ${manifest.features.length}`);

  console.log("\nblock registry");
  expect("BLOCK_REGISTRY has 61 entries", Object.keys(BLOCK_REGISTRY).length === 61);
  expect(
    "BLOCK_DESCRIPTORS matches BLOCK_REGISTRY size",
    BLOCK_DESCRIPTORS.length === Object.keys(BLOCK_REGISTRY).length,
  );
  // Force every block module to evaluate by touching its component reference.
  let evaluated = 0;
  for (const [type, def] of Object.entries(BLOCK_REGISTRY)) {
    if (typeof def.Component === "function" && def.type === type) evaluated++;
  }
  expect("every block component is callable", evaluated === 61, `actual: ${evaluated}`);

  console.log("\nrenderer registrations (cross-plugin)");
  expect(
    "RENDERER_REGISTRATIONS covers all 61 native blocks",
    Object.keys(BLOCK_REGISTRY).every(type => typeof RENDERER_REGISTRATIONS[type] === "function"),
  );
  // 8 ecommerce + 3 memberships should be in the map even though they
  // aren't in BLOCK_REGISTRY (BLOCK_REGISTRY also includes the 8
  // ecommerce because they were lifted in R2 Phase A — but memberships
  // is the strict cross-plugin check).
  const externalIds = [
    // memberships (T2 R4)
    "membership-paywall", "membership-signup", "membership-tier-grid",
    // affiliates (T2 R5)
    "affiliate-signup", "affiliate-payout-meter", "affiliate-leaderboard",
    // forms (T2 R9)
    "form-render",
    // client-crm (T2 R8)
    "crm-contact-form",
  ];
  for (const id of externalIds) {
    expect(
      `getBlockRenderer("${id}") returns a function`,
      typeof getBlockRenderer(id) === "function",
    );
  }
  // registerExternalBlockRenderers — feed a synthetic manifest with a
  // missing block id; expect it surfaces in the return value.
  const missing = registerExternalBlockRenderers([
    { id: "fake-plugin", storefront: { blocks: [{ type: "missing-block-xyz" }] } },
  ]);
  expect(
    "registerExternalBlockRenderers reports missing renderers",
    missing.includes("missing-block-xyz"),
    `got: ${JSON.stringify(missing)}`,
  );
  // Feeding a plugin whose blocks ARE all registered (e.g. ecommerce)
  // should produce no warnings.
  const okMissing = registerExternalBlockRenderers([
    { id: "ecommerce", storefront: { blocks: [
      { type: "product-card" }, { type: "product-grid" }, { type: "cart-summary" },
      { type: "checkout-summary" }, { type: "payment-button" }, { type: "order-success" },
      { type: "variant-picker" }, { type: "product-search" },
    ] } },
  ]);
  expect(
    "all 8 ecommerce block ids are registered",
    okMissing.length === 0,
    `unexpected missing: ${JSON.stringify(okMissing)}`,
  );

  console.log("\nstarter trees");
  const ids = listStarterIds();
  expect("19 starter trees indexed (R004 +7 brand presets +1 brand-page-pack)", ids.length === 19, `actual: ${ids.length}`);
  for (const id of ids) {
    const t = await loadStarterTree(id);
    expect(`load ${id}`, t !== null && t.variantId === id, `got ${JSON.stringify(t?.variantId)}`);
    expect(`${id} has blocks`, (t?.blocks?.length ?? 0) > 0);
  }

  console.log("\napplyStarterVariant integration");
  const storage = makeMemoryStorage();
  const r1 = await applyStarterVariant(
    {
      agencyId: "agency_test",
      clientId: "client_test",
      role: "login",
      variantId: "login-default",
      actor: "user_test",
    },
    storage,
  );
  expect("apply login-default ok", r1.ok, r1.ok ? undefined : r1.error);
  if (r1.ok) {
    expect("returns pageId", typeof r1.pageId === "string" && r1.pageId.startsWith("page_"));
    expect("returns siteId", typeof r1.siteId === "string" && r1.siteId.startsWith("site_"));
    expect("returns variantId echo", r1.variantId === "login-default");
  }

  // Apply a second login variant — should flip active.
  const r2 = await applyStarterVariant(
    {
      agencyId: "agency_test",
      clientId: "client_test",
      role: "login",
      variantId: "login-onboarding",
    },
    storage,
  );
  expect("apply second login variant ok", r2.ok, r2.ok ? undefined : r2.error);

  // Mismatched role should fail cleanly.
  const r3 = await applyStarterVariant(
    {
      agencyId: "agency_test",
      clientId: "client_test",
      role: "affiliates",
      variantId: "login-default",
    },
    storage,
  );
  expect("role/variant mismatch returns ok:false", !r3.ok);

  // Unknown variantId should fail cleanly.
  const r4 = await applyStarterVariant(
    {
      agencyId: "agency_test",
      clientId: "client_test",
      role: "login",
      variantId: "nope",
    },
    storage,
  );
  expect("unknown variantId returns ok:false", !r4.ok);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error("unhandled", e);
  process.exit(1);
});
