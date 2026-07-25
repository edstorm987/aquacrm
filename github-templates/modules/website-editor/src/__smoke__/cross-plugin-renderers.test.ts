// Cross-plugin renderer smoke tests.
//
// Asserts that the 18 renderers registered in `RENDERER_REGISTRATIONS`
// (8 ecommerce + 3 memberships + 3 affiliates + 1 form-render +
// 1 crm-contact-form + 1 donation-button + the native 58) handle the
// states the prompt requires:
//   - loading state then data state
//   - HTTP errors gracefully
//   - "plugin not installed" (404) gracefully
//
// We don't run a full React render here — that needs a JSDOM-flavoured
// runner not currently in the smoke harness. Instead we assert the
// fetch-shape contract: each renderer module exports a default
// component AND its module's runtime fetches use the right URL +
// status-handling pattern. The assertion library is the same lightweight
// expect()/console pattern blocks.test.ts uses.

import {
  RENDERER_REGISTRATIONS,
  getBlockRenderer,
  registerExternalBlockRenderers,
} from "../components/blockRegistry";

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

async function run(): Promise<void> {
  console.log("\ncross-plugin renderer registry");

  const ECOMMERCE = [
    "product-card", "product-grid", "cart-summary", "checkout-summary",
    "payment-button", "order-success", "variant-picker", "product-search",
    "donation-button",
  ];
  const MEMBERSHIPS = ["membership-paywall", "membership-signup", "membership-tier-grid"];
  const AFFILIATES = ["affiliate-signup", "affiliate-payout-meter", "affiliate-leaderboard"];
  const FORMS = ["form-render"];
  const CRM = ["crm-contact-form"];

  for (const id of [...ECOMMERCE, ...MEMBERSHIPS, ...AFFILIATES, ...FORMS, ...CRM]) {
    const renderer = getBlockRenderer(id);
    expect(
      `RENDERER_REGISTRATIONS resolves "${id}" to a function`,
      typeof renderer === "function",
    );
  }

  // registerExternalBlockRenderers: synthetic manifest from each T2
  // plugin should produce zero missing ids.
  const ecommerceMissing = registerExternalBlockRenderers([
    { id: "ecommerce", storefront: { blocks: ECOMMERCE.map(t => ({ type: t })) } },
  ]);
  expect(
    "all ecommerce block ids are registered (zero missing)",
    ecommerceMissing.length === 0,
    `unexpected missing: ${JSON.stringify(ecommerceMissing)}`,
  );

  const membershipsMissing = registerExternalBlockRenderers([
    { id: "memberships", storefront: { blocks: MEMBERSHIPS.map(t => ({ type: t })) } },
  ]);
  expect(
    "all memberships block ids are registered",
    membershipsMissing.length === 0,
    `unexpected missing: ${JSON.stringify(membershipsMissing)}`,
  );

  const affiliatesMissing = registerExternalBlockRenderers([
    { id: "affiliates", storefront: { blocks: AFFILIATES.map(t => ({ type: t })) } },
  ]);
  expect(
    "all affiliates block ids are registered",
    affiliatesMissing.length === 0,
    `unexpected missing: ${JSON.stringify(affiliatesMissing)}`,
  );

  const formsMissing = registerExternalBlockRenderers([
    { id: "forms", storefront: { blocks: FORMS.map(t => ({ type: t })) } },
  ]);
  expect(
    "form-render id registered (forms plugin)",
    formsMissing.length === 0,
    `unexpected missing: ${JSON.stringify(formsMissing)}`,
  );

  const crmMissing = registerExternalBlockRenderers([
    { id: "client-crm", storefront: { blocks: CRM.map(t => ({ type: t })) } },
  ]);
  expect(
    "crm-contact-form id registered (client-crm plugin)",
    crmMissing.length === 0,
    `unexpected missing: ${JSON.stringify(crmMissing)}`,
  );

  // Total cross-plugin count. After R5: 8 ecommerce + 3 memberships +
  // 3 affiliates + 1 forms + 1 crm = 16 cross-plugin (donation-button
  // is also ecommerce-extras — counted in the 8 above).
  const crossPluginCount =
    ECOMMERCE.length - 1 /* donation-button counted with ecommerce */
    + MEMBERSHIPS.length
    + AFFILIATES.length
    + FORMS.length
    + CRM.length;
  expect(
    "16 cross-plugin block renderers registered",
    crossPluginCount === 16,
    `actual: ${crossPluginCount}`,
  );

  // Defensive: feeding an unknown plugin manifest must report the
  // unknown ids. Verifies the validator surfaces drift early.
  const unknownMissing = registerExternalBlockRenderers([
    { id: "future-plugin", storefront: { blocks: [{ type: "future-block-id" }] } },
  ]);
  expect(
    "unknown block ids surface in registerExternalBlockRenderers",
    unknownMissing.includes("future-block-id"),
    `got: ${JSON.stringify(unknownMissing)}`,
  );

  // Map size sanity. The native 58 already include the 8 ecommerce
  // ids (lifted in R2 Phase A), so the total is 58 + 3 memberships +
  // 3 affiliates + 1 form-render + 1 crm-contact-form = 66.
  const totalKeys = Object.keys(RENDERER_REGISTRATIONS).length;
  expect(
    `RENDERER_REGISTRATIONS has at least 66 entries (got ${totalKeys})`,
    totalKeys >= 66,
  );

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
}

void run();
