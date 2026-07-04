// Smoke — R009 4 Notion-Incubator blocks (icon · property-strip ·
// toggle · card-grid). Validates registry shape + render contract
// (no DOM — exercises the React renderer via react-dom/server) +
// theme-overlay CSS-var hooks.

// `react-dom/server` types aren't bundled with @types/react-dom in this
// plugin's devDeps — the function is stable enough that a typed dynamic
// import keeps the smoke decoupled from a deps update.
// @ts-expect-error — no .d.ts shipped for this entry point in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import { getBlockDefinition } from "../components/blockRegistry";
import IconBlock from "../components/blocks/IconBlock";
import PropertyStripBlock from "../components/blocks/PropertyStripBlock";
import ToggleBlock from "../components/blocks/ToggleBlock";
import CardGridBlock from "../components/blocks/CardGridBlock";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function makeBlock(type: string, props: Record<string, unknown>, children?: Block[]): Block {
  return { id: `${type}_smoke`, type: type as Block["type"], props, ...(children ? { children } : {}) };
}

(async () => {
  // ─── A: registry surfaces all 4 ─────────────────────────────────────────
  for (const id of ["icon", "property-strip", "toggle", "card-grid"]) {
    const def = getBlockDefinition(id);
    expect(`block ${id} registered`, !!def, `missing definition for ${id}`);
  }

  // ─── B: icon — image mode renders 64×64 chip with offset overlap ────────
  const iconImage = renderToStaticMarkup(
    React.createElement(IconBlock, {
      block: makeBlock("icon", { image: "https://example.com/x.png", offsetY: -32, label: "Aqua" }),
    } as never),
  );
  expect("icon image-mode emits data-mode='image'", iconImage.includes('data-mode="image"'));
  expect("icon image-mode renders 64×64 img", iconImage.includes('width="64"') && iconImage.includes('height="64"'));
  expect("icon image-mode applies negative offset for cover overlap",
    iconImage.includes("margin-top:-32px"));
  expect("icon image-mode surfaces the label caption", iconImage.includes("Aqua"));

  const iconGlyph = renderToStaticMarkup(
    React.createElement(IconBlock, { block: makeBlock("icon", { glyph: "✦", color: "#C9A76A" }) } as never),
  );
  expect("icon glyph-mode emits data-mode='glyph'", iconGlyph.includes('data-mode="glyph"'));
  expect("icon glyph-mode honours custom colour", iconGlyph.includes("color:#C9A76A"));

  // ─── C: property-strip — disclosure with key/value rows + url type ──────
  const propsHtml = renderToStaticMarkup(
    React.createElement(PropertyStripBlock, {
      block: makeBlock("property-strip", {
        rows: [
          { key: "Phase",   type: "phase",  value: "Epic Intro" },
          { key: "Status",  type: "select", value: "In progress" },
          { key: "Started", type: "date",   value: "2026-05-07" },
          { key: "Notes",   type: "text",   value: "Welcome." },
          { key: "Calendar", type: "url",   value: "https://example.com/cal" },
        ],
      }),
    } as never),
  );
  expect("property-strip uses native <details> for disclosure",
    propsHtml.startsWith("<section") && propsHtml.includes("<details"));
  expect("property-strip surfaces all keys",
    ["Phase", "Status", "Started", "Notes", "Calendar"].every(k => propsHtml.includes(k)));
  expect("property-strip phase/select rows render as chips",
    /<span[^>]*background:var\(--inc-chip-bg/.test(propsHtml));
  expect("property-strip url type emits external link",
    propsHtml.includes('href="https://example.com/cal"') &&
    propsHtml.includes('target="_blank"'));
  expect("property-strip honours collapsedLabel default ('5 more properties')",
    propsHtml.includes("5 more properties"));

  // ─── D: toggle — collapsible disclosure with nested children ────────────
  const toggleHtml = renderToStaticMarkup(
    React.createElement(ToggleBlock, {
      block: makeBlock("toggle", { label: "What we're doing", defaultOpen: true }, [
        makeBlock("text", { text: "We're starting with a discovery call." }),
      ]),
      renderChildren: (kids: Block[] | undefined) => kids?.map(k =>
        React.createElement("div", { key: k.id }, String(k.props.text)),
      ) ?? null,
    } as never),
  );
  expect("toggle renders <details open> when defaultOpen=true",
    toggleHtml.includes("<details open"));
  expect("toggle surfaces the label", toggleHtml.includes("What we&#x27;re doing"));
  expect("toggle renders nested children via renderChildren",
    toggleHtml.includes("We&#x27;re starting with a discovery call."));

  const toggleClosed = renderToStaticMarkup(
    React.createElement(ToggleBlock, {
      block: makeBlock("toggle", { label: "Collapsed by default" }),
      renderChildren: () => null,
    } as never),
  );
  expect("toggle defaults closed", toggleClosed.includes("<details ") && !toggleClosed.includes("<details open"));

  // ─── E: card-grid — Notion mode with cover + icon + label ──────────────
  const gridNotion = renderToStaticMarkup(
    React.createElement(CardGridBlock, {
      block: makeBlock("card-grid", {
        heading: "Phase Path",
        items: [
          { coverImg: "https://example.com/forest.jpg", icon: "💎", label: "Epic Intro", href: "/incubator/onboarding" },
          { coverImg: "https://example.com/marble.jpg", icon: "🏛", label: "Blueprint",  href: "/incubator/portal" },
        ],
      }),
    } as never),
  );
  expect("card-grid Notion mode emits data-mode='notion'",
    gridNotion.includes('data-mode="notion"'));
  expect("card-grid Notion mode renders cards as anchors with href",
    gridNotion.includes('href="/incubator/onboarding"') &&
    gridNotion.includes('href="/incubator/portal"'));
  expect("card-grid Notion mode surfaces icons + labels",
    gridNotion.includes("💎") && gridNotion.includes("Epic Intro"));
  expect("card-grid Notion mode includes cover images",
    gridNotion.includes("forest.jpg") && gridNotion.includes("marble.jpg"));
  expect("card-grid heading uses Playfair display var",
    gridNotion.includes("var(--font-playfair"));

  // Generic mode (cards array) still works.
  const gridGeneric = renderToStaticMarkup(
    React.createElement(CardGridBlock, {
      block: makeBlock("card-grid", {
        heading: "Services",
        cards: [{ title: "Discovery", body: "Find your story.", ctaLabel: "Start", ctaHref: "/start" }],
      }),
    } as never),
  );
  expect("card-grid generic mode renders <article> cards",
    gridGeneric.includes("<article"));
  expect("card-grid generic CTA emits link with arrow",
    gridGeneric.includes('href="/start"') && gridGeneric.includes("Start"));

  // ─── F: theme overlay — CSS vars present (no hardcoded brand colour) ───
  const themedSamples = [iconImage, propsHtml, toggleHtml, gridNotion];
  for (const html of themedSamples) {
    expect("theme overlay CSS-var hook present",
      html.includes("var(--"),
      "no var(--…) found — theme overlay would have nothing to bind to");
  }

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
