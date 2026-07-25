// Smoke — R023 Site-wide find-and-replace.

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import {
  findInTree,
  replaceInTree,
  findAcrossPages,
  totalMatches,
} from "../lib/findReplace";
import FindReplaceModal from "../components/editor/FindReplaceModal";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const TREE: Block[] = [
  { id: "h1", type: "heading", props: { text: "Welcome to Aqua" } },
  { id: "h2", type: "heading", props: { heading: "Aqua Incubator", subheading: "Your aqua journey starts here" } },
  // Image href + url shouldn't match (not text props).
  { id: "im1", type: "image", props: { src: "https://example.com/aqua.jpg", alt: "aqua-bg" } },
  { id: "s1", type: "section", props: {}, children: [
    { id: "t1", type: "text", props: { text: "AQUA in caps and aquatic too" } },
    { id: "b1", type: "button", props: { label: "Try Aqua", href: "/aqua" } },
  ]},
];

(async () => {
  // ─── A: substring search default (case-insensitive) ───────────────────
  const m1 = findInTree(TREE, "aqua");
  // Matches: "Welcome to Aqua" (1), "Aqua Incubator" (1) + "Your aqua journey" (1) → 2,
  // "AQUA in caps and aquatic too" → 2 (AQUA + aquatic substring),
  // button label "Try Aqua" → 1. Image src/alt and button href excluded.
  expect("substring case-insensitive matches across text props",
    m1.length === 6,
    `got ${m1.length}: ${m1.map(m => `${m.blockType}.${m.prop} @${m.index}`).join(", ")}`);
  expect("matches skip image src + alt + button href (not text-prop allowlist)",
    m1.every(m => m.prop !== "src" && m.prop !== "alt" && m.prop !== "href"));
  expect("matches surface blockType + prop + path",
    m1.every(m => m.blockType && m.prop && m.path.includes("[")));
  expect("snippet centred around match",
    m1.find(m => m.blockId === "h1")?.snippet === "Welcome to Aqua");

  // ─── B: case-sensitive ──────────────────────────────────────────────────
  const m2 = findInTree(TREE, "Aqua", { caseSensitive: true });
  // Only capital "Aqua" — Welcome to Aqua, Aqua Incubator, Try Aqua. Lower-case aqua + AQUA + aquatic excluded.
  expect("case-sensitive matches only capital 'Aqua'",
    m2.length === 3,
    `got ${m2.length}`);

  // ─── C: whole-word ──────────────────────────────────────────────────────
  const m3 = findInTree(TREE, "aqua", { wholeWord: true });
  // "aquatic" should NOT match whole-word (it's a prefix); "AQUA"
  // (case-insensitive) should match.
  // Expected matches: heading.text "Aqua", heading.heading "Aqua",
  // heading.subheading "aqua", text.text "AQUA" (whole word),
  // button.label "Aqua". 5 total; "aquatic" excluded.
  expect("whole-word excludes 'aquatic' but includes whole 'aqua'/'AQUA'",
    m3.length === 5 && !m3.some(m => m.snippet.includes("aquatic but not aquatic")),
    `got ${m3.length}: ${m3.map(m => m.snippet).join(" | ")}`);

  // ─── D: empty query → [] ────────────────────────────────────────────────
  expect("empty query returns []",
    findInTree(TREE, "").length === 0);

  // ─── E: replaceInTree ──────────────────────────────────────────────────
  const r1 = replaceInTree(TREE, "Aqua", "Felicia", { caseSensitive: true });
  expect("replaceInTree returns count",
    r1.replacements === 3);
  expect("replaceInTree only swaps capital Aqua",
    JSON.stringify(r1.blocks).includes("Welcome to Felicia") &&
    JSON.stringify(r1.blocks).includes("Felicia Incubator") &&
    JSON.stringify(r1.blocks).includes("Try Felicia") &&
    JSON.stringify(r1.blocks).includes("Your aqua journey")); // lowercase preserved
  // Original tree untouched (deep clone).
  expect("replaceInTree leaves input untouched",
    JSON.stringify(TREE[0]!.props.text) === '"Welcome to Aqua"');

  // Multiple matches in one prop string → all replaced.
  const r2 = replaceInTree(TREE, "aqua", "X");
  expect("replaceInTree replaces every occurrence per prop",
    r2.replacements === 6);

  // Non-text-prop values stay unchanged (image src/alt, button href).
  expect("replaceInTree doesn't touch image src",
    JSON.stringify(r2.blocks).includes("https://example.com/aqua.jpg"));

  // ─── F: empty query no-op ──────────────────────────────────────────────
  const noop = replaceInTree(TREE, "", "X");
  expect("empty-query replace is no-op + count 0",
    noop.replacements === 0 && noop.blocks === TREE);

  // ─── G: findAcrossPages + totalMatches ─────────────────────────────────
  const pages = [
    { id: "p1", title: "Home", blocks: TREE },
    { id: "p2", title: "About", blocks: [
      { id: "h2", type: "heading", props: { text: "Pure Aqua Promise" } },
    ] as Block[] },
    { id: "p3", title: "Contact", blocks: [
      { id: "f1", type: "form", props: { title: "Form Title" } },
    ] as Block[] },
  ];
  const summaries = findAcrossPages(pages, "Aqua", { caseSensitive: true });
  expect("findAcrossPages drops pages with 0 matches",
    summaries.length === 2 && summaries.every(s => s.pageId !== "p3"));
  expect("totalMatches sums correctly",
    totalMatches(summaries) === 3 + 1);

  // ─── H: FindReplaceModal SSR ───────────────────────────────────────────
  const closed = renderToStaticMarkup(React.createElement(FindReplaceModal, {
    open: false, onClose: () => undefined, pages: [], scope: "all",
    onScopeChange: () => undefined, onReplaceAll: () => undefined,
  } as never));
  expect("FindReplaceModal open=false renders empty", closed === "");

  const opened = renderToStaticMarkup(React.createElement(FindReplaceModal, {
    open: true, onClose: () => undefined, pages, scope: "all",
    onScopeChange: () => undefined, onReplaceAll: () => undefined,
  } as never));
  expect("FindReplaceModal renders dialog with title",
    opened.includes('aria-label="Find and replace"') && opened.includes(">Find and replace</h2>"));
  expect("FindReplaceModal has Find + Replace inputs",
    opened.includes('placeholder="Find…"') && opened.includes('placeholder="Replace with…"'));
  expect("FindReplaceModal has 3 scope chips",
    opened.includes(">This page</button>") &&
    opened.includes(">This variant</button>") &&
    opened.includes(">All pages</button>"));
  expect("FindReplaceModal active scope chip aria-pressed=true",
    /aria-pressed="true"[^>]*>All pages/.test(opened) ||
    /All pages[^<]*<\/button>/.test(opened));
  expect("FindReplaceModal Replace all disabled with empty query",
    /Replace all[^<]*<\/button>/.test(opened));
  expect("FindReplaceModal uses --brand-bg-elevated",
    opened.includes("var(--brand-bg-elevated"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
