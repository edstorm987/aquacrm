// Embed-specific theme CSS. When a portal is embedded as an iframe in
// another host page, this CSS makes the embed adopt the host's brand
// without leaking the rest of the page. Adapted from
// `02/src/portal/server/embedTheme.ts`.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import { storageKeys } from "./storage-keys";

export interface EmbedThemeState {
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;
  css: string;
  updatedAt: number;
}

export async function getEmbedThemeCss(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<string> {
  const state = await storage.get<EmbedThemeState>(
    storageKeys.embedTheme(agencyId, clientId, siteId),
  );
  return state?.css ?? "";
}

export async function updateEmbedTheme(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  css: string,
): Promise<EmbedThemeState> {
  const next: EmbedThemeState = {
    siteId,
    agencyId,
    clientId,
    css,
    updatedAt: Date.now(),
  };
  await storage.set(storageKeys.embedTheme(agencyId, clientId, siteId), next);
  return next;
}
