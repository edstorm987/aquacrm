// ELEMENT ENGINE P3 — the portal speaks the shared vocabulary.
//
// The parity harness next door (`smoke-portal-element-parity.test.ts`) answers
// "did the merge change what a client sees" — it must always be no. This file
// answers the other half: "did the merge actually merge anything, or did it add
// a third registry with a nicer comment on it".
//
// The claims under test:
//
//   1. There is ONE entry per element. Portal `hero` and website `hero` are the
//      same object in the same registry, not two that agree today.
//   2. Every one of the 16 portal palette types resolves to a registered
//      element — 14 through an alias, 2 because they are genuinely new.
//   3. The palettes are filtered, not separate. A public marketing site is
//      never offered a decision panel; a client portal is never offered a
//      checkout summary.
//   4. A stored `ClientPortalPageBlock` round-trips through `Element` losslessly,
//      with the data binding and the audience rule on their own side-channels
//      rather than smuggled into `props`.
//   5. The portal's fail-soft stayed a PORTAL-SURFACE adapter. An unknown type
//      still degrades to `rich-text` at the portal's door, and the engine still
//      knows nothing about it — because a `type` typo is silent in production
//      (`BlockRenderer` renders null on a live page), so the registry must never
//      start answering for names it does not have.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BLOCK_REGISTRY,
  getBlockDefinition,
  listBlockDefinitions,
} from "@/built-ins/modules/website-editor/src/components/blockRegistry";
import {
  PORTAL_ELEMENT_BY_TYPE,
  PORTAL_ELEMENT_PAIRINGS,
  createPortalBlockRecord,
  fromElement,
  portalElementDefinition,
  portalVocabularyProblems,
  toElement,
} from "@/engines/editor/elements/portalElements";
import { getElementDefinition, listElementDefinitions } from "@/engines/editor/elements/registry";
import { assertDefinitionConsistent } from "@/engines/editor/elements/schema";
import {
  CLIENT_PORTAL_BLOCK_REGISTRY,
  createPortalBlock,
  normalisePortalBuilder,
} from "@/lib/portal/clientPortalBuilder";
import type { ClientPortalBlockType, ClientPortalPageBlock } from "@/server/types";

/**
 * The portal palette, spelled out rather than read back from the thing under
 * test. A derived list that quietly lost a row would otherwise make every
 * assertion below pass against a smaller portal.
 */
const PALETTE: Array<[ClientPortalBlockType, string]> = [
  ["hero", "Feature hero"],
  ["rich-text", "Text section"],
  ["callout", "Callout"],
  ["image", "Image"],
  ["video", "Video"],
  ["metrics", "Live metrics"],
  ["service-grid", "Service grid"],
  ["product-hub", "Product hub"],
  ["file-list", "Latest files"],
  ["activity", "Activity stream"],
  ["request-form", "Client request"],
  ["approval-panel", "Decision panel"],
  ["file-upload", "File drop"],
  ["link-list", "Link collection"],
  ["custom-extension", "Custom extension"],
  ["divider", "Divider"],
];

/** The 14 that duplicated a website element, and the element each one is. */
const ALIASES: Array<[ClientPortalBlockType, string]> = [
  ["hero", "hero"],
  ["rich-text", "text"],
  ["callout", "banner"],
  ["image", "image"],
  ["video", "video-embed"],
  ["divider", "divider"],
  ["link-list", "card-grid"],
  ["custom-extension", "html"],
  ["metrics", "stats-bar"],
  ["activity", "timeline"],
  ["service-grid", "feature-grid"],
  ["product-hub", "card-grid"],
  ["file-list", "blog-feed"],
  ["request-form", "contact-form"],
];

/** The two that were not a rename of anything. */
const PORTAL_ONLY: ClientPortalBlockType[] = ["approval-panel", "file-upload"];

const ALL_TYPES = [...PALETTE.map(([type]) => type), "system-content" as const];

describe("P3 — one vocabulary, not two registries", () => {
  it("the portal palette is derived and still reads exactly as it did", () => {
    assert.deepEqual(
      CLIENT_PORTAL_BLOCK_REGISTRY.map(entry => [entry.type, entry.label]),
      PALETTE,
      "the derived portal palette changed order, labels, or membership",
    );
    // `system-content` is a host instruction, not a placeable concept, and must
    // stay out of the palette even though it is a known stored type.
    assert.ok(
      !CLIENT_PORTAL_BLOCK_REGISTRY.some(entry => entry.type === "system-content"),
      "the system-content shim leaked into the operator's palette",
    );
    assert.ok(PORTAL_ELEMENT_BY_TYPE["system-content"], "system-content is still a known stored type");
  });

  it("each of the 14 duplicates is an alias of the element that already existed", () => {
    for (const [portalType, websiteType] of ALIASES) {
      const pairing = PORTAL_ELEMENT_BY_TYPE[portalType];
      assert.equal(pairing.alias, websiteType, `portal "${portalType}" is no longer paired with "${websiteType}"`);

      // Identity, not equality. If this were a copy, the two would be free to
      // drift again — which is the entire failure P3 exists to end.
      const shared = portalElementDefinition(portalType);
      assert.equal(
        shared,
        BLOCK_REGISTRY[websiteType],
        `portal "${portalType}" resolves to something other than the one registered "${websiteType}"`,
      );
    }
  });

  it("no portal type created a second registry entry for a shape that already had one", () => {
    // The four same-named pairs are the sharpest version of this: a merge that
    // registered portal definitions under their own names would have silently
    // OVERWRITTEN the website `hero`, `image`, `video` and `divider`, and the
    // website editor would have started rendering portal blocks.
    for (const type of ["hero", "image", "divider"]) {
      assert.equal(
        getElementDefinition(type),
        BLOCK_REGISTRY[type],
        `"${type}" in the shared registry is no longer the website library's definition`,
      );
    }

    // Two portal names, one element. That is a fact about the portal's
    // vocabulary — `link-list` and `product-hub` are both a grid of cards — and
    // having two registries is what let it stay invisible.
    assert.equal(portalElementDefinition("link-list"), portalElementDefinition("product-hub"));

    const portalDefs = listElementDefinitions("portal");
    const unique = new Set(ALIASES.map(([, websiteType]) => websiteType));
    assert.equal(
      portalDefs.length,
      unique.size + PORTAL_ONLY.length,
      `the portal surface holds ${portalDefs.length} definitions, expected ${unique.size + PORTAL_ONLY.length}`,
    );
    assert.equal(unique.size, 13, "the 14 aliases stopped collapsing onto 13 shared elements");
  });

  it("the vocabulary has no broken links", () => {
    // The check a single registry buys. Before P3, deleting the website
    // `banner` definition did nothing visible to the portal's `callout` — the
    // "these are the same element" claim lived in a comment. Now it is a link,
    // and this is what makes breaking it loud.
    assert.deepEqual(portalVocabularyProblems(), []);
  });

  it("the two genuinely new elements are registered, portal-only, and self-consistent", () => {
    for (const type of PORTAL_ONLY) {
      const def = getElementDefinition(type);
      assert.ok(def, `"${type}" is not in the shared registry`);
      assert.deepEqual(def.surfaces, ["portal"], `"${type}" is offered outside the portal`);
      assert.equal(PORTAL_ELEMENT_BY_TYPE[type].alias, null, `"${type}" is not a genuinely new concept any more`);
      assert.deepEqual(
        assertDefinitionConsistent(def),
        [],
        `"${type}" declares a default it does not satisfy`,
      );
    }
  });
});

describe("P3 — palettes are filtered, never separate", () => {
  it("a public marketing site is not offered the client portal's elements", () => {
    const website = listBlockDefinitions().map(def => def.type);
    for (const type of PORTAL_ONLY) {
      assert.ok(
        !website.includes(type),
        `the website palette offers "${type}", which reads a signed-in client's records`,
      );
    }
    // And the merge did not shrink the website palette either: the 14 aliases
    // are still website elements, they just also serve the portal now.
    assert.equal(website.length, Object.keys(BLOCK_REGISTRY).length);
    for (const [, websiteType] of ALIASES) {
      assert.ok(website.includes(websiteType), `"${websiteType}" fell out of the website palette`);
    }
  });

  it("a client portal is not offered commerce or checkout elements", () => {
    const portal = listElementDefinitions("portal").map(def => def.type);
    for (const type of ["checkout-summary", "cart-summary", "payment-button", "product-grid"]) {
      assert.ok(!portal.includes(type), `the portal palette offers "${type}"`);
    }
    for (const type of PORTAL_ONLY) assert.ok(portal.includes(type));
  });
});

describe("P3 — a stored portal block is an element, losslessly", () => {
  it("round-trips every known type without losing a field", () => {
    for (const type of ALL_TYPES) {
      const block = createPortalBlock(type, `${type}-rt`);
      assert.deepEqual(
        fromElement(toElement(block)),
        block,
        `"${type}" did not survive the trip through Element`,
      );
    }
  });

  it("round-trips a fully dressed block — every optional channel populated", () => {
    const block: ClientPortalPageBlock = {
      ...createPortalBlock("request-form", "dressed"),
      visible: false,
      visibilityRule: "specific-products",
      productIds: ["product-a", "product-b"],
      productMatch: "all",
      responsive: { hideOnMobile: true, hideOnDesktop: false, spacing: "spacious", alignment: "center" },
      width: "half",
      tone: "accent",
      eyebrow: "Prepared for {firstName}",
      title: "Your {projectLabel}",
      body: "Hello.",
      actionLabel: "Send",
      actionHref: "/portal/customer/requests",
      dataSource: "billing",
      requestType: "design-feedback",
      approvalType: "launch",
      uploadCategory: "recording",
      items: [{ id: "i1", label: "One", detail: "Detail", href: "https://example.com", imageUrl: "https://example.com/a.png" }],
      media: { url: "https://example.com/a.mp4", alt: "Alt", caption: "Cap", aspect: "portrait", fit: "contain" },
      extension: { enabled: true, placement: "after-content", title: "X", scopedCss: "", html: "<b>hi</b>", css: "b{}", javascript: "", minHeight: 300 },
    };
    assert.deepEqual(fromElement(toElement(block)), block);
  });

  it("keeps the binding and the audience rule OFF props", () => {
    const element = toElement({
      ...createPortalBlock("metrics", "bound"),
      dataSource: "delivery",
      visibilityRule: "specific-products",
      productIds: ["product-a"],
      productMatch: "any",
    });

    assert.deepEqual(element.binding, { source: "delivery" });
    assert.deepEqual(element.visibility, {
      rule: "specific-products",
      productIds: ["product-a"],
      productMatch: "any",
    });

    for (const key of ["dataSource", "visibilityRule", "productIds", "productMatch", "requestType", "approvalType", "uploadCategory"]) {
      assert.equal(element.props[key], undefined, `"${key}" leaked into props, where a component would render it`);
    }
    // `productIds`/`productMatch` decide whether the signed-in client sees the
    // block at all, so they belong to VISIBILITY. Filing them under `binding`
    // would read tidily and be wrong.
    assert.equal(element.binding?.productIds, undefined);
  });
});

describe("P3 — the portal's fail-soft stayed at the portal's door", () => {
  it("an unrecognised stored type still degrades to rich-text", () => {
    const normalised = normalisePortalBuilder(
      { pages: { summary: [{ type: "not-a-real-block", id: "smuggled", title: "Smuggled" }] }, customPages: [] },
      ["summary"],
    );
    const blocks = normalised.pages.summary ?? [];
    assert.equal(blocks[0]?.type, "rich-text", "the portal stopped failing soft on an unknown stored type");
    assert.equal(blocks[0]?.title, "Smuggled");
  });

  it("but the engine still knows nothing about a name it was never given", () => {
    // This is the important half. A bad `type` rename is SILENT in production —
    // `BlockRenderer` returns null for an unknown type on a live page rather
    // than erroring. If the registry started answering for unknown names to
    // make the portal's fail-soft "work everywhere", a typo would stop being
    // findable anywhere.
    assert.equal(getElementDefinition("not-a-real-block"), undefined);
    assert.equal(getBlockDefinition("not-a-real-block"), undefined);
    assert.equal(portalElementDefinition("not-a-real-block" as ClientPortalBlockType), undefined);
  });
});

describe("P3 — the per-type defaults are one declaration", () => {
  it("createPortalBlock reads the same table the palette does", () => {
    // Before P3 this knowledge was written three times: an if-ladder in
    // `createPortalBlock`, and again in `blockTitle` and `blockBody`. Those two
    // are gone; this pins that the remaining path is the table.
    for (const pairing of PORTAL_ELEMENT_PAIRINGS) {
      const record = createPortalBlockRecord(pairing.type, "fixed");
      if (pairing.defaults.title !== undefined) assert.equal(record.title, pairing.defaults.title);
      if (pairing.defaults.tone !== undefined) assert.equal(record.tone, pairing.defaults.tone);
      if (pairing.defaults.dataSource !== undefined) assert.equal(record.dataSource, pairing.defaults.dataSource);
      assert.equal(record.eyebrow, pairing.defaults.eyebrow ?? "Private workspace");
    }
  });

  it("every palette entry still produces a usable record", () => {
    for (const [type] of PALETTE) {
      const record = createPortalBlock(type, `${type}-check`);
      assert.equal(record.type, type);
      assert.ok(record.title.length > 0, `"${type}" inserts with no title`);
      assert.equal(record.visible, true);
      assert.equal(record.visibilityRule, "always");
    }
  });
});
