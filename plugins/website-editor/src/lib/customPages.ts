"use client";

// Custom page builder. Faithful port of `02/src/lib/admin/customPages.ts`.
//
// **Distinct from EditorPage**: EditorPage manages site-level pages
// with versioning + publish flow + portal variants (R1/R2 server
// runtime). customPages is a simpler "ad-hoc page" system: each page
// is a sequence of typed blocks (hero, rich text, image, gallery,
// quote, embed, divider, CTA, html) rendered at /p/[slug].
//
// **Round-4 status**: localStorage-backed (matches 02 1:1). The R3
// CustomisePage shim landed under the same pattern; foundation
// server-side persistence is a Round-5 follow-up — when T1 ships a
// `PATCH /api/portal/website-editor/custom-pages` route + the
// `t/{agencyId}/{clientId}/custom-pages` namespace, swap reads/writes
// here for fetch calls. Single-file change.

import type { EditorPage } from "../types/editorPage";

const STORAGE_KEY = "lk_admin_pages_v1";
const CHANGE_EVENT = "lk-admin-pages-change";

export type CustomPageBlockType =
  | "hero" | "richText" | "image" | "gallery" | "quote" | "embed" | "divider" | "cta" | "html";

export interface BlockHero      { type: "hero"; eyebrow?: string; title: string; intro?: string; image?: string; }
export interface BlockRichText  { type: "richText"; html: string; }
export interface BlockImage     { type: "image"; src: string; caption?: string; alt?: string; }
export interface BlockGallery   { type: "gallery"; images: { src: string; alt?: string }[]; }
export interface BlockQuote     { type: "quote"; quote: string; attribution?: string; }
export interface BlockEmbed     { type: "embed"; url: string; caption?: string; }
export interface BlockDivider   { type: "divider"; }
export interface BlockCta       { type: "cta"; headline: string; subhead?: string; buttonLabel: string; buttonHref: string; }
export interface BlockHtml      { type: "html"; html: string; }

export type CustomPageBlock =
  (BlockHero | BlockRichText | BlockImage | BlockGallery | BlockQuote | BlockEmbed | BlockDivider | BlockCta | BlockHtml)
  & { id: string };

export type CustomPageStatus = "draft" | "published";

export interface CustomPageSeo {
  title?: string;
  description?: string;
  ogImage?: string;
  jsonld?: string;
  canonical?: string;
  robots?: string;
}

export interface CustomPage {
  id: string;
  slug: string;
  title: string;
  status: CustomPageStatus;
  hidden?: boolean;
  blocks: CustomPageBlock[];
  seo: CustomPageSeo;
  showInNav: boolean;
  navLabel?: string;
  createdAt: number;
  updatedAt: number;
}

interface Store { [id: string]: CustomPage; }

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Store; }
  catch { return {}; }
}

function write(s: Store): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function bid(): string { return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`; }
function pid(): string { return `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`; }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function uniqueSlug(base: string, ignoreId?: string): string {
  const used = new Set(Object.values(read()).filter(p => p.id !== ignoreId).map(p => p.slug));
  let s = base || "page";
  let i = 1;
  while (used.has(s)) s = `${base}-${++i}`;
  return s;
}

// ─── List + lookup ─────────────────────────────────────────────────────────

export function listCustomPages(): CustomPage[] {
  return Object.values(read()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listPublishedNavPages(): CustomPage[] {
  return listCustomPages().filter(p => p.status === "published" && p.showInNav);
}

export function getCustomPage(id: string): CustomPage | null {
  return read()[id] ?? null;
}

export function getCustomPageBySlug(slug: string): CustomPage | null {
  return Object.values(read()).find(p => p.slug === slug) ?? null;
}

export const loadCustomPages = listCustomPages;

// ─── Create / update / delete ──────────────────────────────────────────────

export function createCustomPage(title = "Untitled page"): CustomPage {
  const now = Date.now();
  const page: CustomPage = {
    id: pid(),
    slug: uniqueSlug(slugify(title)),
    title,
    status: "draft",
    blocks: [
      { id: bid(), type: "hero", title, intro: "" },
    ],
    seo: {},
    showInNav: false,
    createdAt: now,
    updatedAt: now,
  };
  const s = read();
  s[page.id] = page;
  write(s);
  return page;
}

export function saveCustomPage(page: CustomPage): void {
  const s = read();
  s[page.id] = { ...page, updatedAt: Date.now() };
  write(s);
}

export function updateCustomPage(id: string, patch: Partial<CustomPage>): void {
  const s = read();
  const cur = s[id];
  if (!cur) return;
  const slug = patch.slug && patch.slug !== cur.slug ? uniqueSlug(slugify(patch.slug), id) : cur.slug;
  s[id] = { ...cur, ...patch, slug, updatedAt: Date.now() };
  write(s);
}

export function deleteCustomPage(id: string): void {
  const s = read();
  delete s[id];
  write(s);
}

export function duplicateCustomPage(id: string): CustomPage | null {
  const cur = getCustomPage(id);
  if (!cur) return null;
  const now = Date.now();
  const copy: CustomPage = {
    ...cur,
    id: pid(),
    slug: uniqueSlug(`${cur.slug}-copy`),
    title: `${cur.title} (copy)`,
    status: "draft",
    blocks: cur.blocks.map(b => ({ ...b, id: bid() })),
    createdAt: now,
    updatedAt: now,
  };
  const s = read();
  s[copy.id] = copy;
  write(s);
  return copy;
}

// ─── Block CRUD ────────────────────────────────────────────────────────────

export function addCustomBlock(pageId: string, type: CustomPageBlockType): CustomPageBlock | null {
  const s = read();
  const p = s[pageId];
  if (!p) return null;
  let block: CustomPageBlock;
  switch (type) {
    case "hero":     block = { id: bid(), type, title: "Heading" }; break;
    case "richText": block = { id: bid(), type, html: "<p>Write something…</p>" }; break;
    case "image":    block = { id: bid(), type, src: "" }; break;
    case "gallery":  block = { id: bid(), type, images: [] }; break;
    case "quote":    block = { id: bid(), type, quote: "" }; break;
    case "embed":    block = { id: bid(), type, url: "" }; break;
    case "divider":  block = { id: bid(), type }; break;
    case "cta":      block = { id: bid(), type, headline: "Ready?", buttonLabel: "Shop", buttonHref: "/#shop" }; break;
    case "html":     block = { id: bid(), type, html: "" }; break;
  }
  p.blocks.push(block);
  p.updatedAt = Date.now();
  write(s);
  return block;
}

export function updateCustomBlock(pageId: string, blockId: string, patch: Partial<CustomPageBlock>): void {
  const s = read();
  const p = s[pageId];
  if (!p) return;
  const i = p.blocks.findIndex(b => b.id === blockId);
  if (i < 0) return;
  const cur = p.blocks[i];
  if (!cur) return;
  p.blocks[i] = { ...cur, ...patch } as CustomPageBlock;
  p.updatedAt = Date.now();
  write(s);
}

export function deleteCustomBlock(pageId: string, blockId: string): void {
  const s = read();
  const p = s[pageId];
  if (!p) return;
  p.blocks = p.blocks.filter(b => b.id !== blockId);
  p.updatedAt = Date.now();
  write(s);
}

export function moveCustomBlock(pageId: string, blockId: string, dir: -1 | 1): void {
  const s = read();
  const p = s[pageId];
  if (!p) return;
  const i = p.blocks.findIndex(b => b.id === blockId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.blocks.length) return;
  const a = p.blocks[i]!;
  const b = p.blocks[j]!;
  p.blocks[i] = b;
  p.blocks[j] = a;
  p.updatedAt = Date.now();
  write(s);
}

// ─── Status helpers ────────────────────────────────────────────────────────

export function publishCustomPage(id: string): void { updateCustomPage(id, { status: "published" }); }
export function unpublishCustomPage(id: string): void { updateCustomPage(id, { status: "draft" }); }
export function toggleCustomPageHidden(id: string): void {
  const p = getCustomPage(id);
  if (p) updateCustomPage(id, { hidden: !p.hidden });
}

export function getPublishedCustomPage(slug: string): CustomPage | null {
  const p = getCustomPageBySlug(slug);
  return p && p.status === "published" && !p.hidden ? p : null;
}

// ─── Change listener ───────────────────────────────────────────────────────

export function onCustomPagesChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ─── Round-1 compat shims ──────────────────────────────────────────────────
//
// The Round-1 stub at this path exposed a different surface
// (CustomPageType + CUSTOM_PAGE_TYPES + getCustomPageType + isCustomPage).
// Re-export them so any place that imported them keeps compiling.

export interface CustomPageType {
  id: string;
  label: string;
  template?: string;
}

export const CUSTOM_PAGE_TYPES: CustomPageType[] = [
  { id: "page", label: "Page" },
  { id: "landing", label: "Landing page", template: "hero-cta" },
];

export function getCustomPageType(id: string): CustomPageType | undefined {
  return CUSTOM_PAGE_TYPES.find(t => t.id === id);
}

export function isCustomPage(_page: EditorPage): boolean {
  return false;
}
