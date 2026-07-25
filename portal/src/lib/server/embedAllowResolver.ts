// T1 R16 — middleware-side embed allow-list resolver.
//
// Reads foundation client state + the website-editor PluginStorage's
// `embed-allow` record for the resolved client and returns the list
// of origins permitted to iframe `/embed/<slug>/<variant>`. Empty
// list (or unknown slug) → frame-ancestors: 'none' (default deny).

import "server-only";
import { ensureHydrated } from "@/server/storage";
import { listAgencies, listClients } from "@/server/tenants";
import { getInstall } from "@/server/pluginInstalls";
import { makeCtx } from "@/built-ins/runtime/_runtime";
import {
  getEmbedAllowList,
} from "../../../src/built-ins/modules/website-editor/src/server/embedAllow";

export interface EmbedAllowResult {
  found: boolean;
  origins: readonly string[];
  agencyId?: string;
  clientId?: string;
}

export async function resolveEmbedAllowList(slug: string): Promise<EmbedAllowResult> {
  if (!slug) return { found: false, origins: [] };
  await ensureHydrated();
  // Slug is unique per-agency in foundation today; for the embed URL
  // we accept the first match across agencies (Q-ASSUMED in chapter).
  for (const agency of listAgencies()) {
    const client = listClients(agency.id).find(c => c.slug === slug);
    if (!client) continue;
    const install = getInstall({ agencyId: agency.id, clientId: client.id }, "website-editor");
    if (!install) {
      return { found: true, origins: [], agencyId: agency.id, clientId: client.id };
    }
    const ctx = makeCtx(install);
    const allow = await getEmbedAllowList(ctx.storage, agency.id, client.id);
    return {
      found: true,
      origins: allow?.origins ?? [],
      agencyId: agency.id,
      clientId: client.id,
    };
  }
  return { found: false, origins: [] };
}

// CSP `frame-ancestors` source-list from a resolved origin set.
// Empty → 'none' (default deny). Returns the value alone, no header
// name (caller does the header.set).
export function frameAncestorsValue(origins: readonly string[]): string {
  if (origins.length === 0) return "'none'";
  return origins.join(" ");
}
