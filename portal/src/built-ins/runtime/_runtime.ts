import "server-only";
// Plugin runtime — install / uninstall / enable / disable / configure /
// applyPreset / feature-gate. Adapted from `02/.../_runtime.ts` for
// 04's three-level tenancy: scope is `{ agencyId, clientId? }` instead
// of a single `orgId`, and install records live in `pluginInstalls.ts`
// (a flat keyed map) instead of an `org.plugins[]` array.
//
// Errors are returned as `{ ok: false, error }` rather than thrown so
// API layers can surface them to the operator without a 500.

import { getState, mutate } from "@/server/storage";
import {
  deleteInstall,
  getInstall,
  listInstalledFor,
  patchInstall,
  upsertInstall,
  type PluginInstallScope,
} from "@/server/pluginInstalls";
import { emit } from "@/server/eventBus";
import { getPlugin, listCorePlugins } from "./_registry";
import type {
  AquaPlugin, AquaPreset, PluginCtx, PluginStorage,
} from "./_types";
import { FOUNDATION_SERVICES } from "./foundation-adapters";
import type { PluginInstall } from "@/server/types";

// ─── Plugin storage namespacing ───────────────────────────────────────────
//
// Each install record gets its own slice of state under
// `state.pluginData[installId][key]`. Uninstall drops the whole slice.

function makeStorage(installId: string): PluginStorage {
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const data = (getState().pluginData[installId] ?? {}) as Record<string, unknown>;
      return data[key] as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      mutate(state => {
        if (!state.pluginData[installId]) state.pluginData[installId] = {};
        state.pluginData[installId][key] = value;
      });
    },
    async del(key: string): Promise<void> {
      mutate(state => {
        const slice = state.pluginData[installId];
        if (!slice) return;
        delete slice[key];
      });
    },
    async list(prefix?: string): Promise<string[]> {
      const data = (getState().pluginData[installId] ?? {}) as Record<string, unknown>;
      const keys = Object.keys(data);
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
}

// Build a `PluginCtx` for lifecycle hooks. The `actor` defaults to the
// install's `installedBy` (or empty string for system installs); page +
// API routes pass the live session userId via the catch-all wrappers.
export function makeCtx(install: PluginInstall, actor?: string): PluginCtx {
  return {
    agencyId: install.agencyId,
    clientId: install.clientId,
    install,
    storage: makeStorage(install.id),
    services: FOUNDATION_SERVICES,
    actor: actor ?? install.installedBy ?? "",
  };
}

// ─── Default-feature derivation ───────────────────────────────────────────

function defaultFeatures(plugin: AquaPlugin, overrides?: Record<string, boolean>): Record<string, boolean> {
  const base: Record<string, boolean> = {};
  for (const f of plugin.features) base[f.id] = f.default;
  return { ...base, ...overrides };
}

function defaultConfig(plugin: AquaPlugin, overrides?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const group of plugin.settings.groups) {
    for (const field of group.fields) {
      if (field.default !== undefined) base[field.id] = field.default;
    }
  }
  return { ...base, ...overrides };
}

// ─── Install ──────────────────────────────────────────────────────────────

export type InstallResult =
  | { ok: true; install: PluginInstall }
  | { ok: false; error: string };

export interface InstallOptions {
  scope: PluginInstallScope;
  installedBy?: string;
  setupAnswers?: Record<string, string>;
  featureOverrides?: Record<string, boolean>;
  configOverrides?: Record<string, unknown>;
}

export async function installPlugin(
  pluginId: string,
  options: InstallOptions,
): Promise<InstallResult> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return { ok: false, error: `Plugin "${pluginId}" not found.` };

  // Scope-policy enforcement (optional field; defaults to "either" so
  // pre-Round-2 manifests without an explicit policy install anywhere).
  const isClientScoped = options.scope.clientId !== undefined;
  const policy = plugin.scopePolicy ?? "either";
  if (policy === "client" && !isClientScoped) {
    return { ok: false, error: `Plugin "${pluginId}" must be installed under a client scope.` };
  }
  if (policy === "agency" && isClientScoped) {
    return { ok: false, error: `Plugin "${pluginId}" must be installed at the agency scope.` };
  }

  // Already-installed check at this exact scope.
  if (getInstall(options.scope, pluginId)) {
    return { ok: false, error: `Plugin "${pluginId}" already installed at this scope.` };
  }

  // Dependency check — every required plugin must already be installed
  // in the same scope (or, for client-scoped installs, in the parent
  // agency scope as a fallback).
  if (plugin.requires?.length) {
    const peers = listInstalledFor(options.scope).map(p => p.pluginId);
    const installedIds = new Set(peers);
    const missing = plugin.requires.filter(id => !installedIds.has(id));
    if (missing.length) {
      return { ok: false, error: `Missing dependencies: ${missing.join(", ")}.` };
    }
  }

  // Conflict check (within the same scope).
  if (plugin.conflicts?.length) {
    const peers = listInstalledFor(options.scope).map(p => p.pluginId);
    const installedIds = new Set(peers);
    const conflicting = plugin.conflicts.filter(id => installedIds.has(id));
    if (conflicting.length) {
      return { ok: false, error: `Conflicts with installed plugin(s): ${conflicting.join(", ")}.` };
    }
  }

  const install = upsertInstall({
    pluginId,
    scope: options.scope,
    enabled: true,
    config: defaultConfig(plugin, options.configOverrides),
    features: defaultFeatures(plugin, options.featureOverrides),
    setupAnswers: options.setupAnswers,
    installedBy: options.installedBy,
  });

  if (plugin.onInstall) {
    try {
      await plugin.onInstall(makeCtx(install), options.setupAnswers ?? {});
    } catch (err) {
      // Roll back: delete the install record so the tenant doesn't end
      // up with a half-installed plugin.
      deleteInstall(options.scope, pluginId);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  emit(options.scope, "plugin.installed", { pluginId, installId: install.id });
  return { ok: true, install };
}

// ─── Uninstall ────────────────────────────────────────────────────────────

export async function uninstallPlugin(
  scope: PluginInstallScope,
  pluginId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return { ok: false, error: `Plugin "${pluginId}" not found.` };
  if (plugin.core) return { ok: false, error: `Plugin "${pluginId}" is core and cannot be uninstalled.` };

  const install = getInstall(scope, pluginId);
  if (!install) return { ok: false, error: `Plugin "${pluginId}" is not installed at this scope.` };

  // Reverse-dependency check — refuse if another installed plugin in the
  // same scope requires this one.
  const peers = listInstalledFor(scope);
  const dependents = peers.filter(p => {
    const dep = getPlugin(p.pluginId);
    return dep?.requires?.includes(pluginId);
  });
  if (dependents.length) {
    const names = dependents.map(d => d.pluginId).join(", ");
    return { ok: false, error: `Other installed plugins depend on this: ${names}. Uninstall them first.` };
  }

  if (plugin.onUninstall) {
    try {
      await plugin.onUninstall(makeCtx(install));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  deleteInstall(scope, pluginId);
  emit(scope, "plugin.uninstalled", { pluginId, installId: install.id });
  return { ok: true };
}

// ─── Enable / disable ─────────────────────────────────────────────────────

export async function setPluginEnabled(
  scope: PluginInstallScope,
  pluginId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return { ok: false, error: `Plugin "${pluginId}" not found.` };
  const existing = getInstall(scope, pluginId);
  if (!existing) return { ok: false, error: `Plugin "${pluginId}" is not installed at this scope.` };

  if (existing.enabled === enabled) return { ok: true };

  const next = patchInstall(scope, pluginId, { enabled });
  if (!next) return { ok: false, error: "patch failed" };

  const hook = enabled ? plugin.onEnable : plugin.onDisable;
  if (hook) {
    try {
      await hook(makeCtx(next));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  emit(scope, enabled ? "plugin.enabled" : "plugin.disabled", { pluginId, installId: next.id });
  return { ok: true };
}

// ─── Configure ────────────────────────────────────────────────────────────

export interface ConfigurePatch {
  config?: Record<string, unknown>;
  features?: Record<string, boolean>;
}

export async function configurePlugin(
  scope: PluginInstallScope,
  pluginId: string,
  patch: ConfigurePatch,
): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return { ok: false, error: `Plugin "${pluginId}" not found.` };
  const existing = getInstall(scope, pluginId);
  if (!existing) return { ok: false, error: `Plugin "${pluginId}" is not installed at this scope.` };

  // Validate feature toggles obey their `requires` chain.
  if (patch.features) {
    const merged = { ...existing.features, ...patch.features };
    for (const feature of plugin.features) {
      if (!merged[feature.id]) continue;
      for (const dep of feature.requires ?? []) {
        if (!merged[dep]) {
          return { ok: false, error: `Feature "${feature.id}" requires "${dep}" to be enabled.` };
        }
      }
    }
  }

  const next = patchInstall(scope, pluginId, {
    config: patch.config,
    features: patch.features,
  });
  if (!next) return { ok: false, error: "patch failed" };

  if (plugin.onConfigure) {
    try {
      await plugin.onConfigure(makeCtx(next));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  emit(scope, "plugin.configured", { pluginId, installId: next.id });
  return { ok: true, install: next };
}

// ─── Feature gate (read-side) ─────────────────────────────────────────────

export function isFeatureEnabled(scope: PluginInstallScope, pluginId: string, featureId: string): boolean {
  const install = getInstall(scope, pluginId);
  if (!install || !install.enabled) return false;
  return install.features[featureId] === true;
}

export function isPluginInstalled(scope: PluginInstallScope, pluginId: string): boolean {
  const install = getInstall(scope, pluginId);
  return !!(install && install.enabled);
}

export { getInstall, getInstallById, listInstalledFor, listInstalledForClientOnly, listInstalledForAgencyOnly, makeInstallId } from "@/server/pluginInstalls";
export type { PluginInstallScope } from "@/server/pluginInstalls";

// ─── Auto-install core plugins ────────────────────────────────────────────

export async function installCorePluginsForScope(scope: PluginInstallScope, installedBy?: string): Promise<void> {
  for (const plugin of listCorePlugins()) {
    if (getInstall(scope, plugin.id)) continue;
    // Respect scope policy when auto-installing. Missing policy = "either".
    const policy = plugin.scopePolicy ?? "either";
    if (policy === "client" && scope.clientId === undefined) continue;
    if (policy === "agency" && scope.clientId !== undefined) continue;
    await installPlugin(plugin.id, { scope, installedBy: installedBy ?? "system" });
  }
}

// ─── Preset application ───────────────────────────────────────────────────

export async function applyPreset(
  preset: AquaPreset,
  scope: PluginInstallScope,
  installedBy?: string,
): Promise<{ ok: true; installed: string[] } | { ok: false; error: string; installed: string[] }> {
  const installed: string[] = [];
  for (const entry of preset.plugins) {
    const result = await installPlugin(entry.pluginId, {
      scope,
      installedBy,
      featureOverrides: entry.features,
      configOverrides: entry.config,
    });
    if (!result.ok) {
      // Roll back
      for (const id of [...installed].reverse()) {
        await uninstallPlugin(scope, id).catch(() => undefined);
      }
      return { ok: false, error: `Failed installing "${entry.pluginId}": ${result.error}`, installed: [] };
    }
    installed.push(entry.pluginId);
  }
  return { ok: true, installed };
}
