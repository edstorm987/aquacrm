// Embed registry — chatbots / calendars / forms etc that operators can
// drop into pages. Adapted from `02/src/portal/server/embeds.ts`.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import { storageKeys } from "./storage-keys";

export interface Embed {
  id: string;
  kind: "iframe" | "script" | "html";
  name: string;
  src?: string;
  html?: string;
  publicMount?: boolean;
}

export interface EmbedsState {
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;
  embeds: Embed[];
}

export async function getEmbeds(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<Embed[]> {
  const state = await storage.get<EmbedsState>(storageKeys.embeds(agencyId, clientId, siteId));
  return state?.embeds ?? [];
}

export async function setEmbeds(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  embeds: Embed[],
): Promise<void> {
  const next: EmbedsState = { siteId, agencyId, clientId, embeds };
  await storage.set(storageKeys.embeds(agencyId, clientId, siteId), next);
}

export async function getEmbed(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
  embedId: string,
): Promise<Embed | null> {
  const list = await getEmbeds(storage, agencyId, clientId, siteId);
  return list.find((e) => e.id === embedId) ?? null;
}

export async function getPublicEmbeds(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<Embed[]> {
  const list = await getEmbeds(storage, agencyId, clientId, siteId);
  return list.filter((e) => e.publicMount);
}
