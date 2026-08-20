// HTML-parity harness for the client portal block vocabulary.
//
// THE SAFETY NET FOR ELEMENT-ENGINE P3. Live client portals render from
// `ClientPortalPageBlock` today. P3 merges those 16 types onto the shared
// element registry, and a merge that changes one character of what a signed-in
// client sees is a failure even if every other test is green. So this renders
// every portal block type to REAL HTML and the test file compares it, byte for
// byte, against a baseline captured from the pre-merge code.
//
// ── Why this is a separate process, not a `describe` block ─────────────────
//
// The smoke suite runs under `NODE_OPTIONS='--conditions react-server'`, and
// under that condition `react-dom/server` does not resolve at all — the
// react-server build of React has no `renderToStaticMarkup`, and importing
// `next/link` throws on `React.createContext`. Both are exactly what a portal
// page is made of. So the harness runs as a plain Node process (no condition),
// prints one JSON document on stdout, and
// `scripts/smoke-portal-element-parity.test.ts` spawns it and does the diffing.
// That is what makes this real HTML rather than a hand-rolled approximation of
// it.
//
// ── What is captured ──────────────────────────────────────────────────────
//
//  1. `blocks`     — `createPortalBlock(type)` for all 17 known types. The
//                    stored record shape, so a "harmless" default change is a
//                    diff.
//  2. `normalise`  — `normalisePortalBuilder` over a hostile document. Pins the
//                    fail-soft (unknown type → rich-text) as PORTAL-SURFACE
//                    behaviour.
//  3. `render`     — every type × {default, dressed} × {bare client, rich
//                    client}, plus whole-page compositions. Real HTML.
//
// Run directly to see the JSON:
//   npx tsx scripts/smoke-portal-element-parity.harness.tsx
// Re-capture the baseline (only ever with a deliberate, named intent):
//   npx tsx scripts/smoke-portal-element-parity.harness.tsx --write-baseline

import { writeFileSync } from "node:fs";
import React from "react";

// react-dom/server has no shipped types under this tsconfig's module
// resolution, and is deliberately not reachable under `--conditions
// react-server`; see the header.
// @ts-expect-error — no d.ts in scope
import * as ReactDomServer from "react-dom/server";
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: unknown) => string }).renderToStaticMarkup;

// Portal interaction blocks call `useRouter()`. Outside an app-router context
// that throws, so the harness mounts the real context with an inert router —
// the same thing Next does, minus navigation.
// @ts-expect-error — internal shared-runtime module, no public d.ts
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { createPortalBlock, normalisePortalBuilder } from "../src/lib/clientPortalBuilder";
import { PortalPageComposition } from "../src/app/portal/customer/_PortalPageComposition";
import type { CustomerPortalData } from "../src/app/portal/customer/_portalData";
import type { ClientPortalPageBlock, ClientPortalSectionId } from "../src/server/types";

// ─── The full known vocabulary ────────────────────────────────────────────
//
// Spelled out here rather than read from the registry ON PURPOSE. If the merge
// drops a type from the registry, a harness that iterated the registry would
// silently stop testing it and stay green. This list is the contract.

const PORTAL_BLOCK_TYPES = [
  "hero", "rich-text", "callout", "image", "video", "metrics", "service-grid",
  "product-hub", "file-list", "activity", "request-form", "approval-panel",
  "file-upload", "link-list", "custom-extension", "divider", "system-content",
] as const;

// ─── Fixtures ─────────────────────────────────────────────────────────────
//
// Two clients. `bare` proves every empty state still renders (a client with no
// files must not see a broken panel); `rich` proves every data-bound block
// still reads the same records. Every id and timestamp is fixed so the HTML is
// reproducible — a random id would make the baseline useless.

function portalData(kind: "bare" | "rich"): CustomerPortalData {
  const rich = kind === "rich";
  const data = {
    clientId: "client-parity",
    agencyId: "agency-parity",
    mode: "designing",
    presentation: { builder: { pages: {}, customPages: [] } },
    presentationProductId: rich ? "product-brand" : undefined,
    productPresentations: {},
    contactName: "Ada Lovelace",
    servicePlan: "Expansion Plan",
    planIncludes: [],
    billingCadence: "Monthly",
    accentColor: "#0B6F6D",
    lockInPaid: true,
    products: rich
      ? [
          { id: "product-brand", name: "Brand system", description: "Identity, guidelines and asset library.", accentColor: "#8A5CF6", deliverables: ["Logo suite", "Guidelines"], catalogKey: undefined, stageFocusOverrides: undefined },
          { id: "product-website", name: "Website build", description: "A fast marketing site.", accentColor: "", deliverables: [], catalogKey: undefined, stageFocusOverrides: undefined },
        ]
      : [],
    workspaces: rich
      ? [{ id: "ws-1", decisions: [{ id: "d1", status: "pending" }, { id: "d2", status: "approved" }], collections: [] }]
      : [],
    experienceHeadline: "A calm place for the work",
    files: rich
      ? [
          { id: "file-1", name: "Brand direction.pdf", url: "https://files.example.com/brand.pdf", category: "design" },
          { id: "file-2", name: "Kickoff recording.mp4", url: "https://files.example.com/kickoff.mp4", category: "recording" },
        ]
      : [],
    properties: rich ? [{ id: "prop-1", status: "live" }, { id: "prop-2", status: "draft" }] : [],
    requests: rich
      ? [{ id: "req-1", clientId: "client-parity", type: "support-ticket", status: "open", summary: "Font renders wrong", detail: "On mobile only.", createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 }]
      : [],
    contracts: [],
    brief: {},
    approvals: rich
      ? [{ id: "app-1", clientId: "client-parity", type: "design", status: "pending", title: "Homepage direction", summary: "Two routes to choose from.", createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 }]
      : [],
    invoices: rich
      ? [
          { id: "inv-1", status: "paid", totalCents: 120_000, currency: "GBP" },
          { id: "inv-2", status: "sent", totalCents: 48_000, currency: "GBP" },
        ]
      : [],
    paymentPlans: [],
    record: {},
    support: {},
    activity: rich
      ? [
          { id: "act-1", ts: 1_700_000_000_000, message: "Design review booked", category: "delivery" },
          { id: "act-2", ts: 1_700_086_400_000, message: "Invoice issued", category: "billing" },
        ]
      : [],
  };
  return data as unknown as CustomerPortalData;
}

/**
 * A block with every optional channel populated.
 *
 * The default from `createPortalBlock` exercises the empty path; this one
 * exercises tone, alignment, width, responsive hints, the action button, media,
 * items and the visibility rule — i.e. every field the renderer branches on.
 */
function dressed(type: (typeof PORTAL_BLOCK_TYPES)[number]): ClientPortalPageBlock {
  const block = createPortalBlock(type, `${type}-dressed`);
  return {
    ...block,
    tone: type === "hero" ? "accent" : "dark",
    width: "half",
    responsive: { hideOnMobile: false, hideOnDesktop: false, spacing: "spacious", alignment: "center" },
    eyebrow: "Prepared for {firstName}",
    title: "Your {projectLabel} with {providerName}",
    body: "Hello {firstName} — {serviceHeadline}.",
    actionLabel: "Open the workspace",
    actionHref: "/portal/customer/service",
    visibilityRule: "always",
    items: [
      { id: `${type}-item-1`, label: "Brand guidelines", detail: "The living document", href: "https://example.com/guidelines" },
      { id: `${type}-item-2`, label: "Internal only", detail: "Should not link", href: "javascript:alert(1)" },
      { id: `${type}-item-3`, label: "Local route", detail: "", href: "/portal/customer/files" },
    ],
    media: type === "image"
      ? { url: "https://images.example.com/hero.jpg", alt: "A workspace", caption: "Shot on location", aspect: "portrait", fit: "contain" }
      : type === "video"
        ? { url: "https://www.youtube.com/watch?v=abc123", alt: "Welcome film", caption: "Two minutes", aspect: "square", fit: "cover" }
        : block.media,
    dataSource: type === "metrics" ? "billing" : block.dataSource,
  };
}

const SECTION: ClientPortalSectionId = "summary";

function withBuilder(data: CustomerPortalData, blocks: ClientPortalPageBlock[]): CustomerPortalData {
  return {
    ...data,
    presentation: {
      ...data.presentation,
      builder: { pages: { [SECTION]: blocks }, customPages: [] },
    } as CustomerPortalData["presentation"],
  };
}

function render(node: React.ReactNode): string {
  // The inert router: portal interaction blocks call `useRouter()` and would
  // throw outside a provider. Nothing in a static render can navigate, so the
  // methods only have to exist.
  const router = { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined };
  return renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: router }, node),
  );
}

function renderBlocks(data: CustomerPortalData, blocks: ClientPortalPageBlock[], previewHrefPrefix?: string): string {
  return render(
    React.createElement(PortalPageComposition, {
      section: SECTION,
      data: withBuilder(data, blocks),
      providerName: "Aqua Oasis",
      previewHrefPrefix,
      children: React.createElement("div", { "data-system": "1" }, "LIVE WORKSPACE"),
    }),
  );
}

// ─── Capture ──────────────────────────────────────────────────────────────

export interface ParityCapture {
  blocks: Record<string, ClientPortalPageBlock>;
  normalise: unknown;
  render: Record<string, string>;
}

/**
 * Replaces the one genuinely random id in a fresh block with a stable token.
 *
 * `createPortalBlock("link-list")` seeds a starter item through
 * `portalBuilderId()`, which is random by design. Randomness is not the thing
 * under test, and leaving it in would make the record baseline fail on every
 * run for a reason nobody should have to re-diagnose. The SHAPE of the id is
 * still asserted — a merge that stopped generating one, or generated a
 * different shape, still shows up as a difference.
 */
function stableIds(block: ClientPortalPageBlock): ClientPortalPageBlock {
  return {
    ...block,
    items: block.items.map((item, index) => ({
      ...item,
      id: /^item-[a-z0-9]{12}$/.test(item.id) ? `item-<generated-${index}>` : item.id,
    })),
  };
}

export function capture(): ParityCapture {
  const bare = portalData("bare");
  const rich = portalData("rich");

  const blocks: Record<string, ClientPortalPageBlock> = {};
  for (const type of PORTAL_BLOCK_TYPES) blocks[type] = stableIds(createPortalBlock(type, `${type}-fixed`));

  const out: Record<string, string> = {};
  for (const type of PORTAL_BLOCK_TYPES) {
    const plain = createPortalBlock(type, `${type}-plain`);
    out[`bare/default/${type}`] = renderBlocks(bare, [plain]);
    out[`rich/default/${type}`] = renderBlocks(rich, [plain]);
    out[`bare/dressed/${type}`] = renderBlocks(bare, [dressed(type)]);
    out[`rich/dressed/${type}`] = renderBlocks(rich, [dressed(type)]);
    // Preview mode changes hrefs and puts the interaction blocks read-only.
    out[`rich/preview/${type}`] = renderBlocks(rich, [dressed(type)], "/client-preview/client-parity?section=");
  }

  // Whole-page composition: block ordering, the grid wrapper, the
  // `system-content` de-duplication, and the children fallback.
  const everything = PORTAL_BLOCK_TYPES.map(type => createPortalBlock(type, `${type}-page`));
  out["rich/page/all"] = renderBlocks(rich, everything);
  out["bare/page/all"] = renderBlocks(bare, everything);
  out["rich/page/no-system"] = renderBlocks(rich, everything.filter(block => block.type !== "system-content"));
  out["rich/page/two-system"] = renderBlocks(rich, [
    createPortalBlock("system-content", "system-a"),
    createPortalBlock("hero", "hero-after"),
    createPortalBlock("system-content", "system-b"),
  ]);
  out["rich/page/empty"] = renderBlocks(rich, []);

  // Visibility rules — a block hidden from a client must stay hidden.
  const hiddenRules: Array<[string, ClientPortalPageBlock]> = [
    ["invisible", { ...createPortalBlock("callout", "vis-invisible"), visible: false }],
    ["without-products", { ...createPortalBlock("callout", "vis-without"), visibilityRule: "without-products" }],
    ["with-products", { ...createPortalBlock("callout", "vis-with"), visibilityRule: "with-products" }],
    ["single-product", { ...createPortalBlock("callout", "vis-single"), visibilityRule: "single-product" }],
    ["multiple-products", { ...createPortalBlock("callout", "vis-multiple"), visibilityRule: "multiple-products" }],
    ["specific-any", { ...createPortalBlock("callout", "vis-any"), visibilityRule: "specific-products", productIds: ["product-brand"], productMatch: "any" }],
    ["specific-all", { ...createPortalBlock("callout", "vis-all"), visibilityRule: "specific-products", productIds: ["product-brand", "product-missing"], productMatch: "all" }],
    ["hide-mobile", { ...createPortalBlock("callout", "vis-mobile"), responsive: { hideOnMobile: true, hideOnDesktop: false, spacing: "compact", alignment: "left" } }],
    ["hide-desktop", { ...createPortalBlock("callout", "vis-desktop"), responsive: { hideOnMobile: false, hideOnDesktop: true, spacing: "none", alignment: "left" } }],
  ];
  for (const [label, block] of hiddenRules) {
    out[`rich/visibility/${label}`] = renderBlocks(rich, [block]);
    out[`bare/visibility/${label}`] = renderBlocks(bare, [block]);
  }

  // An unrecognised type reaching the renderer without passing through
  // `normalisePortalBuilder` — the real shape of a bad stored document.
  out["rich/unknown/type"] = renderBlocks(rich, [
    { ...createPortalBlock("rich-text", "unknown-block"), type: "not-a-real-block" as ClientPortalPageBlock["type"] },
  ]);

  // Unsafe hrefs and media URLs must stay refused.
  out["rich/unsafe/href"] = renderBlocks(rich, [
    { ...createPortalBlock("callout", "unsafe-href"), actionLabel: "Go", actionHref: "javascript:alert(1)" },
  ]);
  out["rich/unsafe/media"] = renderBlocks(rich, [
    { ...createPortalBlock("image", "unsafe-media"), media: { url: "javascript:alert(1)", alt: "x", caption: "", aspect: "landscape", fit: "cover" } },
  ]);
  out["rich/video/vimeo"] = renderBlocks(rich, [
    { ...createPortalBlock("video", "vimeo"), media: { url: "https://vimeo.com/76979871", alt: "", caption: "", aspect: "landscape", fit: "cover" } },
  ]);
  out["rich/video/youtu-be"] = renderBlocks(rich, [
    { ...createPortalBlock("video", "youtu"), media: { url: "https://youtu.be/dQw4w9WgXcQ", alt: "", caption: "", aspect: "landscape", fit: "cover" } },
  ]);
  out["rich/video/direct"] = renderBlocks(rich, [
    { ...createPortalBlock("video", "direct"), media: { url: "https://media.example.com/film.mp4", alt: "", caption: "Caption", aspect: "landscape", fit: "contain" } },
  ]);

  // Every data source the metrics block can be bound to.
  for (const source of ["portal-summary", "delivery", "billing", "results"] as const) {
    out[`rich/metrics/${source}`] = renderBlocks(rich, [
      { ...createPortalBlock("metrics", `metrics-${source}`), dataSource: source },
    ]);
    out[`bare/metrics/${source}`] = renderBlocks(bare, [
      { ...createPortalBlock("metrics", `metrics-${source}`), dataSource: source },
    ]);
  }

  // Every request / approval / upload binding.
  for (const requestType of ["choose", "suggestion", "design-feedback", "support-ticket", "cancel", "move-provider"] as const) {
    out[`rich/request/${requestType}`] = renderBlocks(rich, [
      { ...createPortalBlock("request-form", `req-${requestType}`), requestType },
    ]);
  }
  for (const approvalType of ["all", "design", "launch"] as const) {
    out[`rich/approval/${approvalType}`] = renderBlocks(rich, [
      { ...createPortalBlock("approval-panel", `app-${approvalType}`), approvalType },
    ]);
  }
  for (const uploadCategory of ["brief", "recording", "inspiration", "design-feedback", "misc"] as const) {
    out[`rich/upload/${uploadCategory}`] = renderBlocks(rich, [
      { ...createPortalBlock("file-upload", `up-${uploadCategory}`), uploadCategory },
    ]);
  }

  // A custom page rather than a section — the other entry point.
  const customData = {
    ...rich,
    presentation: {
      ...rich.presentation,
      builder: {
        pages: {},
        customPages: [{ id: "page-1", slug: "welcome", label: "Welcome", visible: true, blocks: [createPortalBlock("hero", "custom-hero"), createPortalBlock("link-list", "custom-links")] }],
      },
    } as CustomerPortalData["presentation"],
  };
  out["rich/custom/page"] = render(
    React.createElement(PortalPageComposition, {
      customPageSlug: "welcome",
      data: customData,
      providerName: "Aqua Oasis",
    }),
  );

  const hostile = {
    pages: {
      [SECTION]: [
        { type: "not-a-block", title: "Smuggled", id: "hostile-1" },
        { type: "hero", id: "bad id with spaces", eyebrow: 42, items: "nope" },
        { type: "system-content", id: "hostile-system" },
      ],
    },
    customPages: [{ label: "Welcome", slug: "Welcome!", blocks: [{ type: "metrics", dataSource: "nonsense", id: "hostile-metrics" }] }],
  };

  return {
    blocks,
    normalise: normalisePortalBuilder(hostile, [SECTION]),
    render: out,
  };
}

const BASELINE_URL = new URL("./portal-block-parity.baseline.json", import.meta.url);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const result = capture();
  if (process.argv.includes("--write-baseline")) {
    writeFileSync(BASELINE_URL, `${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(`baseline written: ${Object.keys(result.render).length} renders, ${Object.keys(result.blocks).length} block types\n`);
  } else {
    process.stdout.write(JSON.stringify(result));
  }
}
