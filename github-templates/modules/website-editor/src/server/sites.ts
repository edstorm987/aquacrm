// Site CRUD scoped by (agencyId, clientId). Adapted from
// `02/src/lib/admin/sites.ts` + the implicit Site concept in 02's
// pages.ts.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import { siteId as makeSiteId, slugify } from "../lib/ids";
import { storageKeys } from "./storage-keys";
import type { CreateSiteInput, Site, UpdateSitePatch } from "../types/site";

async function readIndex(storage: PluginStorage, key: string): Promise<string[]> {
  return (await storage.get<string[]>(key)) ?? [];
}

async function writeIndex(storage: PluginStorage, key: string, ids: string[]): Promise<void> {
  await storage.set(key, ids);
}

export async function listSites(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
): Promise<Site[]> {
  const ids = await readIndex(storage, storageKeys.siteIndex(agencyId, clientId));
  const sites = await Promise.all(
    ids.map((id) => storage.get<Site>(storageKeys.site(agencyId, clientId, id))),
  );
  return sites.filter((s): s is Site => Boolean(s));
}

export async function getSite(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  id: string,
): Promise<Site | null> {
  const site = await storage.get<Site>(storageKeys.site(agencyId, clientId, id));
  return site ?? null;
}

export async function createSite(
  storage: PluginStorage,
  input: CreateSiteInput,
): Promise<Site> {
  const id = makeSiteId();
  const now = Date.now();
  const site: Site = {
    id,
    agencyId: input.agencyId,
    clientId: input.clientId,
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    defaultThemeId: input.defaultThemeId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await storage.set(storageKeys.site(input.agencyId, input.clientId, id), site);

  const indexKey = storageKeys.siteIndex(input.agencyId, input.clientId);
  const ids = await readIndex(storage, indexKey);
  if (!ids.includes(id)) {
    ids.push(id);
    await writeIndex(storage, indexKey, ids);
  }

  // First site for this client becomes the default.
  const defaultKey = storageKeys.defaultSiteId(input.agencyId, input.clientId);
  const existingDefault = await storage.get<string>(defaultKey);
  if (!existingDefault) await storage.set(defaultKey, id);

  return site;
}

export async function updateSite(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  id: string,
  patch: UpdateSitePatch,
): Promise<Site | null> {
  const site = await getSite(storage, agencyId, clientId, id);
  if (!site) return null;
  const next: Site = { ...site, ...patch, updatedAt: Date.now() };
  await storage.set(storageKeys.site(agencyId, clientId, id), next);
  return next;
}

export async function deleteSite(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  id: string,
): Promise<boolean> {
  const site = await getSite(storage, agencyId, clientId, id);
  if (!site) return false;
  await storage.del(storageKeys.site(agencyId, clientId, id));

  const indexKey = storageKeys.siteIndex(agencyId, clientId);
  const ids = await readIndex(storage, indexKey);
  await writeIndex(
    storage,
    indexKey,
    ids.filter((existing) => existing !== id),
  );

  const defaultKey = storageKeys.defaultSiteId(agencyId, clientId);
  if ((await storage.get<string>(defaultKey)) === id) {
    await storage.del(defaultKey);
  }
  return true;
}

// Helper used by `applyStarterVariant` and other server modules:
// resolve the canonical site for a client. Creates one named after the
// client slug if none exists.
export async function getOrCreateDefaultSite(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  fallbackName: string = clientId,
): Promise<Site> {
  const defaultKey = storageKeys.defaultSiteId(agencyId, clientId);
  const existing = await storage.get<string>(defaultKey);
  if (existing) {
    const site = await getSite(storage, agencyId, clientId, existing);
    if (site) return site;
  }
  return createSite(storage, { agencyId, clientId, name: fallbackName });
}
