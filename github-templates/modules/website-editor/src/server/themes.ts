// Theme CRUD scoped per (agencyId, clientId, siteId). Adapted from
// `02/src/portal/server/themes.ts` (208 lines).

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import { themeId as makeThemeId } from "../lib/ids";
import { storageKeys } from "./storage-keys";
import type {
  CreateThemeInput,
  ThemeRecord,
  UpdateThemePatch,
} from "../types/theme";

export async function listThemes(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<ThemeRecord[]> {
  const ids = (await storage.get<string[]>(storageKeys.themeIndex(agencyId, clientId, siteId))) ?? [];
  const themes = await Promise.all(
    ids.map((id) => storage.get<ThemeRecord>(storageKeys.theme(agencyId, clientId, siteId, id))),
  );
  return themes.filter((t): t is ThemeRecord => Boolean(t));
}

export async function getTheme(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<ThemeRecord | null> {
  return (await storage.get<ThemeRecord>(storageKeys.theme(agencyId, clientId, siteId, id))) ?? null;
}

export async function getDefaultTheme(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<ThemeRecord | null> {
  const id = await storage.get<string>(storageKeys.defaultThemeId(agencyId, clientId, siteId));
  if (!id) return null;
  return getTheme(storage, agencyId, clientId, siteId, id);
}

export async function createTheme(
  storage: PluginStorage,
  input: CreateThemeInput,
): Promise<ThemeRecord> {
  const id = makeThemeId();
  const now = Date.now();
  const theme: ThemeRecord = {
    id,
    siteId: input.siteId,
    agencyId: input.agencyId,
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    tokens: input.tokens ?? {},
    isDefault: input.isDefault,
    createdAt: now,
    updatedAt: now,
  };
  await storage.set(storageKeys.theme(input.agencyId, input.clientId, input.siteId, id), theme);

  const indexKey = storageKeys.themeIndex(input.agencyId, input.clientId, input.siteId);
  const ids = (await storage.get<string[]>(indexKey)) ?? [];
  if (!ids.includes(id)) {
    ids.push(id);
    await storage.set(indexKey, ids);
  }
  if (input.isDefault) {
    await storage.set(storageKeys.defaultThemeId(input.agencyId, input.clientId, input.siteId), id);
  }
  return theme;
}

export async function updateTheme(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
  patch: UpdateThemePatch,
): Promise<ThemeRecord | null> {
  const theme = await getTheme(storage, agencyId, clientId, siteId, id);
  if (!theme) return null;
  const next: ThemeRecord = {
    ...theme,
    ...patch,
    tokens: { ...theme.tokens, ...(patch.tokens ?? {}) },
    updatedAt: Date.now(),
  };
  await storage.set(storageKeys.theme(agencyId, clientId, siteId, id), next);
  if (patch.isDefault) {
    await storage.set(storageKeys.defaultThemeId(agencyId, clientId, siteId), id);
  }
  return next;
}

export async function setDefaultTheme(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<boolean> {
  const theme = await getTheme(storage, agencyId, clientId, siteId, id);
  if (!theme) return false;
  await storage.set(storageKeys.defaultThemeId(agencyId, clientId, siteId), id);
  return true;
}

export async function deleteTheme(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  id: string,
): Promise<boolean> {
  const theme = await getTheme(storage, agencyId, clientId, siteId, id);
  if (!theme) return false;
  await storage.del(storageKeys.theme(agencyId, clientId, siteId, id));

  const indexKey = storageKeys.themeIndex(agencyId, clientId, siteId);
  const ids = (await storage.get<string[]>(indexKey)) ?? [];
  await storage.set(
    indexKey,
    ids.filter((existing) => existing !== id),
  );

  const defaultKey = storageKeys.defaultThemeId(agencyId, clientId, siteId);
  if ((await storage.get<string>(defaultKey)) === id) {
    await storage.del(defaultKey);
  }
  return true;
}
