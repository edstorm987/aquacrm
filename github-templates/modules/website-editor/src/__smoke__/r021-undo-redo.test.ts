// Smoke — R021 Undo/redo history.
//
// Asserts the pure state machine in `editorHistory.ts` + the
// HistoryToolbar SSR contract.

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import {
  createHistory,
  pushSnapshot,
  undo,
  redo,
  jumpTo,
  currentSnapshot,
  canUndo,
  canRedo,
  undoActionLabel,
  redoActionLabel,
  DEFAULT_CAPACITY,
} from "../lib/editorHistory";
import HistoryToolbar from "../components/editor/HistoryToolbar";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const A: Block[] = [{ id: "a", type: "heading", props: { text: "A" } }];
const B: Block[] = [{ id: "a", type: "heading", props: { text: "A" } }, { id: "b", type: "text", props: { text: "B" } }];
const C: Block[] = [...B, { id: "c", type: "button", props: { label: "C" } }];

(async () => {
  // ─── A: createHistory ──────────────────────────────────────────────────
  const h0 = createHistory("p1", A, "open page", DEFAULT_CAPACITY, 1000);
  expect("createHistory seeds 1 snapshot at cursor 0",
    h0.entries.length === 1 && h0.cursor === 0);
  expect("currentSnapshot returns initial",
    currentSnapshot(h0)?.tree === A && currentSnapshot(h0)?.action === "open page");
  expect("canUndo false at start", !canUndo(h0));
  expect("canRedo false at start", !canRedo(h0));
  expect("DEFAULT_CAPACITY = 50", DEFAULT_CAPACITY === 50);

  // ─── B: pushSnapshot ───────────────────────────────────────────────────
  const h1 = pushSnapshot(h0, B, "insert text", 2000);
  expect("pushSnapshot extends entries", h1.entries.length === 2);
  expect("cursor moves to head", h1.cursor === 1);
  expect("canUndo true after push", canUndo(h1));
  expect("currentSnapshot is B", currentSnapshot(h1)?.tree === B);

  const h2 = pushSnapshot(h1, C, "insert button", 3000);
  expect("3rd snapshot", h2.entries.length === 3 && h2.cursor === 2);

  // ─── C: undo/redo ─────────────────────────────────────────────────────
  const u1 = undo(h2);
  expect("undo moves cursor back", u1.cursor === 1 && currentSnapshot(u1)?.tree === B);
  expect("canRedo true after undo", canRedo(u1));
  const u2 = undo(u1);
  expect("two undos lands at start", u2.cursor === 0 && currentSnapshot(u2)?.tree === A);
  expect("canUndo false at start of stack", !canUndo(u2));

  const u3 = undo(u2);
  expect("undo at start is no-op", u3.cursor === 0 && u3.entries.length === u2.entries.length);

  const r1 = redo(u2);
  expect("redo from start advances", r1.cursor === 1 && currentSnapshot(r1)?.tree === B);
  const r2 = redo(redo(r1));
  expect("redo past head is no-op", r2.cursor === 2);

  // ─── D: redo-tail truncated on fresh push ──────────────────────────────
  const branched = pushSnapshot(undo(h2), [], "delete-all", 4000);
  expect("push after undo truncates redo-tail",
    branched.entries.length === 3 && branched.cursor === 2);
  expect("post-truncation, can't redo to old C",
    !canRedo(branched));

  // ─── E: undoActionLabel / redoActionLabel ──────────────────────────────
  expect("undoActionLabel returns current snapshot's action",
    undoActionLabel(h2) === "insert button");
  expect("redoActionLabel returns next snapshot's action",
    redoActionLabel(undo(h2)) === "insert button");
  expect("undoActionLabel null at start", undoActionLabel(h0) === null);
  expect("redoActionLabel null at head", redoActionLabel(h2) === null);

  // ─── F: jumpTo ────────────────────────────────────────────────────────
  const j = jumpTo(h2, 0);
  expect("jumpTo(0) moves cursor", j.cursor === 0 && currentSnapshot(j)?.tree === A);
  expect("jumpTo out-of-range no-op",
    jumpTo(h2, 999).cursor === h2.cursor);
  expect("jumpTo(-1) no-op",
    jumpTo(h2, -1).cursor === h2.cursor);

  // ─── G: capacity trim ─────────────────────────────────────────────────
  let h = createHistory("p1", A, "open", 5);
  for (let i = 0; i < 10; i++) h = pushSnapshot(h, A, `step-${i}`, 5000 + i);
  expect("capacity 5 caps entries at 5",
    h.entries.length === 5);
  expect("capacity trim retains newest entries",
    h.entries[h.entries.length - 1]?.action === "step-9");
  expect("cursor still points at head after trim",
    h.cursor === h.entries.length - 1);

  // ─── H: HistoryToolbar render ─────────────────────────────────────────
  const handle = {
    state: h2,
    undo: () => undefined, redo: () => undefined, jumpTo: () => undefined,
    canUndo: canUndo(h2), canRedo: canRedo(h2),
    undoLabel: undoActionLabel(h2), redoLabel: redoActionLabel(h2),
  };
  const html = renderToStaticMarkup(React.createElement(HistoryToolbar, { history: handle } as never));
  expect("toolbar renders Undo + Redo buttons",
    html.includes('aria-label="Undo"') && html.includes('aria-label="Redo"'));
  expect("toolbar Undo title shows last action",
    html.includes('title="Undo: insert button"'));
  expect("toolbar Redo disabled at head with 'Nothing to redo'",
    html.includes('title="Nothing to redo"'));
  expect("toolbar History dropdown trigger",
    html.includes(">History ▾</button>"));
  expect("toolbar uses --brand-bg-elevated",
    html.includes("var(--brand-bg-elevated"));

  // Disabled-state for fresh history (canUndo = false).
  const handleFresh = {
    state: h0,
    undo: () => undefined, redo: () => undefined, jumpTo: () => undefined,
    canUndo: false, canRedo: false,
    undoLabel: null, redoLabel: null,
  };
  const fresh = renderToStaticMarkup(React.createElement(HistoryToolbar, { history: handleFresh } as never));
  expect("fresh history → Undo button disabled",
    /<button[^>]*disabled[^>]*aria-label="Undo"/.test(fresh));
  expect("fresh history → Undo title 'Nothing to undo'",
    fresh.includes('title="Nothing to undo"'));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
