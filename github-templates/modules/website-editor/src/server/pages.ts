// Page CRUD + portal-variant helpers. Adapted from
// `02/src/portal/server/pages.ts` (190 lines) — lifts the listVariants /
// getActive / setActive helpers and re-scopes from `siteId` only to
// `(agencyId, clientId, siteId)` triple per 04's tenancy model.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PortalRole } from "../lib/portalRole";
import { pageId as makePageId, slugify } from "../lib/ids";
import { storageKeys } from "./storage-keys";
import type {
  CreatePageInput,
  EditorPage,
  EditorPageStatus,
  UpdatePagePatch,
} from "../types/editorPage";

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
  return pages.filter((p): p is EditorPage => Boolean(p));
}

export async function getPage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<EditorPage | null> {
  const page = await storage.get<EditorPage>(storageKeys.page(agencyId, clientId, siteId, id));
  return page ?? null;
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
    blocks: input.blocks ?? [],
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
  const next: EditorPage = { ...page, ...patch, updatedAt: Date.now() };
  await storage.set(storageKeys.page(agencyId, clientId, siteId, id), next);
  return next;
}

export async function publishPage(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<EditorPage | null> {
  const page = await getPage(storage, agencyId, clientId, siteId, id);
  if (!page) return null;
  const next: EditorPage = {
    ...page,
    status: "published",
    blocks: page.draftBlocks ?? page.blocks,
    draftBlocks: undefined,
    publishedAt: Date.now(),
    updatedAt: Date.now(),
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
  const next: EditorPage = { ...page, draftBlocks: undefined, updatedAt: Date.now() };
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
