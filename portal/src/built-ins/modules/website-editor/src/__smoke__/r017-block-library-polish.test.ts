// Smoke — R017 Block library polish: 5 new blocks.
//
// Renders each block via `react-dom/server.renderToStaticMarkup`
// and asserts contract surface + brand-kit CSS-var coverage.

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import { getBlockDefinition } from "../components/blockRegistry";
import FeatureComparisonBlock from "../components/blocks/FeatureComparisonBlock";
import TeamGridBlock from "../components/blocks/TeamGridBlock";
import BreadcrumbBlock from "../components/blocks/BreadcrumbBlock";
import ProcessStepsBlock from "../components/blocks/ProcessStepsBlock";
import ShareButtonsBlock from "../components/blocks/ShareButtonsBlock";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function makeBlock(type: string, props: Record<string, unknown>): Block {
  return { id: `${type}_smoke`, type: type as Block["type"], props };
}

(async () => {
  // ─── A: registry ────────────────────────────────────────────────────────
  for (const id of ["feature-comparison", "team-grid", "breadcrumb", "process-steps", "share-buttons"]) {
    const def = getBlockDefinition(id);
    expect(`block ${id} registered`, !!def);
    expect(`block ${id} has defaultProps populated`,
      !!def && Object.keys(def.defaultProps ?? {}).length > 0);
  }

  // ─── B: feature-comparison ──────────────────────────────────────────────
  const fcDef = getBlockDefinition("feature-comparison")!;
  const fc = renderToStaticMarkup(React.createElement(FeatureComparisonBlock, {
    block: makeBlock("feature-comparison", fcDef.defaultProps),
  } as never));
  expect("feature-comparison emits <table>", fc.includes("<table"));
  expect("feature-comparison surfaces all 3 default columns",
    fc.includes("Starter") && fc.includes("Growth") && fc.includes("Scale"));
  expect("feature-comparison renders boolean true as ✓",
    fc.includes("✓"));
  expect("feature-comparison renders boolean false as —",
    fc.includes("—"));
  expect("feature-comparison highlighted column has top border",
    fc.includes("border-top:2px solid"));
  expect("feature-comparison uses --brand-text", fc.includes("var(--brand-text"));

  // ─── C: team-grid ───────────────────────────────────────────────────────
  const tgDef = getBlockDefinition("team-grid")!;
  const tg = renderToStaticMarkup(React.createElement(TeamGridBlock, {
    block: makeBlock("team-grid", tgDef.defaultProps),
  } as never));
  expect("team-grid uses <article> per member", (tg.match(/<article/g) ?? []).length === 3);
  expect("team-grid renders avatar fallback initial when no avatarUrl",
    tg.includes(">F</div>"));   // Felicia → "F"
  expect("team-grid uses --brand-primary for role label",
    tg.includes("var(--brand-primary"));
  expect("team-grid empty state when members empty",
    renderToStaticMarkup(React.createElement(TeamGridBlock, {
      block: makeBlock("team-grid", { members: [] }),
    } as never)).includes("Add team members"));

  // ─── D: breadcrumb ──────────────────────────────────────────────────────
  const bc = renderToStaticMarkup(React.createElement(BreadcrumbBlock, {
    block: makeBlock("breadcrumb", {
      items: [{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: "My post" }],
    }),
  } as never));
  expect("breadcrumb is <nav> with aria-label", bc.startsWith("<nav") && bc.includes('aria-label="Breadcrumb"'));
  expect("breadcrumb intermediate items are anchors",
    bc.includes('<a href="/"') && bc.includes('<a href="/blog"'));
  expect("breadcrumb last item is span with aria-current=page",
    bc.includes('aria-current="page"'));
  expect("breadcrumb separator › between items",
    (bc.match(/›/g) ?? []).length === 2);

  // ─── E: process-steps ──────────────────────────────────────────────────
  const ps = renderToStaticMarkup(React.createElement(ProcessStepsBlock, {
    block: makeBlock("process-steps", {
      heading: "How",
      layout: "horizontal",
      steps: [
        { title: "Discover" },
        { title: "Design" },
        { title: "Deliver" },
      ],
    }),
  } as never));
  expect("process-steps emits <ol> with data-layout", ps.includes('data-layout="horizontal"') && ps.includes("<ol"));
  expect("process-steps renders 3 <li>", (ps.match(/<li/g) ?? []).length === 3);
  expect("process-steps numbered 1/2/3 in sequence",
    ps.includes(">1</div>") && ps.includes(">2</div>") && ps.includes(">3</div>"));
  expect("process-steps icon override replaces number when icon set",
    renderToStaticMarkup(React.createElement(ProcessStepsBlock, {
      block: makeBlock("process-steps", { steps: [{ title: "Spark", icon: "✦" }] }),
    } as never)).includes(">✦</div>"));

  // ─── F: share-buttons ──────────────────────────────────────────────────
  const sbDef = getBlockDefinition("share-buttons")!;
  const sb = renderToStaticMarkup(React.createElement(ShareButtonsBlock, {
    block: makeBlock("share-buttons", { ...sbDef.defaultProps, url: "https://example.com/post", text: "Check this out" }),
  } as never));
  expect("share-buttons twitter intent URL",
    sb.includes("twitter.com/intent/tweet") &&
    sb.includes(encodeURIComponent("https://example.com/post")));
  expect("share-buttons LinkedIn share URL",
    sb.includes("linkedin.com/sharing/share-offsite"));
  expect("share-buttons Facebook sharer URL",
    sb.includes("facebook.com/sharer/sharer.php"));
  expect("share-buttons Copy is <button> not <a>",
    sb.includes('aria-label="Copy page link"'));
  expect("share-buttons heading surface", sb.includes("Share this:"));

  // Custom networks subset.
  const sbSubset = renderToStaticMarkup(React.createElement(ShareButtonsBlock, {
    block: makeBlock("share-buttons", { url: "https://x.com", networks: ["twitter", "copy"] }),
  } as never));
  expect("share-buttons custom networks subset",
    sbSubset.includes("twitter.com/intent") &&
    !sbSubset.includes("linkedin.com") &&
    !sbSubset.includes("facebook.com") &&
    sbSubset.includes('aria-label="Copy page link"'));

  // ─── G: every block emits brand-kit CSS vars ───────────────────────────
  for (const html of [fc, tg, bc, ps, sb]) {
    expect("brand-kit CSS-var token present",
      html.includes("var(--brand-"));
  }

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
