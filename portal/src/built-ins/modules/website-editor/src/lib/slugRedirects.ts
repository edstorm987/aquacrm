// R041 — Slug redirect helper.
//
// When an operator renames a page slug, the editor should add the
// old slug to the new page's `redirectSourceSlugs[]` so the runtime
// 301s the legacy URL to the new one (instead of 404'ing). This
// module is the pure map-builder + resolver. The host wires
// `resolveRedirect` into its catch-all route handler.
//
// NOT a general-purpose redirects module — that's R025 territory
// (cross-domain / regex / external rules). Slug redirects are
// strictly intra-site, slug-shaped, page-scoped.

import type { EditorPage } from "../types/editorPage";

// ─── Inputs ───────────────────────────────────────────────────────────

// Subset of EditorPage fields that drive the redirect map. Looser
// than the full page so callers (e.g. a sitemap pipeline) can pass
// projected rows.
export interface SlugRedirectPage {
  slug: string;
  status?: EditorPage["status"];
  redirectSourceSlugs?: string[];
}

export interface BuildOpts {
  // When true (default), only `published` pages contribute redirect
  // sources. A draft renaming a slug shouldn't redirect live traffic
  // until the rename ships.
  publishedOnly?: boolean;
}

// ─── Slug normalisation ───────────────────────────────────────────────

// Slugs may be stored as `/about`, `about`, or `/about/`. The map
// keys + values are normalised to a single canonical form: leading
// slash, no trailing slash (except root). Comparisons go through
// `normalizeSlug` so callers don't have to.
export function normalizeSlug(s: string): string {
  if (!s) return "/";
  let out = s.trim();
  if (!out.startsWith("/")) out = "/" + out;
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

// ─── Map shape ────────────────────────────────────────────────────────

export interface RedirectMap {
  // old slug → new slug. Both normalised.
  forward: Record<string, string>;
  // Issues found at build time. `cycle` is the most common — A→B
  // and B→A registered. `self` — a page redirects from its own slug.
  // `conflict` — two different pages claim the same old slug as a
  // source.
  issues: RedirectIssue[];
}

export type RedirectIssueCode = "cycle" | "self" | "conflict";

export interface RedirectIssue {
  code: RedirectIssueCode;
  oldSlug: string;
  newSlug?: string;
  message: string;
}

// ─── Build ────────────────────────────────────────────────────────────

export function buildRedirectMap<T extends SlugRedirectPage>(
  pages: readonly T[],
  opts: BuildOpts = {},
): RedirectMap {
  const publishedOnly = opts.publishedOnly !== false;
  const forward: Record<string, string> = {};
  const issues: RedirectIssue[] = [];
  const ownership: Record<string, string> = {};   // oldSlug → newSlug already claimed

  for (const p of pages) {
    if (publishedOnly && p.status && p.status !== "published") continue;
    const target = normalizeSlug(p.slug);
    const sources = p.redirectSourceSlugs ?? [];
    for (const raw of sources) {
      const old = normalizeSlug(raw);
      if (old === target) {
        issues.push({
          code: "self",
          oldSlug: old,
          newSlug: target,
          message: `page ${target} lists itself as a redirect source`,
        });
        continue;
      }
      const claimed = ownership[old];
      if (claimed && claimed !== target) {
        issues.push({
          code: "conflict",
          oldSlug: old,
          newSlug: target,
          message: `${old} claimed by both ${claimed} and ${target}; first claim (${claimed}) wins`,
        });
        continue;
      }
      ownership[old] = target;
      forward[old] = target;
    }
  }

  // Cycle detection — A→B + B→A. Strongly-connected components of
  // length 1 are caught by the self-loop check above; this detects
  // length-2 cycles and arbitrary-length chains via DFS.
  const seen = new Set<string>();
  for (const start of Object.keys(forward)) {
    if (seen.has(start)) continue;
    const stack = [start];
    const onPath = new Set<string>();
    while (stack.length) {
      const node = stack[stack.length - 1]!;
      if (!onPath.has(node)) {
        onPath.add(node);
        seen.add(node);
      }
      const next = forward[node];
      if (!next) {
        onPath.delete(node);
        stack.pop();
        continue;
      }
      if (onPath.has(next)) {
        issues.push({
          code: "cycle",
          oldSlug: node,
          newSlug: next,
          message: `redirect cycle: ${[...onPath, next].join(" → ")}`,
        });
        onPath.delete(node);
        stack.pop();
        continue;
      }
      if (seen.has(next)) {
        onPath.delete(node);
        stack.pop();
        continue;
      }
      stack.push(next);
    }
  }

  return { forward, issues };
}

// ─── Resolve ──────────────────────────────────────────────────────────

export interface ResolveResult {
  to: string;
  status: 301;
}

// Walks the chain so A→B→C resolves to C in one hop. Caps at 8 hops
// to defend against any cycle the builder failed to flag (paranoia).
export function resolveRedirect(
  slug: string,
  map: RedirectMap | Record<string, string>,
): ResolveResult | null {
  const maybe = (map as RedirectMap).forward;
  const fwd: Record<string, string> = maybe && typeof maybe === "object"
    ? maybe
    : (map as Record<string, string>);
  let cur = normalizeSlug(slug);
  const next = fwd[cur];
  if (!next) return null;
  cur = next;
  const visited = new Set<string>([slug, cur]);
  for (let i = 0; i < 8; i++) {
    const nxt = fwd[cur];
    if (!nxt) break;
    if (visited.has(nxt)) break;
    visited.add(nxt);
    cur = nxt;
  }
  return { to: cur, status: 301 };
}

// ─── Editor helpers ──────────────────────────────────────────────────

// Compute the proposed redirectSourceSlugs[] when an operator
// renames a page slug. Default: prepend the old slug; idempotent
// when the old slug is already present.
export function withSlugRename(
  page: SlugRedirectPage,
  newSlug: string,
): { slug: string; redirectSourceSlugs: string[] } {
  const existing = page.redirectSourceSlugs ?? [];
  const oldNorm = normalizeSlug(page.slug);
  const newNorm = normalizeSlug(newSlug);
  if (oldNorm === newNorm) {
    return { slug: page.slug, redirectSourceSlugs: existing };
  }
  const dedup = existing.map(normalizeSlug);
  if (!dedup.includes(oldNorm) && oldNorm !== newNorm) {
    dedup.unshift(oldNorm);
  }
  // Drop the new slug from the redirect source list — it's now the
  // canonical slug (would otherwise cause `self` issue).
  const filtered = dedup.filter((s) => s !== newNorm);
  return { slug: newSlug, redirectSourceSlugs: filtered };
}
