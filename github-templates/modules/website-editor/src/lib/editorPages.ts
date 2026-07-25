"use client";

// Admin-side client for the visual editor's page store. Talks to
// /api/portal/website-editor/pages[/...]. Wraps fetch + a per-site
// cache so the canvas can iterate fast without re-roundtripping on
// every keystroke.
//
// Faithful port of `02/src/lib/admin/editorPages.ts` with signatures
// preserved so the lifted editor admin pages compile unchanged. The
// only adjustments are:
//   - API base path: /api/portal/website-editor (vs 02's /api/portal/pages)
//   - the input/patch types live in `../types/editorPage`
//   - PortalRole comes from `./portalRole`

import type { Block } from "../types/block";
import type { EditorPage, CreatePageInput as BaseCreatePageInput, UpdatePagePatch } from "../types/editorPage";
import type { PortalRole } from "./portalRole";

interface ListPayload { ok: boolean; pages: EditorPage[]; }
interface PagePayload { ok: boolean; page: EditorPage; }

const cache: Record<string, EditorPage[]> = {};
const CHANGE_EVENT = "lk-editor-pages-change";

const BASE = "/api/portal/website-editor";

function bust(siteId: string) {
  delete cache[siteId];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { siteId } }));
  }
}

export async function listPages(siteId: string, force = false): Promise<EditorPage[]> {
  if (!force && cache[siteId]) return cache[siteId]!;
  const res = await fetch(`${BASE}/pages?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" });
  const data = await res.json() as ListPayload;
  cache[siteId] = data.pages ?? [];
  return cache[siteId]!;
}

export async function getPage(siteId: string, pageId: string): Promise<EditorPage | null> {
  const res = await fetch(`${BASE}/pages/get?siteId=${encodeURIComponent(siteId)}&pageId=${encodeURIComponent(pageId)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json() as PagePayload;
  return data.page;
}

// Lighter input than `CreatePageInput` (which requires agencyId/clientId at
// the type level — those come from the request session server-side).
export interface CreatePageInput {
  slug: string;
  title: string;
  description?: string;
  blocks?: Block[];
  portalRole?: PortalRole;
}

export async function createPage(siteId: string, input: CreatePageInput): Promise<EditorPage | null> {
  const res = await fetch(`${BASE}/pages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, ...input }),
  });
  if (!res.ok) return null;
  const data = await res.json() as PagePayload;
  bust(siteId);
  return data.page;
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  description?: string;
  blocks?: Block[];
  themeId?: string;
  customCSS?: string;
  customHead?: string;
  customFoot?: string;
  customCss?: string;
  layoutOverrides?: Record<string, unknown>;
  portalRole?: PortalRole;
  seo?: unknown;
}

export async function updatePage(siteId: string, pageId: string, patch: UpdatePageInput | UpdatePagePatch): Promise<EditorPage | null> {
  const res = await fetch(`${BASE}/pages`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, pageId, patch }),
  });
  if (!res.ok) return null;
  const data = await res.json() as PagePayload;
  bust(siteId);
  return data.page;
}

export async function deletePage(siteId: string, pageId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/pages?siteId=${encodeURIComponent(siteId)}&pageId=${encodeURIComponent(pageId)}`, { method: "DELETE" });
  if (res.ok) bust(siteId);
  return res.ok;
}

export async function publishPage(siteId: string, pageId: string): Promise<EditorPage | null> {
  const res = await fetch(`${BASE}/pages/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, pageId }),
  });
  if (!res.ok) return null;
  const data = await res.json() as PagePayload;
  bust(siteId);
  return data.page;
}

export async function revertPage(siteId: string, pageId: string): Promise<EditorPage | null> {
  const res = await fetch(`${BASE}/pages/revert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, pageId }),
  });
  if (!res.ok) return null;
  const data = await res.json() as PagePayload;
  bust(siteId);
  return data.page;
}

export function onPagesChange(cb: (siteId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { siteId?: string } | undefined;
    if (detail?.siteId) cb(detail.siteId);
  };
  window.addEventListener(CHANGE_EVENT, handler as EventListener);
  return () => window.removeEventListener(CHANGE_EVENT, handler as EventListener);
}

// ─── Portal variants ──────────────────────────────────────────────────────

export async function listPortalVariants(siteId: string, role: PortalRole): Promise<EditorPage[]> {
  const res = await fetch(
    `${BASE}/portal-variants?siteId=${encodeURIComponent(siteId)}&role=${encodeURIComponent(role)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = await res.json() as { ok: boolean; variants?: EditorPage[] };
  return data.variants ?? [];
}

export async function setActivePortalVariant(
  siteId: string,
  role: PortalRole,
  pageId: string | null,
): Promise<EditorPage[]> {
  const res = await fetch(
    `${BASE}/portal-variants/active`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId, role, pageId }),
    },
  );
  bust(siteId);
  if (!res.ok) return [];
  const data = await res.json() as { ok: boolean; variants?: EditorPage[] };
  return data.variants ?? [];
}

// Round-1 export — kept because some plugin internals already import this name.
export type { BaseCreatePageInput, UpdatePagePatch };
