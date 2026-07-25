// Smoke — R034 Version diff (block-tree + JSON line).

import {
  diffTrees, jsonLineDiff, summariseDiff,
} from "../lib/blockTreeDiff";
import type { Block } from "../types/block";
// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import VersionDiffPanel from "../components/editor/VersionDiffPanel";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── A: diffTrees basics ──────────────────────────────────────────────
  const a: Block[] = [
    { id: "h1", type: "heading", props: { text: "Hi" } },
    { id: "p1", type: "text", props: { text: "old" } },
    { id: "rm", type: "spacer", props: {} },
  ];
  const b: Block[] = [
    { id: "h1", type: "heading", props: { text: "Hi" } },
    { id: "p1", type: "text", props: { text: "new" } },
    { id: "add", type: "image", props: { src: "/x.png" } },
  ];

  const d = diffTrees(a, b);
  expect("added has the new id", d.added.length === 1 && d.added[0]!.id === "add");
  expect("removed has the dropped id", d.removed.length === 1 && d.removed[0]!.id === "rm");
  expect("modified has p1", d.modified.length === 1 && d.modified[0]!.id === "p1");
  expect("modified.propChanges flags 'props'",
    d.modified[0]!.propChanges.includes("props"));
  expect("h1 unchanged not in modified",
    !d.modified.some(m => m.id === "h1"));

  // identical trees → empty
  const same = diffTrees(a, a);
  expect("identical trees → empty diff",
    same.added.length === 0 && same.removed.length === 0 && same.modified.length === 0);

  // type change flagged
  const tA: Block[] = [{ id: "x", type: "heading", props: { text: "T" } }];
  const tB: Block[] = [{ id: "x", type: "text", props: { text: "T" } }];
  const dt = diffTrees(tA, tB);
  expect("type change flagged",
    dt.modified.length === 1 && dt.modified[0]!.propChanges.includes("type"));

  // styles change
  const sA: Block[] = [{ id: "x", type: "heading", props: { text: "T" }, styles: { padding: "4px" } }];
  const sB: Block[] = [{ id: "x", type: "heading", props: { text: "T" }, styles: { padding: "8px" } }];
  expect("styles change flagged",
    diffTrees(sA, sB).modified[0]!.propChanges.includes("styles"));

  // children count change
  const cA: Block[] = [{ id: "c", type: "container", props: {}, children: [
    { id: "k1", type: "text", props: { text: "a" } },
  ] }];
  const cB: Block[] = [{ id: "c", type: "container", props: {}, children: [
    { id: "k1", type: "text", props: { text: "a" } },
    { id: "k2", type: "text", props: { text: "b" } },
  ] }];
  const dc = diffTrees(cA, cB);
  expect("nested add captured by recursive flatten",
    dc.added.some(x => x.id === "k2"));
  expect("parent flagged children-count change",
    dc.modified.some(m => m.id === "c" && m.propChanges.includes("children")));

  // ─── B: summariseDiff ─────────────────────────────────────────────────
  const s = summariseDiff(d);
  expect("summary counts", s.addedCount === 1 && s.removedCount === 1 && s.modifiedCount === 1);
  expect("summary unchanged false", !s.unchanged);
  expect("summary unchanged true on identical",
    summariseDiff(diffTrees(a, a)).unchanged);

  // ─── C: stable sort ───────────────────────────────────────────────────
  const stableA: Block[] = [];
  const stableB: Block[] = [
    { id: "z", type: "text", props: { text: "z" } },
    { id: "a", type: "text", props: { text: "a" } },
    { id: "m", type: "text", props: { text: "m" } },
  ];
  const ds = diffTrees(stableA, stableB);
  expect("added sorted by id",
    ds.added.map(x => x.id).join(",") === "a,m,z");

  // ─── D: jsonLineDiff ──────────────────────────────────────────────────
  const ld = jsonLineDiff("one\ntwo\nthree", "one\ntwo-changed\nthree\nfour");
  expect("line diff has same one",
    ld[0]!.kind === "same" && ld[0]!.text === "one");
  const removes = ld.filter(e => e.kind === "remove").map(e => e.text);
  const adds = ld.filter(e => e.kind === "add").map(e => e.text);
  expect("line diff removes 'two'", removes.includes("two"));
  expect("line diff adds 'two-changed'", adds.includes("two-changed"));
  expect("line diff adds 'four'", adds.includes("four"));
  const last = ld[ld.length - 1]!;
  expect("appended line carries lineB only",
    last.kind === "add" && last.lineA === null && last.lineB === 4);

  // identical input → all-same, no adds/removes
  const eq = jsonLineDiff("a\nb\nc", "a\nb\nc");
  expect("identical text → all same",
    eq.length === 3 && eq.every(e => e.kind === "same"));

  // empty inputs
  const emptyBoth = jsonLineDiff("", "");
  expect("empty-both → single same empty line",
    emptyBoth.length === 1 && emptyBoth[0]!.kind === "same" && emptyBoth[0]!.text === "");

  // ─── E: VersionDiffPanel renders ──────────────────────────────────────
  const html = renderToStaticMarkup(React.createElement(VersionDiffPanel, {
    treeA: a, treeB: b, labelA: "v1 · auto-save", labelB: "v2 · current",
  }));
  expect("panel emits component marker",
    html.includes('data-component="version-diff-panel"'));
  expect("panel header shows labels",
    html.includes("v1 · auto-save") && html.includes("v2 · current"));
  expect("panel shows added chip 1",
    html.includes('data-testid="diff-chip-added"') && /diff-chip-added.*?1 added/s.test(html));
  expect("panel shows removed chip 1",
    /diff-chip-removed.*?1 removed/s.test(html));
  expect("panel shows modified chip 1",
    /diff-chip-modified.*?1 modified/s.test(html));
  expect("pane A renders with old label",
    html.includes('data-testid="diff-pane-v1 · auto-save"'));
  expect("pane B renders with new label",
    html.includes('data-testid="diff-pane-v2 · current"'));
  expect("removed block tone in pane A",
    /data-block-id="rm"[^>]*data-tone="removed"/.test(html));
  expect("added block tone in pane B",
    /data-block-id="add"[^>]*data-tone="added"/.test(html));
  expect("modified block tone in both panes",
    (html.match(/data-block-id="p1"[^>]*data-tone="modified"/g) ?? []).length === 2);

  // unchanged-only tree
  const unchanged = renderToStaticMarkup(React.createElement(VersionDiffPanel, {
    treeA: a, treeB: a,
  }));
  expect("unchanged panel shows no-changes badge",
    unchanged.includes('data-testid="diff-unchanged"'));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
