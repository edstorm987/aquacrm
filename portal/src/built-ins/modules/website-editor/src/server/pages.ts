// Page CRUD + portal-variant helpers. Adapted from
// `02/src/portal/server/pages.ts` (190 lines) — lifts the listVariants /
// getActive / setActive helpers and re-scopes from `siteId` only to
// `(agencyId, clientId, siteId)` triple per 04's tenancy model.

import type { PluginStorage, PublicMediaPort } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PortalRole } from "../lib/portalRole";
import { pageId as makePageId, slugify } from "../lib/ids";
import { storageKeys } from "./storage-keys";
import { promoteBlockTreeMedia } from "./publicMediaPromotion";
import { stabiliseCountdownDeadlines } from "./../lib/countdownDeadline";
import { getDefaultTheme, getTheme } from "./themes";
import {
  capturePublishedPage,
  migratePublishedPageSnapshot,
  publishedPageSnapshotNeedsMigration,
  resolvePublishedPage,
  restorePublishedPage,
  touchesPublishedPage,
} from "../lib/pagePublication";
import type {
  CreatePageInput,
  EditorPage,
  EditorPageStatus,
  UpdatePagePatch,
} from "../types/editorPage";

const UPDATE_PAGE_FIELDS = [
  "title", "slug", "description", "blocks", "draftBlocks", "themeId",
  "customCSS", "customCss", "customHead", "customFoot", "headInjection",
  "layoutOverrides", "portalRole", "isActivePortal", "isHomepage", "seo",
  "privacy", "passwordHash", "redirectSourceSlugs", "locales",
] as const satisfies readonly (keyof UpdatePagePatch)[];

function sanitiseUpdatePagePatch(patch: UpdatePagePatch): UpdatePagePatch {
  const source = patch as unknown as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const field of UPDATE_PAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) safe[field] = source[field];
  }
  return safe as UpdatePagePatch;
}

async function readPageIndex(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<string[]> {
  return (await storage.get<string[]>(storageKeys.pageIndex(agencyId, clientId, siteId))) ?? [];
}

async function writePageIndex(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  ids: string[],
): Promise<void> {
  await storage.set(storageKeys.pageIndex(agencyId, clientId, siteId), ids);
}

export async function listPages(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<EditorPage[]> {
  const ids = await readPageIndex(storage, agencyId, clientId, siteId);
  const pages = await Promise.all(
    ids.map((id) => storage.get<EditorPage>(storageKeys.page(agencyId, clientId, siteId, id))),
  );
  return pages.filter((p): p is EditorPage => Boolean(p)).map(stabiliseStoredPageCountdowns);
}

export async function getPage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<EditorPage | null> {
  const page = await storage.get<EditorPage>(storageKeys.page(agencyId, clientId, siteId, id));
  return page ? stabiliseStoredPageCountdowns(page) : null;
}

export async function getPageBySlug(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  slug: string,
): Promise<EditorPage | null> {
  const pages = await listPages(storage, agencyId, clientId, siteId);
  return pages.find((p) => p.slug === slug) ?? null;
}

/** Public lookup that keeps an unpublished slug edit off the live route. */
export async function getPublishedPageBySlug(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  slug: string,
): Promise<EditorPage | null> {
  const pages = await listPages(storage, agencyId, clientId, siteId);
  const page = pages.find(candidate => (
    candidate.status === "published"
    && resolvePublishedPage(candidate).slug === slug
  ));
  return page ? resolvePublishedPage(page) : null;
}

export async function createPage(
  storage: PluginStorage,
  input: CreatePageInput,
): Promise<EditorPage> {
  const id = makePageId();
  const now = Date.now();
  const status: EditorPageStatus = "draft";
  const page: EditorPage = {
    id,
    siteId: input.siteId,
    agencyId: input.agencyId,
    clientId: input.clientId,
    slug: input.slug ?? slugify(input.title),
    title: input.title,
    description: input.description,
    status,
    isHomepage: input.isHomepage,
    portalRole: input.portalRole,
    isActivePortal: input.isActivePortal,
    variantId: input.variantId,
    blocks: stabiliseCountdownDeadlines(input.blocks ?? [], now),
    themeId: input.themeId,
    createdAt: now,
    updatedAt: now,
  };
  await storage.set(storageKeys.page(input.agencyId, input.clientId, input.siteId, id), page);

  const ids = await readPageIndex(storage, input.agencyId, input.clientId, input.siteId);
  if (!ids.includes(id)) {
    ids.push(id);
    await writePageIndex(storage, input.agencyId, input.clientId, input.siteId, ids);
  }

  return page;
}

export async function updatePage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
  patch: UpdatePagePatch,
): Promise<EditorPage | null> {
  const page = await getPage(storage, agencyId, clientId, siteId, id);
  if (!page) return null;
  const now = Date.now();
  const safePatch = sanitiseUpdatePagePatch(patch);
  const touchesPublishedBlocks = Object.prototype.hasOwnProperty.call(safePatch, "blocks");
  const needsLegacyPageSnapshot = (
    page.status === "published"
    && (touchesPublishedBlocks || touchesPublishedPage(safePatch))
    && publishedPageSnapshotNeedsMigration(page)
  );
  const legacyPublishedTheme = needsLegacyPageSnapshot
    ? (page.themeId
      ? await getTheme(storage, agencyId, clientId, siteId, page.themeId)
      : await getDefaultTheme(storage, agencyId, clientId, siteId))
    : null;
  // Legacy published rows pre-date `publishedBlocks` and used `blocks` as
  // both the editor tree and the live snapshot. Preserve that live tree before
  // the first post-migration block edit so an operator edit cannot leak into
  // the public storefront.
  const existingPublishedBlocks = page.publishedBlocks
    ?? (page.status === "published" && touchesPublishedBlocks
      ? page.blocks
      : undefined);
  const existingPublishedPage = needsLegacyPageSnapshot
    ? migratePublishedPageSnapshot(page, { theme: legacyPublishedTheme })
    : page.publishedPage;
  const next: EditorPage = {
    ...page,
    ...safePatch,
    blocks: safePatch.blocks ? stabiliseCountdownDeadlines(safePatch.blocks, now) : page.blocks,
    draftBlocks: safePatch.draftBlocks ? stabiliseCountdownDeadlines(safePatch.draftBlocks, now) : safePatch.draftBlocks === undefined ? page.draftBlocks : undefined,
    // Published state is promoted only by publishPage, never by a free-shape
    // editor PATCH request.
    publishedBlocks: existingPublishedBlocks,
    // This value is server-owned. Explicitly assigning it after `...patch`
    // also prevents a free-shape API payload from forging a live snapshot.
    publishedPage: existingPublishedPage,
    updatedAt: now,
  };
  await storage.set(storageKeys.page(agencyId, clientId, siteId, id), next);
  return next;
}

function stabiliseStoredPageCountdowns(page: EditorPage): EditorPage {
  const publishedAnchor = page.publishedAt ?? page.updatedAt ?? page.createdAt;
  const draftAnchor = page.updatedAt ?? page.createdAt;
  const blocks = stabiliseCountdownDeadlines(page.blocks, page.status === "published" ? publishedAnchor : draftAnchor);
  const draftBlocks = page.draftBlocks ? stabiliseCountdownDeadlines(page.draftBlocks, draftAnchor) : undefined;
  const publishedBlocks = page.publishedBlocks ? stabiliseCountdownDeadlines(page.publishedBlocks, publishedAnchor) : undefined;
  if (blocks === page.blocks && draftBlocks === page.draftBlocks && publishedBlocks === page.publishedBlocks) return page;
  return { ...page, blocks, draftBlocks, publishedBlocks };
}

export async function publishPage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
  opts?: { publicMedia?: PublicMediaPort },
): Promise<EditorPage | null> {
  const page = await getPage(storage, agencyId, clientId, siteId, id);
  if (!page) return null;
  const now = Date.now();
  const publishedTheme = page.themeId
    ? await getTheme(storage, agencyId, clientId, siteId, page.themeId)
    : await getDefaultTheme(storage, agencyId, clientId, siteId);
  let blocks = page.draftBlocks ?? page.blocks;
  blocks = stabiliseCountdownDeadlines(blocks, now);
  // Auto-public on publish: push inline data-URL media to the public CDN
  // bucket and rewrite the published blocks to the durable public URLs. Only
  // runs when the foundation wired the port; otherwise blocks publish as-is.
  const port = opts?.publicMedia;
  if (port && Array.isArray(blocks)) {
    const { blocks: promoted } = await promoteBlockTreeMedia(blocks, dataUrl =>
      port.store({ agencyId, clientId, siteId, dataUrl }).then(r => r.publicUrl));
    blocks = promoted;
  }
  const next: EditorPage = {
    ...page,
    status: "published",
    blocks,
    draftBlocks: undefined,
    publishedBlocks: blocks,
    publishedPage: capturePublishedPage(page, { theme: publishedTheme }),
    publishedAt: now,
    updatedAt: now,
  };
  await storage.set(storageKeys.page(agencyId, clientId, siteId, id), next);
  return next;
}

export async function revertPage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<EditorPage | null> {
  const page = await getPage(storage, agencyId, clientId, siteId, id);
  if (!page) return null;
  const publishedBlocks = page.publishedBlocks
    ?? (page.status === "published" ? page.blocks : undefined);
  const restored = restorePublishedPage(page);
  const next: EditorPage = {
    ...restored,
    blocks: publishedBlocks ?? restored.blocks,
    draftBlocks: undefined,
    updatedAt: Date.now(),
  };
  await storage.set(storageKeys.page(agencyId, clientId, siteId, id), next);
  return next;
}

export async function deletePage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<boolean> {
  const page = await getPage(storage, agencyId, clientId, siteId, id);
  if (!page) return false;
  await storage.del(storageKeys.page(agencyId, clientId, siteId, id));

  const ids = await readPageIndex(storage, agencyId, clientId, siteId);
  await writePageIndex(
    storage,
    agencyId,
    clientId,
    siteId,
    ids.filter((existing) => existing !== id),
  );

  // If the deleted page was the active portal variant, clear the pointer.
  if (page.portalRole && page.isActivePortal) {
    await storage.del(storageKeys.activeVariant(agencyId, clientId, siteId, page.portalRole));
  }
  return true;
}

// ─── Portal-variant helpers (singleton-enforced) ──────────────────────────

export async function listVariantsForPortal(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  role: PortalRole,
): Promise<EditorPage[]> {
  const pages = await listPages(storage, agencyId, clientId, siteId);
  return pages
    .filter((p) => p.portalRole === role)
    .sort((a, b) => Number(Boolean(b.isActivePortal)) - Number(Boolean(a.isActivePortal)));
}

export async function getActivePortalVariant(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  role: PortalRole,
): Promise<EditorPage | null> {
  const activeId = await storage.get<string>(storageKeys.activeVariant(agencyId, clientId, siteId, role));
  if (!activeId) return null;
  return getPage(storage, agencyId, clientId, siteId, activeId);
}

export async function setActivePortalVariant(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  role: PortalRole,
  pageId: string | null,
): Promise<boolean> {
  // Atomically clear isActivePortal on every variant of (siteId, role)
  // before flagging the chosen one. Singleton enforcement happens here.
  const variants = await listVariantsForPortal(storage, agencyId, clientId, siteId, role);
  for (const v of variants) {
    if (v.isActivePortal) {
      const updated: EditorPage = { ...v, isActivePortal: false, updatedAt: Date.now() };
      await storage.set(storageKeys.page(agencyId, clientId, siteId, v.id), updated);
    }
  }
  if (pageId === null) {
    await storage.del(storageKeys.activeVariant(agencyId, clientId, siteId, role));
    return true;
  }
  const target = await getPage(storage, agencyId, clientId, siteId, pageId);
  if (!target || target.portalRole !== role) return false;
  const next: EditorPage = { ...target, isActivePortal: true, updatedAt: Date.now() };
  await storage.set(storageKeys.page(agencyId, clientId, siteId, pageId), next);
  await storage.set(storageKeys.activeVariant(agencyId, clientId, siteId, role), pageId);
  return true;
}
