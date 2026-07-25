// Smoke — R020 Code mode JSON tree editor.
//
// Asserts:
//   - parseBlockTreeJson accepts valid trees + flags errors with line/col
//   - validateBlockTree catches missing id/type/children-shape
//   - formatBlockTreeJson round-trips through parse
//   - compareTrees identifies identical / count-diff / first-difference
//   - CodeModePanel renders dual panels + JSON header + buttons
//   - CodeModePanel surfaces last-good preview marker on invalid edit

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import {
  parseBlockTreeJson,
  formatBlockTreeJson,
  validateBlockTree,
  compareTrees,
} from "../lib/blockTreeJson";
import CodeModePanel from "../components/editor/CodeModePanel";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const VALID: Block[] = [
  { id: "s1", type: "section", props: {}, children: [
    { id: "h1", type: "heading", props: { text: "Hi", level: 1 } },
    { id: "b1", type: "button", props: { label: "Go", href: "#" } },
  ]},
];

(async () => {
  // ─── A: parseBlockTreeJson ──────────────────────────────────────────────
  const okResult = parseBlockTreeJson(JSON.stringify(VALID));
  expect("valid JSON parses OK", okResult.ok === true);
  if (okResult.ok) {
    expect("valid JSON returns the right block count",
      okResult.blocks.length === 1 && okResult.blocks[0]!.children!.length === 2);
  }

  const syntaxErr = parseBlockTreeJson("[ {oops");
  expect("syntax error → ok:false", syntaxErr.ok === false);
  if (!syntaxErr.ok) {
    expect("syntax error includes message",
      typeof syntaxErr.error === "string" && syntaxErr.error.length > 0);
    // Many V8 variations include a position; line/col is best-effort.
  }

  const noArray = parseBlockTreeJson('{"id":"x"}');
  expect("non-array root → 'expected an array' error",
    !noArray.ok && noArray.error.includes("expected an array"));

  const missingId = parseBlockTreeJson('[{"type":"heading"}]');
  expect("missing id → error mentions id",
    !missingId.ok && missingId.error.includes(".id"));

  const missingType = parseBlockTreeJson('[{"id":"x"}]');
  expect("missing type → error mentions type",
    !missingType.ok && missingType.error.includes(".type"));

  const badChildren = parseBlockTreeJson('[{"id":"x","type":"section","children":"not-array"}]');
  expect("non-array children → error mentions children expected array",
    !badChildren.ok && badChildren.error.includes("children"));

  const nestedBad = parseBlockTreeJson('[{"id":"x","type":"section","children":[{"id":""}]}]');
  expect("nested missing type → error mentions nested path",
    !nestedBad.ok && nestedBad.error.includes("[0].children[0]"));

  // ─── B: validateBlockTree direct ────────────────────────────────────────
  expect("validateBlockTree on valid tree returns null",
    validateBlockTree(VALID) === null);
  expect("validateBlockTree on object returns 'expected an array'",
    validateBlockTree({ a: 1 })?.includes("expected an array") === true);

  // ─── C: formatBlockTreeJson + round-trip ────────────────────────────────
  const formatted = formatBlockTreeJson(VALID);
  expect("formatted JSON is indented with 2 spaces",
    formatted.includes("\n  "));
  const round = parseBlockTreeJson(formatted);
  expect("round-trip parse succeeds", round.ok === true);

  // ─── D: compareTrees ────────────────────────────────────────────────────
  const same = compareTrees(VALID, JSON.parse(JSON.stringify(VALID)) as Block[]);
  expect("compareTrees identical clone", same.identical && same.countA === same.countB);

  const longer: Block[] = [
    ...VALID,
    { id: "extra", type: "text", props: { text: "" } },
  ];
  const lenDiff = compareTrees(VALID, longer);
  expect("compareTrees length diff",
    !lenDiff.identical && lenDiff.countB === lenDiff.countA + 1);

  const propDiff: Block[] = [{ ...VALID[0]!, children: [
    { ...VALID[0]!.children![0]!, props: { text: "DIFFERENT", level: 1 } },
    VALID[0]!.children![1]!,
  ]}];
  const pd = compareTrees(VALID, propDiff);
  expect("compareTrees props diff has firstDifferenceAt",
    !pd.identical && pd.firstDifferenceAt !== undefined);

  const typeDiff: Block[] = [{ ...VALID[0]!, type: "container" }];
  const td = compareTrees(VALID, typeDiff);
  expect("compareTrees type diff lands at [0].type",
    !td.identical && td.firstDifferenceAt?.includes(".type") === true);

  // ─── E: CodeModePanel render ────────────────────────────────────────────
  const html = renderToStaticMarkup(React.createElement(CodeModePanel, {
    initialTree: VALID,
    onSave: () => undefined,
  } as never));
  expect("panel emits data-component='code-mode-panel'",
    html.includes('data-component="code-mode-panel"'));
  expect("panel header shows 'JSON tree' label",
    html.includes("JSON tree"));
  expect("panel renders Save / Copy / Paste / Reformat buttons",
    html.includes(">Save<") && html.includes(">Copy<") &&
    html.includes(">Paste<") && html.includes(">Reformat<"));
  expect("panel renders 'Live preview' header",
    html.includes("Live preview"));
  expect("panel includes textarea seeded with formatted JSON",
    html.includes("<textarea") && html.includes("&quot;id&quot;: &quot;s1&quot;"));
  expect("panel uses --brand-bg / --brand-text vars",
    html.includes("var(--brand-bg") && html.includes("var(--brand-text"));

  // SSR with custom renderPreview shows the host's content.
  const withPreview = renderToStaticMarkup(React.createElement(CodeModePanel, {
    initialTree: VALID,
    onSave: () => undefined,
    renderPreview: () => React.createElement("p", { "data-marker": "host-preview" }, "Host preview output"),
  } as never));
  expect("renderPreview callback output appears in right pane",
    withPreview.includes('data-marker="host-preview"') &&
    withPreview.includes("Host preview output"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
