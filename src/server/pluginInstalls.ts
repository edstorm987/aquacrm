import "server-only";
// Per-tenant plugin install state.
//
// The unit of "tenant" for an install is a scope: agency-wide
// (`{ agencyId }`) or client-scoped (`{ agencyId, clientId }`). Most
// plugins are client-scoped (E-commerce installed for Felicia, not
// "Milesy Media"), but some (Fulfillment, billing, agency-wide CRM)
// install once at the agency level and apply across all clients.
//
// A composite id keeps records globally unique:
//
//     installId = `${agencyId}|${clientId ?? "_agency"}|${pluginId}`
//
// The plugin runtime in `src/plugins/_runtime.ts` is the only writer.
// Routes / pages read via `listInstalledFor()` to assemble the chrome.

import { getState, mutate } from "./storage";
import type { PluginInstall, PluginInstallScope } from "./types";

export type { PluginInstallScope };

const AGENCY_SCOPE_TOKEN = "_agency";

export function makeInstallId(scope: PluginInstallScope, pluginId: string): string {
  return `${scope.agencyId}|${scope.clientId ?? AGENCY_SCOPE_TOKEN}|${pluginId}`;
}

export function getInstall(scope: PluginInstallScope, pluginId: string): PluginInstall | null {
  return getState().pluginInstalls[makeInstallId(scope, pluginId)] ?? null;
}

export function getInstallById(id: string): PluginInstall | null {
  return getState().pluginInstalls[id] ?? null;
}

// List every install record that should appear when rendering the chrome
// for a given scope. Algorithm: include the client-scoped installs for
// this client, plus all agency-scoped installs for the same agency. So
// the sidebar at `/portal/clients/<x>` shows agency-wide tools too.
export function listInstalledFor(scope: PluginInstallScope): PluginInstall[] {
  const all = Object.values(getState().pluginInstalls);
  return all.filter(install => {
    if (install.agencyId !== scope.agencyId) return false;
    if (scope.clientId === undefined) {
      // Agency-only view: only agency-scoped installs.
      return install.clientId === undefined;
    }
    // Client view: agency-scoped + this-client-scoped.
    return install.clientId === undefined || install.clientId === scope.clientId;
  });
}

// Strict variant for pages that should NOT show agency-wide installs
// alongside the client-scoped ones (rare, but useful for "manage this
// client's plugins" UIs).
export function listInstalledForClientOnly(scope: PluginInstallScope): PluginInstall[] {
  if (scope.clientId === undefined) return [];
  return Object.values(getState().pluginInstalls)
    .filter(p => p.agencyId === scope.agencyId && p.clientId === scope.clientId);
}

export function listInstalledForAgencyOnly(agencyId: string): PluginInstall[] {
  return Object.values(getState().pluginInstalls)
    .filter(p => p.agencyId === agencyId && p.clientId === undefined);
}

// ─── Mutating writes — used by the plugin runtime ─────────────────────────

export interface UpsertPluginInstallInput {
  pluginId: string;
  scope: PluginInstallScope;
  enabled: boolean;
  config: Record<string, unknown>;
  features: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
  installedBy?: string;
}

export function upsertInstall(input: UpsertPluginInstallInput): PluginInstall {
  const id = makeInstallId(input.scope, input.pluginId);
  let saved!: PluginInstall;
  mutate(state => {
    const existing = state.pluginInstalls[id];
    saved = {
      id,
      pluginId: input.pluginId,
      agencyId: input.scope.agencyId,
      clientId: input.scope.clientId,
      enabled: input.enabled,
      config: input.config,
      features: input.features,
      setupAnswers: input.setupAnswers,
      installedAt: existing?.installedAt ?? Date.now(),
      installedBy: input.installedBy ?? existing?.installedBy,
    };
    state.pluginInstalls[id] = saved;
  });
  return saved;
}

export function patchInstall(
  scope: PluginInstallScope,
  pluginId: string,
  patch: Partial<Pick<PluginInstall, "enabled" | "config" | "features" | "setupAnswers">>,
): PluginInstall | null {
  const id = makeInstallId(scope, pluginId);
  let saved: PluginInstall | null = null;
  mutate(state => {
    const existing = state.pluginInstalls[id];
    if (!existing) return;
    saved = {
      ...existing,
      enabled: patch.enabled ?? existing.enabled,
      config: patch.config ? { ...existing.config, ...patch.config } : existing.config,
      features: patch.features ? { ...existing.features, ...patch.features } : existing.features,
      setupAnswers: patch.setupAnswers ?? existing.setupAnswers,
    };
    state.pluginInstalls[id] = saved;
  });
  return saved;
}

export function deleteInstall(scope: PluginInstallScope, pluginId: string): boolean {
  const id = makeInstallId(scope, pluginId);
  let removed = false;
  mutate(state => {
    if (state.pluginInstalls[id]) {
      delete state.pluginInstalls[id];
      delete state.pluginData[id];
      removed = true;
    }
  });
  return removed;
}
