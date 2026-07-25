// R035 — Draft / published state helpers.
//
// Existing EditorPage already carries the four fields we need:
//   - blocks             : current persisted tree
//   - draftBlocks?       : edits that haven't been published
//   - publishedBlocks?   : last published snapshot (Round-2 addition)
//   - publishedAt?       : timestamp of last publish
//   - status             : "draft" | "published"
//
// R035 ships pure helpers + a status chip + a storefront resolver
// so all callers (editor / storefront / sitemap) read the same way.
//
// Conventions established here:
//   getDraftTree(p)      = p.draftBlocks ?? p.blocks
//   getPublishedTree(p)  = p.publishedBlocks ?? (status === "published"
//                          ? p.blocks : null)
//
//   "blocks" is the live operator-facing tree; if no separate
//   draftBlocks/publishedBlocks rows exist yet (older rows from
//   pre-R035 edits), `blocks` is treated as both — the chip then
//   renders "Published" or "Draft" based purely on `status`.

import type { Block } from "../types/block";
import type { EditorPage } from "../types/editorPage";

export function getDraftTree(page: EditorPage): Block[] {
  return page.draftBlocks ?? page.blocks ?? [];
}

export function getPublishedTree(page: EditorPage): Block[] | null {
  if (page.publishedBlocks) return page.publishedBlocks;
  if (page.status === "published") return page.blocks ?? [];
  return null;
}

export function hasDraftAhead(page: EditorPage): boolean {
  // "Draft ahead" = there's an in-flight draft that differs from
  // the last-published tree. Only meaningful once the page has
  // ever been published.
  if (!page.publishedAt && !page.publishedBlocks) return false;
  if (!page.draftBlocks) return false;
  const published = getPublishedTree(page);
  if (!published) return true;          // never published → draft is ahead
  return JSON.stringify(page.draftBlocks) !== JSON.stringify(published);
}

export type PageStatus = "draft" | "published" | "draft-ahead";

export function pageStatus(page: EditorPage): PageStatus {
  if (hasDraftAhead(page)) return "draft-ahead";
  if (page.status === "published") return "published";
  return "draft";
}

export interface SaveToDraftPatch {
  draftBlocks: Block[];
  updatedAt: number;
}

export function saveToDraftPatch(blocks: Block[], now: number = Date.now()): SaveToDraftPatch {
  return { draftBlocks: blocks, updatedAt: now };
}

export interface PromoteToPublishedPatch {
  status: "published";
  blocks: Block[];
  publishedBlocks: Block[];
  draftBlocks: undefined;
  publishedAt: number;
  publishedBy: string;
  updatedAt: number;
}

// Build the patch that promotes the in-flight draft into the
// published slot. Caller (server publishPage / handler) applies it.
// The helper exists so editor + tests + history-recorder all
// agree on what a "publish" mutation looks like.
export function promoteToPublishedPatch(
  page: EditorPage,
  by: string,
  now: number = Date.now(),
): PromoteToPublishedPatch {
  const tree = getDraftTree(page);
  return {
    status: "published",
    blocks: tree,
    publishedBlocks: tree,
    draftBlocks: undefined,
    publishedAt: now,
    publishedBy: by,
    updatedAt: now,
  };
}

// ─── Storefront resolver ──────────────────────────────────────────────

export type StorefrontSource = "published" | "draft-fallback" | "draft-preview";

export interface ResolvedStorefrontTree {
  tree: Block[];
  source: StorefrontSource;
  // True when storefront fell back to draft because no published
  // tree exists yet — host should surface a "Preview · not yet
  // published" badge in this case.
  isFallback: boolean;
}

export function resolveStorefrontTree(
  page: EditorPage,
  opts: { preview?: boolean } = {},
): ResolvedStorefrontTree {
  if (opts.preview) {
    return { tree: getDraftTree(page), source: "draft-preview", isFallback: false };
  }
  const published = getPublishedTree(page);
  if (published) {
    return { tree: published, source: "published", isFallback: false };
  }
  return { tree: getDraftTree(page), source: "draft-fallback", isFallback: true };
}
