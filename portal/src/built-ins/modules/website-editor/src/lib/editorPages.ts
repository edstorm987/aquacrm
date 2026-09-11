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

interface PagePayload { ok: boolean; page: EditorPage; }

const KNOWN_PAGE_PUBLISH_MESSAGES: Readonly<Record<string, string>> = {
  public_upload_atomic_lifecycle_required:
    "Public media publishing is temporarily unavailable while protected publication and recall are being completed.",
  public_media_temporarily_unavailable:
    "Public media publishing is temporarily unavailable. No page changes were published.",
  public_media_security_validation_failed:
    "Public media did not pass security validation. No page changes were published.",
  publishing_temporarily_locked:
    "Publishing is temporarily disabled by a security control. The page was not published.",
};

export class EditorPagePublishError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(
      KNOWN_PAGE_PUBLISH_MESSAGES[code]
      ?? "The page could not be published. No success was recorded; try again or contact the app owner.",
    );
    this.name = "EditorPagePublishError";
  }
}

export class EditorPageListError extends Error {
  constructor(
    readonly code: "page_list_failed" | "page_list_invalid_response",
    readonly status: number,
  ) {
    super("The page list could not be read. Its state is unknown; reload or try again before publishing.");
    this.name = "EditorPageListError";
  }
}

function safePagePublishCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value)
    ? value
    : "page_publish_failed";
}

interface ExpectedPublishedPage {
  siteId: string;
  pageId: string;
}

function isEditorPage(value: unknown): value is EditorPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<EditorPage>;
  return typeof page.id === "string"
    && page.id.length > 0
    && typeof page.siteId === "string"
    && page.siteId.length > 0
    && typeof page.agencyId === "string"
    && page.agencyId.length > 0
    && typeof page.clientId === "string"
    && page.clientId.length > 0
    && typeof page.slug === "string"
    && typeof page.title === "string"
    && (page.status === "draft" || page.status === "published")
    && Array.isArray(page.blocks)
    && typeof page.createdAt === "number"
    && Number.isFinite(page.createdAt)
    && typeof page.updatedAt === "number"
    && Number.isFinite(page.updatedAt);
}

function isPublishedEditorPage(value: unknown, expected?: ExpectedPublishedPage): value is EditorPage {
  if (!isEditorPage(value)) return false;
  const page = value;
  return (!expected || page.id === expected.pageId)
    && (!expected || page.siteId === expected.siteId)
    && page.status === "published";
}

/** Parse the publish endpoint without ever reflecting a raw server/provider error. */
export async function readPagePublishResponse(
  res: Response,
  expected?: ExpectedPublishedPage,
): Promise<EditorPage> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = safePagePublishCode(
      data && typeof data === "object" && "code" in data
        ? (data as { code?: unknown }).code
        : undefined,
    );
    throw new EditorPagePublishError(code, res.status);
  }
  const payload = data && typeof data === "object"
    ? data as { ok?: unknown; page?: unknown }
    : null;
  const page = payload && payload.ok === true
    ? payload.page
    : undefined;
  if (!isPublishedEditorPage(page, expected)) {
    throw new EditorPagePublishError("page_publish_invalid_response", res.status);
  }
  return page;
}

/** Parse the list endpoint fail-closed so an unreadable tree is never cached as empty. */
export async function readPageListResponse(res: Response, expectedSiteId?: string): Promise<EditorPage[]> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new EditorPageListError("page_list_invalid_response", res.status);
  }
  if (!res.ok) throw new EditorPageListError("page_list_failed", res.status);
  const payload = data && typeof data === "object"
    ? data as { ok?: unknown; pages?: unknown }
    : null;
  if (
    payload?.ok !== true
    || !Array.isArray(payload.pages)
    || !payload.pages.every(page => isEditorPage(page) && (!expectedSiteId || page.siteId === expectedSiteId))
  ) {
    throw new EditorPageListError("page_list_invalid_response", res.status);
  }
  return payload.pages;
}

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
  cache[siteId] = await readPageListResponse(res, siteId);
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
  isHomepage?: boolean;
  variantId?: string;
  themeId?: string;
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

export async function publishPage(siteId: string, pageId: string): Promise<EditorPage> {
  const res = await fetch(`${BASE}/pages/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, pageId }),
  });
  const page = await readPagePublishResponse(res, { siteId, pageId });
  bust(siteId);
  return page;
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
