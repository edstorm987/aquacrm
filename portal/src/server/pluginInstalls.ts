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

// Every install belonging to an agency — its own plus every one of its
// clients'. This is the set the plugin health sweep asks and the set Radar's
// `systems:module-health` counts over, so the two cannot disagree about which
// modules were supposed to answer.
export function listInstallsForAgency(agencyId: string): PluginInstall[] {
  return Object.values(getState().pluginInstalls).filter(p => p.agencyId === agencyId);
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

// ─── Health — written by the host's sweep, never by a module ──────────────
//
// `health` / `healthCheckedAt` are EVIDENCE that the host ran the module's own
// `healthcheck` hook and recorded what it said. They are deliberately absent
// from `PluginInstallPatch` (the module-facing patch shape in
// `built-ins/runtime/_types.ts`) and from `patchInstall` above: a module able
// to write its own health could mark itself green while broken, which is the
// one thing this field must never be able to say.
//
// `upsertInstall` does not carry these forward, and that is correct — a
// re-install has not been health-checked, and reading it as "never asked" is
// honest where inheriting the old verdict would not be.

export interface PluginHealthRecord {
  /**
   * The module's own verdict. ABSENT when the module ships no `healthcheck`:
   * the host asked and there was nothing to answer with. That is a different
   * fact from "never asked" (no `healthCheckedAt` at all), and neither of them
   * is a pass.
   */
  health?: { ok: boolean; message?: string };
  healthCheckedAt: number;
}

export function recordInstallHealth(
  scope: PluginInstallScope,
  pluginId: string,
  record: PluginHealthRecord,
): PluginInstall | null {
  const id = makeInstallId(scope, pluginId);
  let saved: PluginInstall | null = null;
  mutate(state => {
    const existing = state.pluginInstalls[id];
    if (!existing) return;
    saved = { ...existing, health: record.health, healthCheckedAt: record.healthCheckedAt };
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
