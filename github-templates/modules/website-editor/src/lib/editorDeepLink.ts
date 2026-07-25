// Deep-link contract between T1's agency-shell "Edit website" CTA and the
// website-editor plugin. Pure helpers — kept framework-agnostic so the
// smoke harness (Node + tsx) can exercise every branch without React.
//
// URL shape: /portal/clients/[clientId]/edit-website?page=<pageId>&variant=<variantKey>
//   - clientId: required (path)
//   - page    : optional (query) → resolves to first page in pageOrder; else create
//   - variant : optional (query) → defaults to "default"
//
// "variant" maps to EditorPage.variantId; pages without a variantId are
// treated as the default variant. Most clients only have "default", so
// the variant switcher is hidden when only one variant is present.

import type { EditorPage } from "../types/editorPage";

export const DEFAULT_VARIANT = "default";

export interface PageLike {
  id: string;
  slug: string;
  title?: string;
  variantId?: string;
  updatedAt?: number;
  isHomepage?: boolean;
}

export interface DeepLinkInput {
  clientId: string;
  pageId?: string | null;
  variant?: string | null;
}

export interface ParsedDeepLink {
  pageId: string | null;     // null = caller defaults to home/first
  variant: string;           // always resolved (defaults to "default")
  pageDefaulted: boolean;    // true when ?page= absent
  variantDefaulted: boolean; // true when ?variant= absent
}

// Read ?page= and ?variant= from any URLSearchParams-shaped input.
// Accepts a real URLSearchParams or a plain Record<string, string|null|undefined>
// so callers can pass Next.js's `searchParams.get` results directly.
export function parseEditorDeepLink(
  search: URLSearchParams | Record<string, string | null | undefined> | null | undefined,
): ParsedDeepLink {
  const get = (k: string): string | null => {
    if (!search) return null;
    if (typeof (search as URLSearchParams).get === "function") {
      return (search as URLSearchParams).get(k);
    }
    const v = (search as Record<string, string | null | undefined>)[k];
    return v ?? null;
  };
  const rawPage = get("page");
  const rawVariant = get("variant");
  const pageId = rawPage && rawPage.length > 0 ? rawPage : null;
  const variant = rawVariant && rawVariant.length > 0 ? rawVariant : DEFAULT_VARIANT;
  return {
    pageId,
    variant,
    pageDefaulted: pageId === null,
    variantDefaulted: rawVariant === null || rawVariant === "",
  };
}

export function buildEditorDeepLink(input: DeepLinkInput): string {
  if (!input.clientId) throw new Error("clientId is required");
  const qs = new URLSearchParams();
  if (input.pageId) qs.set("page", input.pageId);
  if (input.variant && input.variant !== DEFAULT_VARIANT) qs.set("variant", input.variant);
  const tail = qs.toString();
  const path = `/portal/clients/${encodeURIComponent(input.clientId)}/edit-website`;
  return tail ? `${path}?${tail}` : path;
}

// Filter pages to a single variant. Pages without a variantId belong to
// the "default" variant.
export function pagesForVariant<T extends PageLike>(pages: T[], variant: string): T[] {
  const want = variant || DEFAULT_VARIANT;
  return pages.filter(p => (p.variantId ?? DEFAULT_VARIANT) === want);
}

// Distinct variants present across pages (always includes "default").
export function availableVariants<T extends PageLike>(pages: T[]): string[] {
  const set = new Set<string>([DEFAULT_VARIANT]);
  for (const p of pages) set.add(p.variantId ?? DEFAULT_VARIANT);
  return Array.from(set);
}

// Toolbar visibility helper. Hide the switcher when only one variant.
export function shouldShowVariantSwitcher(variants: string[]): boolean {
  return variants.length > 1;
}

// Resolve which page the editor should land on given an explicit
// requested id + the available pages (already filtered to a variant).
// Returns the requested id when present in the list; otherwise the
// first homepage entry, otherwise the first page, otherwise null
// (caller is responsible for creating a blank home).
export function resolveStartPage<T extends PageLike>(pages: T[], requestedPageId: string | null): string | null {
  if (requestedPageId) {
    const hit = pages.find(p => p.id === requestedPageId);
    if (hit) return hit.id;
  }
  const home = pages.find(p => p.isHomepage) ?? pages.find(p => p.slug === "/") ?? pages[0];
  return home?.id ?? null;
}

// Title → slug (kebab-case, ascii). "+ New page" derives a slug from the
// operator's title input.
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "untitled";
}

// Ensure the slug is unique against an existing page list. Appends -2,
// -3, … until free. Used by "+ New page".
export function uniqueSlug<T extends PageLike>(pages: T[], desired: string): string {
  const taken = new Set(pages.map(p => p.slug.replace(/^\//, "")));
  const root = desired.replace(/^\//, "");
  if (!taken.has(root)) return `/${root}`;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `/${root}-${n}`;
}

// EditorPage → PageLike adapter (used by callers passing the full type).
export function toPageLike(p: EditorPage): PageLike {
  return {
    id: p.id, slug: p.slug, title: p.title,
    variantId: p.variantId, updatedAt: p.updatedAt, isHomepage: p.isHomepage,
  };
}
