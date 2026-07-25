// R013 — Per-client embed allow-list registry.
//
// Each client picks which origins may embed them in an iframe. The
// foundation middleware reads this list and emits the matching
// `Content-Security-Policy: frame-ancestors …` header on every
// `/embed/[clientSlug]/[variant]` response (Q-FOLLOWUP for T1).
//
// Storage: `t/<agencyId>/<clientId>/website-editor/embed-allow`.

import type { PluginStorage } from "../lib/aquaPluginTypes";

export interface EmbedAllowList {
  origins: string[];
  updatedBy: string;
  updatedAt: string;
}

const KEY = (agencyId: string, clientId: string) =>
  `t/${agencyId}/${clientId}/website-editor/embed-allow`;

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{2,5})?$/i;

export function isValidOrigin(s: string): boolean {
  if (typeof s !== "string") return false;
  return ORIGIN_RE.test(s.trim());
}

export async function getEmbedAllowList(
  storage: PluginStorage,
  agencyId: string,
  clientId: string,
): Promise<EmbedAllowList | null> {
  return (await storage.get<EmbedAllowList>(KEY(agencyId, clientId))) ?? null;
}

export async function setEmbedAllowList(
  storage: PluginStorage,
  agencyId: string,
  clientId: string,
  origins: string[],
  updatedBy: string,
): Promise<EmbedAllowList> {
  // De-dupe + trim; reject invalid entries silently (callers get an
  // accurate roster back so they can flag mistakes in their UI).
  const cleaned = Array.from(new Set(
    origins.map(o => (o ?? "").trim()).filter(o => isValidOrigin(o)),
  ));
  const rec: EmbedAllowList = {
    origins: cleaned,
    updatedBy,
    updatedAt: new Date().toISOString(),
  };
  await storage.set(KEY(agencyId, clientId), rec);
  return rec;
}
