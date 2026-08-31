// Renders the two "current page" website blocks the way React hydration sees
// them: once as the server renders them, and once as the FIRST client render
// does — a browser-shaped `window` in scope, effects not yet run. Prints the
// pair as JSON on stdout.
//
// It is a SEPARATE PROCESS on purpose. The canonical suite runs under
// `--conditions react-server`, where React does not export `useState` /
// `useEffect` at all, so a `"use client"` block cannot be rendered in-process.
// `scripts/smoke-block-current-page-hydration.test.ts` spawns this file without
// that condition and asserts on the JSON. Not named `*.test.ts` so the suite
// glob does not pick it up as a test of its own.
//
// issues #143.

// @ts-expect-error — react-dom/server ships no d.ts under this resolution.
import * as ReactDomServer from "react-dom/server";
import React from "react";
import BreadcrumbBlock from "../src/built-ins/modules/website-editor/src/components/blocks/BreadcrumbBlock";
import ShareButtonsBlock from "../src/built-ins/modules/website-editor/src/components/blocks/ShareButtonsBlock";
import type { Block } from "../src/engines/editor/elements/block";

const renderToStaticMarkup = (ReactDomServer as {
  renderToStaticMarkup: (node: unknown) => string;
}).renderToStaticMarkup;

const HREF = "https://aqua.example/blog/my-post";
const PATHNAME = "/blog/my-post";

function block(type: string, props: Record<string, unknown>): Block {
  return { id: `${type}_probe`, type: type as Block["type"], props };
}

/** The first client render — the tree React compares against the server HTML. */
function withWindow<T>(fn: () => T): T {
  const scope = globalThis as Record<string, unknown>;
  const had = "window" in scope;
  const previous = scope.window;
  scope.window = {
    location: { href: HREF, pathname: PATHNAME },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  try {
    return fn();
  } finally {
    if (had) scope.window = previous;
    else delete scope.window;
  }
}

function pair(Component: unknown, props: Record<string, unknown>): { server: string; firstClient: string } {
  const element = () => React.createElement(Component as never, { block: block("probe", props) } as never);
  return {
    server: renderToStaticMarkup(element()),
    firstClient: withWindow(() => renderToStaticMarkup(element())),
  };
}

console.log(JSON.stringify({
  shareDefault: pair(ShareButtonsBlock, {
    heading: "Share this:",
    networks: ["twitter", "linkedin", "facebook", "copy"],
  }),
  shareExplicit: pair(ShareButtonsBlock, {
    heading: "Share this:",
    networks: ["twitter", "linkedin", "facebook", "copy"],
    url: "https://example.com/post",
    text: "Check this out",
  }),
  breadcrumbAuto: pair(BreadcrumbBlock, { separator: "›", homeLabel: "Home" }),
  breadcrumbExplicit: pair(BreadcrumbBlock, {
    items: [{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: "My post" }],
  }),
}));
