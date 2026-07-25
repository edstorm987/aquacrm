// R023 — Site-wide find-and-replace.
//
// Pure functions over `Block[]` trees. The host editor wraps these
// in a modal + multi-page fetch loop. Text-content only — block
// `props` strings; alt-text + attribute values explicitly out of
// scope per prompt.
//
// `findInTree(blocks, query, opts)` walks a single tree returning
// `Match[]`. `replaceInTree(blocks, query, replacement, opts)`
// returns a deep-cloned tree with substitutions applied.

import type { Block } from "../types/block";

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface Match {
  blockId: string;
  blockType: string;
  // Path through the tree (e.g. "[0].children[2]") for jumping.
  path: string;
  // Prop name where the match was found.
  prop: string;
  // Index of the first character of the match within the prop value.
  index: number;
  // Surrounding-text snippet (≤80 chars centred on the match) for
  // the result list.
  snippet: string;
  matchLength: number;
}

// ─── Text-prop detection ───────────────────────────────────────────────────
// We only search props whose value is a string and whose name looks
// like display copy (label / text / heading / description / etc).
// Skipping image URLs / hrefs is the prompt's explicit "alt-text +
// attribute values out-of-scope" gate.

const TEXT_PROP_KEYS = new Set([
  "text", "html", "label", "heading", "subheading", "subhead",
  "headline", "title", "description", "body", "caption",
  "ctaLabel", "submitLabel", "thankYouMessage", "message",
  "fallbackTitle", "inlineThankYou", "tagline", "summary", "content",
]);

function isTextProp(key: string): boolean {
  return TEXT_PROP_KEYS.has(key);
}

// ─── Search ────────────────────────────────────────────────────────────────

function buildMatcher(query: string, opts: FindOptions): (s: string) => number[] {
  if (!query) return () => [];
  if (opts.wholeWord) {
    // Word-boundary regex respecting case sensitivity. Escape regex
    // special characters in the query.
    const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\b|\\W)(${esc})(?:\\b|\\W|$)`, opts.caseSensitive ? "g" : "gi");
    return (s) => {
      const out: number[] = [];
      // Use exec to preserve match positions.
      let m: RegExpExecArray | null;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(s)) !== null) {
        // m.index is start of the boundary char; the captured group
        // is m[1] starting at m.index + (the leading boundary char's
        // length, which is 0 for ^ and \b, 1 for \W).
        const groupStart = m.index + (m[0]!.length - m[1]!.length);
        // Anchored at end?
        out.push(groupStart);
        if (r.lastIndex === m.index) r.lastIndex += 1;
      }
      return out;
    };
  }
  // Simple substring search.
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  return (s) => {
    const hay = opts.caseSensitive ? s : s.toLowerCase();
    const out: number[] = [];
    let from = 0;
    while (from < hay.length) {
      const i = hay.indexOf(needle, from);
      if (i === -1) break;
      out.push(i);
      from = i + Math.max(1, needle.length);
    }
    return out;
  };
}

function buildSnippet(text: string, index: number, matchLength: number): string {
  const radius = 30;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + matchLength + radius);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet += "…";
  return snippet.replace(/\s+/g, " ").trim();
}

export function findInTree(
  blocks: Block[],
  query: string,
  opts: FindOptions = {},
): Match[] {
  if (!query) return [];
  const matchFn = buildMatcher(query, opts);
  const out: Match[] = [];

  function walk(blocks: Block[], path: string): void {
    blocks.forEach((b, i) => {
      const blockPath = `${path}[${i}]`;
      // Search every text-shaped prop on this block.
      for (const [k, v] of Object.entries(b.props ?? {})) {
        if (typeof v !== "string") continue;
        if (!isTextProp(k)) continue;
        const positions = matchFn(v);
        for (const pos of positions) {
          out.push({
            blockId: b.id,
            blockType: String(b.type),
            path: blockPath,
            prop: k,
            index: pos,
            matchLength: query.length,
            snippet: buildSnippet(v, pos, query.length),
          });
        }
      }
      if (b.children) walk(b.children, `${blockPath}.children`);
    });
  }

  walk(blocks, "");
  return out;
}

// ─── Replace ───────────────────────────────────────────────────────────────

export interface ReplaceResult {
  blocks: Block[];
  replacements: number;
}

export function replaceInTree(
  blocks: Block[],
  query: string,
  replacement: string,
  opts: FindOptions = {},
): ReplaceResult {
  if (!query) return { blocks, replacements: 0 };
  const matchFn = buildMatcher(query, opts);
  let replacements = 0;

  function walkBlock(b: Block): Block {
    const next: Block = { ...b };
    if (b.props) {
      const nextProps: Record<string, unknown> = { ...b.props };
      for (const [k, v] of Object.entries(b.props)) {
        if (typeof v !== "string" || !isTextProp(k)) continue;
        const positions = matchFn(v);
        if (positions.length === 0) continue;
        // Splice replacements right-to-left so positions remain valid.
        let s = v;
        for (let i = positions.length - 1; i >= 0; i--) {
          const start = positions[i]!;
          s = s.slice(0, start) + replacement + s.slice(start + query.length);
          replacements += 1;
        }
        nextProps[k] = s;
      }
      next.props = nextProps;
    }
    if (b.children) next.children = b.children.map(walkBlock);
    return next;
  }

  return { blocks: blocks.map(walkBlock), replacements };
}

// ─── Multi-page batch ─────────────────────────────────────────────────────

export interface PageMatchSummary {
  pageId: string;
  pageTitle: string;
  matches: Match[];
}

export function findAcrossPages(
  pages: Array<{ id: string; title: string; blocks: Block[] }>,
  query: string,
  opts: FindOptions = {},
): PageMatchSummary[] {
  return pages
    .map(p => ({ pageId: p.id, pageTitle: p.title, matches: findInTree(p.blocks, query, opts) }))
    .filter(s => s.matches.length > 0);
}

export function totalMatches(summaries: PageMatchSummary[]): number {
  return summaries.reduce((n, s) => n + s.matches.length, 0);
}
