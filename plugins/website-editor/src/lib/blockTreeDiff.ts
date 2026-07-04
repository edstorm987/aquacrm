// R034 — Block-tree diff + JSON line diff.
//
// Two pure helpers driving the version diff view:
//
//   diffTrees(a, b) → structural diff by block id. Recursive over
//     children. Returns { added, removed, modified } where:
//       added    = ids present in b but not a, with the full Block
//       removed  = ids present in a but not b, with the full Block
//       modified = ids present in both whose props/styles/type/a11y
//                  differ; `propChanges` lists which fields changed
//
//   jsonLineDiff(a, b) → line-by-line diff over two strings using
//     LCS, returning a flat list of {kind, text} entries the editor
//     can render as a unified-style diff. Stable on equal inputs
//     (empty `add`/`remove` lists). Quadratic in input length —
//     fine for two formatted JSON trees up to ~5k lines each.
//
// No React, no foundation imports. Smoke ships in r034-*.

import type { Block } from "../types/block";

export interface BlockTreeDiff {
  added: Block[];
  removed: Block[];
  modified: ModifiedBlock[];
}

export interface ModifiedBlock {
  id: string;
  before: Block;
  after: Block;
  propChanges: string[];   // list of field names that differ
}

function flatten(tree: Block[], out: Map<string, Block>): void {
  for (const b of tree) {
    out.set(b.id, b);
    if (b.children?.length) flatten(b.children, out);
  }
}

function changedFields(a: Block, b: Block): string[] {
  const diffs: string[] = [];
  if (a.type !== b.type) diffs.push("type");
  if (!shallowEq(a.props, b.props)) diffs.push("props");
  if (!shallowEq(a.styles ?? {}, b.styles ?? {})) diffs.push("styles");
  if (!shallowEq(a.a11y ?? {}, b.a11y ?? {})) diffs.push("a11y");
  if (!shallowEq(a.seo ?? {}, b.seo ?? {})) diffs.push("seo");
  // children compared positionally — diffTrees walks the full set
  // separately, so here we just flag whether the immediate child
  // count differs (cheap signal for "structure shifted under me").
  if ((a.children?.length ?? 0) !== (b.children?.length ?? 0)) diffs.push("children");
  return diffs;
}

function shallowEq(x: object, y: object): boolean {
  const kx = Object.keys(x) as Array<keyof typeof x>;
  const ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  const xr = x as Record<string, unknown>;
  const yr = y as Record<string, unknown>;
  for (const k of kx as unknown as string[]) {
    if (JSON.stringify(xr[k]) !== JSON.stringify(yr[k])) return false;
  }
  return true;
}

export function diffTrees(treeA: Block[], treeB: Block[]): BlockTreeDiff {
  const mapA = new Map<string, Block>();
  const mapB = new Map<string, Block>();
  flatten(treeA, mapA);
  flatten(treeB, mapB);

  const added: Block[] = [];
  const removed: Block[] = [];
  const modified: ModifiedBlock[] = [];

  for (const [id, b] of mapB) {
    if (!mapA.has(id)) added.push(b);
  }
  for (const [id, a] of mapA) {
    if (!mapB.has(id)) { removed.push(a); continue; }
    const b = mapB.get(id)!;
    const fields = changedFields(a, b);
    if (fields.length > 0) {
      modified.push({ id, before: a, after: b, propChanges: fields });
    }
  }

  // Stable sort by id so the UI doesn't shuffle on re-render.
  added.sort((x, y) => x.id.localeCompare(y.id));
  removed.sort((x, y) => x.id.localeCompare(y.id));
  modified.sort((x, y) => x.id.localeCompare(y.id));

  return { added, removed, modified };
}

// ─── JSON line diff ───────────────────────────────────────────────────

export type LineDiffKind = "same" | "add" | "remove";
export interface LineDiffEntry {
  kind: LineDiffKind;
  text: string;
  // Original 1-based line numbers (null when absent on that side).
  lineA: number | null;
  lineB: number | null;
}

// Standard LCS over two arrays of strings. Returns the diff as a
// unified sequence of same/add/remove rows.
export function jsonLineDiff(a: string, b: string): LineDiffEntry[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const m = linesA.length;
  const n = linesB.length;

  // dp[i][j] = LCS length of linesA[i..] and linesB[j..]
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = linesA[i] === linesB[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: LineDiffEntry[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (linesA[i] === linesB[j]) {
      out.push({ kind: "same", text: linesA[i]!, lineA: i + 1, lineB: j + 1 });
      i++; j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "remove", text: linesA[i]!, lineA: i + 1, lineB: null });
      i++;
    } else {
      out.push({ kind: "add", text: linesB[j]!, lineA: null, lineB: j + 1 });
      j++;
    }
  }
  while (i < m) { out.push({ kind: "remove", text: linesA[i]!, lineA: i + 1, lineB: null }); i++; }
  while (j < n) { out.push({ kind: "add", text: linesB[j]!, lineA: null, lineB: j + 1 }); j++; }
  return out;
}

export interface DiffSummary {
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchanged: boolean;
}

export function summariseDiff(d: BlockTreeDiff): DiffSummary {
  return {
    addedCount: d.added.length,
    removedCount: d.removed.length,
    modifiedCount: d.modified.length,
    unchanged: d.added.length === 0 && d.removed.length === 0 && d.modified.length === 0,
  };
}
