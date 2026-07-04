// Smoke — R019 Multi-device viewport + mobile preview.
//
// Asserts:
//   - VIEWPORT_SPECS has Desktop/Tablet/Mobile with correct widths
//   - widthForViewport returns the right number per viewport
//   - isHiddenOn flag matrix
//   - pruneForViewport filters recursively + deep-clones (input untouched)
//   - detectOverflows returns [] when no DOM, flags blocks wider than viewport
//   - ViewportSwitcher renders 3 chips, marks active, surfaces flag dot

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import {
  VIEWPORT_SPECS,
  widthForViewport,
  isHiddenOn,
  pruneForViewport,
  detectOverflows,
  type Viewport,
} from "../lib/viewport";
import ViewportSwitcher from "../components/editor/ViewportSwitcher";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── A: VIEWPORT_SPECS ─────────────────────────────────────────────────
  expect("3 viewport specs", VIEWPORT_SPECS.length === 3);
  const ids = VIEWPORT_SPECS.map(s => s.id);
  expect("viewports = desktop / tablet / mobile",
    ids.includes("desktop" as Viewport) && ids.includes("tablet" as Viewport) && ids.includes("mobile" as Viewport));

  expect("desktop = 1280", widthForViewport("desktop") === 1280);
  expect("tablet = 768",   widthForViewport("tablet") === 768);
  expect("mobile = 390",   widthForViewport("mobile") === 390);

  // ─── B: isHiddenOn ─────────────────────────────────────────────────────
  expect("isHiddenOn(undefined) → false on every viewport",
    !isHiddenOn(undefined, "desktop") &&
    !isHiddenOn(undefined, "tablet") &&
    !isHiddenOn(undefined, "mobile"));
  expect("hideOnMobile flag hides on mobile only",
    isHiddenOn({ hideOnMobile: true }, "mobile") &&
    !isHiddenOn({ hideOnMobile: true }, "tablet") &&
    !isHiddenOn({ hideOnMobile: true }, "desktop"));
  expect("hideOnDesktop flag hides on desktop only",
    isHiddenOn({ hideOnDesktop: true }, "desktop") &&
    !isHiddenOn({ hideOnDesktop: true }, "mobile"));
  expect("hideOnTablet flag hides on tablet only",
    isHiddenOn({ hideOnTablet: true }, "tablet") &&
    !isHiddenOn({ hideOnTablet: true }, "desktop"));

  // ─── C: pruneForViewport ───────────────────────────────────────────────
  const tree: Block[] = [
    { id: "s1", type: "section", props: {}, children: [
      { id: "h1", type: "heading", props: { text: "Hi" } },
      { id: "h2", type: "heading", props: { text: "Mobile only" }, styles: { hideOnDesktop: true } },
      { id: "h3", type: "heading", props: { text: "Desktop only" }, styles: { hideOnMobile: true } },
    ]},
    { id: "b1", type: "button", props: {}, styles: { hideOnTablet: true } },
  ];

  const desktop = pruneForViewport(tree, "desktop");
  expect("desktop view drops hideOnDesktop blocks",
    !JSON.stringify(desktop).includes("Mobile only"));
  expect("desktop view keeps hideOnMobile blocks",
    JSON.stringify(desktop).includes("Desktop only"));
  const mobile = pruneForViewport(tree, "mobile");
  expect("mobile view drops hideOnMobile blocks",
    !JSON.stringify(mobile).includes("Desktop only"));
  expect("mobile view keeps hideOnDesktop blocks",
    JSON.stringify(mobile).includes("Mobile only"));
  const tablet = pruneForViewport(tree, "tablet");
  expect("tablet view drops hideOnTablet (top-level button)",
    tablet.find(b => b.id === "b1") === undefined);

  // Original tree untouched (deep clone).
  expect("original tree unchanged after prune",
    tree[0]!.children!.length === 3 && tree[1]!.id === "b1");

  // Recursive prune through nested children.
  const nested: Block[] = [
    { id: "outer", type: "section", props: {}, children: [
      { id: "inner", type: "section", props: {}, children: [
        { id: "leaf", type: "heading", props: { text: "deep" }, styles: { hideOnMobile: true } },
      ]},
    ]},
  ];
  const nestedMobile = pruneForViewport(nested, "mobile");
  expect("nested deep prune drops hideOnMobile leaf",
    !JSON.stringify(nestedMobile).includes("deep"));

  // ─── D: detectOverflows ────────────────────────────────────────────────
  expect("detectOverflows null doc → []",
    detectOverflows(null, 1280).length === 0);
  expect("detectOverflows undefined doc → []",
    detectOverflows(undefined, 1280).length === 0);

  // Mock a document with two blocks: one within viewport, one over.
  const mockDoc = {
    querySelectorAll(_selector: string) {
      return [
        {
          getAttribute(name: string) { return name === "data-block-id" ? "block-good" : null; },
          getBoundingClientRect() { return { width: 1200 } as DOMRect; },
        },
        {
          getAttribute(name: string) { return name === "data-block-id" ? "block-overflow" : null; },
          getBoundingClientRect() { return { width: 1500 } as DOMRect; },
        },
      ];
    },
  } as unknown as Document;
  const overflows = detectOverflows(mockDoc, 1280);
  expect("detectOverflows flags one over-viewport block",
    overflows.length === 1 && overflows[0]!.blockId === "block-overflow");
  expect("detectOverflows tolerates 1px sub-pixel rounding",
    detectOverflows({
      querySelectorAll() {
        return [{
          getAttribute() { return "block-x"; },
          getBoundingClientRect() { return { width: 1281 } as DOMRect; },
        }];
      },
    } as unknown as Document, 1280).length === 0);

  // ─── E: ViewportSwitcher render ────────────────────────────────────────
  const switcher = renderToStaticMarkup(React.createElement(ViewportSwitcher, {
    current: "desktop", onChange: () => undefined,
  } as never));
  expect("ViewportSwitcher renders 3 chips",
    (switcher.match(/data-viewport=/g) ?? []).length === 3);
  expect("desktop chip marked active",
    switcher.includes('data-viewport="desktop" aria-pressed="true"') ||
    /data-viewport="desktop"[^>]*aria-pressed="true"/.test(switcher));
  expect("mobile chip not active when current=desktop",
    /data-viewport="mobile"[^>]*aria-pressed="false"/.test(switcher));
  expect("ViewportSwitcher surfaces width hints",
    switcher.includes(">1280<") && switcher.includes(">768<") && switcher.includes(">390<"));

  const flagged = renderToStaticMarkup(React.createElement(ViewportSwitcher, {
    current: "mobile", onChange: () => undefined,
    flags: { mobile: 2 },
  } as never));
  expect("ViewportSwitcher emits flag dot when count > 0",
    flagged.includes('aria-label="2 overflows"'));
  expect("ViewportSwitcher uses --brand-bg-elevated",
    switcher.includes("var(--brand-bg-elevated"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
