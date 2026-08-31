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
import BreadcrumbBlock, { breadcrumbItemsFromPath } from "../components/blocks/BreadcrumbBlock";
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

// issues #143 — a block's FIRST client render is what React hydration compares
// against the server HTML. This runs a render with a browser-shaped `window`
// present so that first client render can be captured in a DOM-less harness.
function withWindow<T>(href: string, pathname: string, fn: () => T): T {
  const scope = globalThis as Record<string, unknown>;
  const had = "window" in scope;
  const previous = scope.window;
  scope.window = {
    location: { href, pathname },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  try { return fn(); } finally {
    if (had) scope.window = previous; else delete scope.window;
  }
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

  // ─── H: issues #143 — the DOCUMENTED default modes are hydration-stable ─
  // Both blocks advertise a "current page" default. Neither may derive it
  // during render: the server tree and the first client tree must be byte
  // identical, or React 19 leaves the divergence unpatched.

  const shareDefault = makeBlock("share-buttons", { ...sbDef.defaultProps });   // no `url` → current page
  const shareServer = renderToStaticMarkup(React.createElement(ShareButtonsBlock, { block: shareDefault } as never));
  const shareFirstClient = withWindow("https://aqua.example/blog/hello", "/blog/hello", () =>
    renderToStaticMarkup(React.createElement(ShareButtonsBlock, { block: shareDefault } as never)));
  expect("share-buttons blank url: server and first client render are identical",
    shareServer === shareFirstClient,
    `server ${shareServer.length}b vs client ${shareFirstClient.length}b`);
  expect("share-buttons blank url emits no empty share target",
    !shareServer.includes("?url=") && !shareServer.includes("?u=") &&
    !shareServer.includes("twitter.com") && !shareServer.includes("linkedin.com") && !shareServer.includes("facebook.com"));
  expect("share-buttons blank url renders href-less, aria-disabled share affordances",
    !/<a [^>]*href=/.test(shareServer) && (shareServer.match(/aria-disabled="true"/g) ?? []).length === 3);
  expect("share-buttons blank url declares its pending target",
    shareServer.includes('data-share-target="pending"'));
  expect("share-buttons blank url disables Copy until the URL is known",
    shareServer.includes('aria-label="Copy page link"') && shareServer.includes('disabled=""'));
  expect("share-buttons blank url does not LOOK live while it is inert",
    !shareServer.includes("cursor:pointer") &&
    (shareServer.match(/cursor:default/g) ?? []).length === 4 &&
    (shareServer.match(/opacity:0\.5/g) ?? []).length === 4);
  expect("share-buttons explicit url is resolved and window-independent",
    sb.includes('data-share-target="resolved"') && !sb.includes('disabled=""') &&
    !sb.includes("opacity:0.5") && (sb.match(/cursor:pointer/g) ?? []).length === 4 &&
    sb === withWindow("https://aqua.example/other", "/other", () =>
      renderToStaticMarkup(React.createElement(ShareButtonsBlock, {
        block: makeBlock("share-buttons", { ...sbDef.defaultProps, url: "https://example.com/post", text: "Check this out" }),
      } as never))));

  const bcAuto = makeBlock("breadcrumb", { separator: "›", homeLabel: "Home" });  // no items → auto mode
  const bcAutoServer = renderToStaticMarkup(React.createElement(BreadcrumbBlock, { block: bcAuto } as never));
  const bcAutoFirstClient = withWindow("https://aqua.example/blog/my-post", "/blog/my-post", () =>
    renderToStaticMarkup(React.createElement(BreadcrumbBlock, { block: bcAuto } as never)));
  expect("auto breadcrumb: server and first client render are identical",
    bcAutoServer === "" && bcAutoFirstClient === "",
    `server ${JSON.stringify(bcAutoServer.slice(0, 60))} vs client ${JSON.stringify(bcAutoFirstClient.slice(0, 60))}`);
  expect("explicit breadcrumb items are window-independent",
    bc === withWindow("https://aqua.example/elsewhere", "/elsewhere", () =>
      renderToStaticMarkup(React.createElement(BreadcrumbBlock, {
        block: makeBlock("breadcrumb", {
          items: [{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: "My post" }],
        }),
      } as never))));
  // The post-effect derivation itself is unchanged and still documented.
  expect("auto breadcrumb derivation links every segment but the last",
    JSON.stringify(breadcrumbItemsFromPath("/blog/my-post", "Home")) === JSON.stringify([
      { label: "Home", href: "/" }, { label: "blog", href: "/blog" }, { label: "my post" },
    ]));
  expect("auto breadcrumb derivation at the root is the home label alone",
    JSON.stringify(breadcrumbItemsFromPath("/", "Start")) === JSON.stringify([{ label: "Start" }]));

  // ─── G: every block emits brand-kit CSS vars ───────────────────────────
  for (const html of [fc, tg, bc, ps, sb]) {
    expect("brand-kit CSS-var token present",
      html.includes("var(--brand-"));
  }

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
