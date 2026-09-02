import "server-only";

// Narrow legacy repair for the shared agency layout.
//
// New agencies receive this core plugin in bootstrapAgency(). Older/imported
// state can still lack the install, so the layout retains its self-heal without
// importing the executable all-plugin runtime/registry. These defaults and the
// lifecycle behavior mirror the leads-pipeline manifest exactly; the regression
// test compares them with the manifest so drift is loud.

import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { _containerFromCtx } from "@/built-ins/modules/leads-pipeline/src/server/foundationAdapter";
import { emitDurable } from "@/server/outbox";
import {
  deleteInstall,
  getInstall,
  patchInstall,
  upsertInstall,
} from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import type { PluginInstall } from "@/server/types";

export const LEADS_PIPELINE_PLUGIN_ID = "leads-pipeline";
export const LEADS_PIPELINE_DEFAULT_CONFIG = {
  // Mirrors the manifest exactly (pinned by smoke-shared-graph-split): a blank
  // default source keeps the CSV import's own csv:<filename> provenance, and
  // the unhonourable from-name declaration is gone.
  defaultLeadSource: "",
  newColumnLabel: "New",
} as const;
export const LEADS_PIPELINE_DEFAULT_FEATURES = {
  "csv-import": true,
  campaigns: true,
  "funnel-subscriber": true,
} as const;

export type EnsureLeadsPipelineInstallResult =
  | { ok: true; install: PluginInstall; changed: "installed" | "enabled" | "none" }
  | { ok: false; error: string };

export function ensureLeadsPipelineInstall(
  agencyId: string,
  installedBy: string,
): EnsureLeadsPipelineInstallResult {
  const scope = { agencyId };
  const existing = getInstall(scope, LEADS_PIPELINE_PLUGIN_ID);
  if (existing?.enabled) return { ok: true, install: existing, changed: "none" };

  if (existing) {
    const enabled = patchInstall(scope, LEADS_PIPELINE_PLUGIN_ID, { enabled: true });
    if (!enabled) return { ok: false, error: "patch failed" };
    emitDurable({ name: "plugin.enabled", agencyId: scope.agencyId, source: "lib/server/plugins/ensureLeadsPipelineInstall", payload: { pluginId: LEADS_PIPELINE_PLUGIN_ID, installId: enabled.id } });
    return { ok: true, install: enabled, changed: "enabled" };
  }

  const install = upsertInstall({
    pluginId: LEADS_PIPELINE_PLUGIN_ID,
    scope,
    enabled: true,
    config: { ...LEADS_PIPELINE_DEFAULT_CONFIG },
    features: { ...LEADS_PIPELINE_DEFAULT_FEATURES },
    installedBy,
  });

  try {
    ensureLeadsPipelineFoundationRegistered();
    _containerFromCtx({
      agencyId,
      actor: installedBy,
      storage: makePluginStorage(install.id),
    });
  } catch (error) {
    deleteInstall(scope, LEADS_PIPELINE_PLUGIN_ID);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  emitDurable({ name: "plugin.installed", agencyId: scope.agencyId, source: "lib/server/plugins/ensureLeadsPipelineInstall", payload: { pluginId: LEADS_PIPELINE_PLUGIN_ID, installId: install.id } });
  return { ok: true, install, changed: "installed" };
}
