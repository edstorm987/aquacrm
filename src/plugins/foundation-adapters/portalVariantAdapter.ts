import "server-only";
// PortalVariantPort — bridges T2's fulfillment plugin to T3's
// website-editor plugin via the foundation.
//
// T3 ships `applyStarterVariant({input}, storage)` from
// `@aqua/plugin-website-editor/server`. The function expects a
// `PluginStorage` scoped to the website-editor plugin's install — not
// to fulfillment's install — because variant pages live in T3's
// storage namespace.
//
// This adapter:
//   1. Looks up the website-editor install for the (agencyId, clientId)
//      scope. T3's plugin is client-scoped, so it must be installed for
//      this client (typically via the phase preset).
//   2. Builds a PluginStorage namespaced to that install id.
//   3. Calls T3's `applyStarterVariant` with the bound storage.
//   4. Returns the result with full {ok, variantId, pageId, siteId}.
//
// Soft-fail: when website-editor isn't installed for the client, returns
// `{ ok: false, error: "website-editor not installed for client" }` so
// the phase transition logs the failure but doesn't crash. The fulfillment
// plugin's `TransitionService` already treats variant errors as non-fatal.

import type { PortalVariantPort } from "@/plugins/_types";
import { logActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { applyStarterVariant as t3ApplyStarterVariant } from "@aqua/plugin-website-editor/server";
import type { PluginStorage as T3PluginStorage } from "@aqua/plugin-website-editor/types";

const WEBSITE_EDITOR_PLUGIN_ID = "website-editor";

export const portalVariantAdapter: PortalVariantPort = {
  async applyStarterVariant({ agencyId, clientId, role, variantId, actor }) {
    const install = getInstall({ agencyId, clientId }, WEBSITE_EDITOR_PLUGIN_ID);
    if (!install || !install.enabled) {
      logActivity({
        agencyId,
        clientId,
        actorUserId: actor,
        category: "system",
        action: "variant.apply.skipped",
        message: `Starter variant '${variantId}' skipped — @aqua/plugin-website-editor not installed for client.`,
        metadata: { variantId, role },
      });
      return { ok: false, error: "website-editor not installed for client" };
    }

    const storage = makePluginStorage(install.id) as T3PluginStorage;
    // T1 R15 — foundation `PortalRole` is wider than T3's published
    // type today (4 → 8 roles). Cast at the boundary; if `role` is one
    // of the new entries (`customer`/`member`/`start-here`/`other`)
    // the plugin will return `ok:false: unknown variantId` since no
    // starter tree is registered for it yet — safe failure mode.
    const result = await t3ApplyStarterVariant(
      { agencyId, clientId, role: role as never, variantId, actor },
      storage,
    );

    logActivity({
      agencyId,
      clientId,
      actorUserId: actor,
      category: "system",
      action: result.ok ? "variant.applied" : "variant.apply.failed",
      message: result.ok
        ? `Starter variant '${variantId}' applied (page ${result.pageId} on site ${result.siteId}).`
        : `Starter variant '${variantId}' failed: ${result.error}`,
      metadata: { variantId, role, ...(result.ok ? { pageId: result.pageId, siteId: result.siteId } : { error: result.error }) },
    });

    return result;
  },
};
