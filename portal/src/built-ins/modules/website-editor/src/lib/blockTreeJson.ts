// R020 — JSON ↔ BlockTree validation + (de)serialisation.
//
// `parseBlockTreeJson(json)` parses a JSON string and validates the
// shape against the `Block[]` contract. Returns `{ ok: true, blocks }`
// on success or `{ ok: false, error, line?, col? }` on failure. The
// editor's Code mode uses this to flag inline errors without
// breaking the live preview when the tree is invalid (preview keeps
// rendering the last-good tree).
//
// `formatBlockTreeJson(blocks)` produces stable, indented JSON the
// editor textarea can show.
//
// `compareTrees(a, b)` summarises structural differences (block
// counts + first-divergence path) for the "tree changed" confirm
// modal before save.

import type { Block } from "../types/block";

export type ParseResult =
  | { ok: true; blocks: Block[] }
  | { ok: false; error: string; line?: number; col?: number };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateBlock(value: unknown, path: string): string | null {
  if (!isPlainObject(value)) return `${path}: expected object, got ${typeof value}`;
  if (typeof value.id !== "string" || value.id.length === 0) return `${path}.id: required string`;
  if (typeof value.type !== "string" || value.type.length === 0) return `${path}.type: required string`;
  if (!isPlainObject(value.props)) {
    if (value.props !== undefined) return `${path}.props: expected object`;
  }
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) return `${path}.children: expected array`;
    for (let i = 0; i < value.children.length; i++) {
      const err = validateBlock(value.children[i], `${path}.children[${i}]`);
      if (err) return err;
    }
  }
  return null;
}

export function validateBlockTree(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return "root: expected an array of blocks";
  for (let i = 0; i < blocks.length; i++) {
    const err = validateBlock(blocks[i], `[${i}]`);
    if (err) return err;
  }
  return null;
}

// Naive line/col extraction from a JSON.parse SyntaxError message.
// V8 emits things like "Unexpected token … in JSON at position N";
// other engines vary. Best-effort — falls back to undefined when the
// position isn't parseable.
function lineColFromOffset(src: string, offset: number): { line: number; col: number } {
  let line = 1, col = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src.charCodeAt(i) === 10) { line += 1; col = 1; }
    else col += 1;
  }
  return { line, col };
}

export function parseBlockTreeJson(json: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /(?:position|column)\s+(\d+)/i.exec(msg);
    if (m) {
      const offset = Number(m[1]);
      const { line, col } = lineColFromOffset(json, offset);
      return { ok: false, error: msg, line, col };
    }
    return { ok: false, error: msg };
  }
  const err = validateBlockTree(parsed);
  if (err) return { ok: false, error: err };
  return { ok: true, blocks: parsed as Block[] };
}

export function formatBlockTreeJson(blocks: Block[]): string {
  return JSON.stringify(blocks, null, 2);
}

// ─── Tree comparison ──────────────────────────────────────────────────────

export interface TreeDiff {
  identical: boolean;
  countA: number;       // total node count in tree A (including nested)
  countB: number;
  // First path where the trees diverge — empty when identical.
  firstDifferenceAt?: string;
}

function countNodes(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    n += 1;
    if (b.children) n += countNodes(b.children);
  }
  return n;
}

function findFirstDifference(a: Block[], b: Block[], path: string): string | null {
  if (a.length !== b.length) return `${path} (length ${a.length} vs ${b.length})`;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai.type !== bi.type) return `${path}[${i}].type (${ai.type} vs ${bi.type})`;
    if (ai.id !== bi.id) return `${path}[${i}].id (${ai.id} vs ${bi.id})`;
    if (JSON.stringify(ai.props ?? {}) !== JSON.stringify(bi.props ?? {})) {
      return `${path}[${i}].props`;
    }
    const ac = ai.children ?? [];
    const bc = bi.children ?? [];
    if (ac.length > 0 || bc.length > 0) {
      const childDiff = findFirstDifference(ac, bc, `${path}[${i}].children`);
      if (childDiff) return childDiff;
    }
  }
  return null;
}

export function compareTrees(a: Block[], b: Block[]): TreeDiff {
  const countA = countNodes(a);
  const countB = countNodes(b);
  const diff = findFirstDifference(a, b, "");
  if (countA === countB && !diff) return { identical: true, countA, countB };
  return {
    identical: false,
    countA,
    countB,
    ...(diff ? { firstDifferenceAt: diff } : {}),
  };
}
