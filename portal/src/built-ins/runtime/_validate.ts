// Plugin manifest validator. Lifted from `02/.../_validate.ts` with three
// adaptations:
//   1. New `category` value `"fulfillment"` accepted (T2's plugin).
//   2. Optional `scopePolicy` field validated when present (defaults to "either").
//   3. Round 2: `panelId` is `string` (not enum) — wider set, validator just warns.
//
// Runs at registration (registerPlugin) and once over the in-tree
// PLUGINS array on import. Rejects manifests malformed enough that the
// runtime, marketplace or sidebar would render in an undefined state.

import type { AquaPlugin, NavItem, PluginFeature, SettingsField, SettingsGroup } from "./_types";

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const VALID_STATUSES = new Set(["stable", "beta", "alpha"]);
// R6 widening — plugin authors ship `category` values that the
// foundation hadn't anticipated. Each new id matches a manifest
// already in flight (see chapter notes for who emits what):
//   • "growth"   → @aqua/plugin-client-crm
//   • "hr"       → @aqua/plugin-agency-hr
//   • "finance"  → @aqua/plugin-agency-finance
// Membership/affiliate plugins reuse the existing "commerce" / "marketing"
// values, so no new entries needed for those.
const VALID_CATEGORIES = new Set([
  "core", "content", "commerce", "marketing", "support", "ops", "fulfillment",
  "growth", "hr", "finance",
]);
const VALID_FIELD_TYPES = new Set([
  "text", "password", "url", "email", "select", "boolean", "textarea", "number", "color",
]);
const VALID_PLAN_IDS = new Set(["free", "starter", "pro", "enterprise"]);
const VALID_PANEL_IDS = new Set([
  "main", "fulfillment", "store", "content", "marketing", "settings", "ops", "tools",
  // R5: end-customer surface.
  "customer",
  // R6: plugin-specific panels in flight (warn-only — sidebar's scope
  // filter was tightened in R5 to only show items that match the
  // current scope's panelId/href anyway, so unknown panels are inert).
  "agency-hr", "agency-finance", "agency-marketing", "memberships", "affiliates",
  "growth",
  // R162 — email-sender uses "operations".
  "operations",
]);
const VALID_SCOPE_POLICIES = new Set(["client", "agency", "either"]);

export interface PluginValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePlugin(plugin: AquaPlugin): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plugin || typeof plugin !== "object") {
    return { ok: false, errors: ["Plugin manifest must be an object."], warnings };
  }

  if (typeof plugin.id !== "string" || !plugin.id) {
    errors.push("plugin.id is required (lowercase, no spaces).");
  } else if (!PLUGIN_ID_PATTERN.test(plugin.id)) {
    errors.push(`plugin.id "${plugin.id}" must match /^[a-z][a-z0-9-]*$/.`);
  }

  requireString(plugin, "name", errors);
  requireString(plugin, "tagline", errors);
  requireString(plugin, "description", errors);

  if (typeof plugin.version !== "string" || !plugin.version) {
    errors.push("plugin.version is required (semver, e.g. 1.0.0).");
  } else if (!SEMVER_PATTERN.test(plugin.version)) {
    errors.push(`plugin.version "${plugin.version}" must be semver (1.0.0).`);
  }

  if (!VALID_STATUSES.has(plugin.status)) {
    errors.push(`plugin.status "${plugin.status}" must be one of stable / beta / alpha.`);
  }
  if (!VALID_CATEGORIES.has(plugin.category)) {
    errors.push(`plugin.category "${plugin.category}" is unsupported.`);
  }
  if (plugin.scopePolicy !== undefined && !VALID_SCOPE_POLICIES.has(plugin.scopePolicy)) {
    errors.push(`plugin.scopePolicy "${plugin.scopePolicy}" must be one of client / agency / either when present.`);
  }

  if (plugin.plans !== undefined) {
    if (!Array.isArray(plugin.plans)) {
      errors.push("plugin.plans must be an array of plan ids.");
    } else {
      for (const p of plugin.plans) {
        if (!VALID_PLAN_IDS.has(p)) errors.push(`plugin.plans contains unknown plan "${p}".`);
      }
    }
  }

  if (plugin.requires !== undefined && !Array.isArray(plugin.requires)) {
    errors.push("plugin.requires must be an array of plugin ids.");
  }
  if (plugin.conflicts !== undefined && !Array.isArray(plugin.conflicts)) {
    errors.push("plugin.conflicts must be an array of plugin ids.");
  }
  if (plugin.id && plugin.requires?.includes(plugin.id)) {
    errors.push("plugin.requires cannot include the plugin's own id.");
  }
  if (plugin.id && plugin.conflicts?.includes(plugin.id)) {
    errors.push("plugin.conflicts cannot include the plugin's own id.");
  }

  if (!Array.isArray(plugin.navItems)) {
    errors.push("plugin.navItems must be an array (use [] when there are no sidebar items).");
  } else {
    validateNavItems(plugin.navItems, errors, warnings);
  }

  if (!Array.isArray(plugin.features)) {
    errors.push("plugin.features must be an array.");
  } else {
    validateFeatures(plugin.features, errors);
  }

  if (!plugin.settings || typeof plugin.settings !== "object") {
    errors.push("plugin.settings is required (use { groups: [] } when there are none).");
  } else if (!Array.isArray(plugin.settings.groups)) {
    errors.push("plugin.settings.groups must be an array.");
  } else {
    validateSettingsGroups(plugin.settings.groups, errors);
  }

  if (!Array.isArray(plugin.pages)) errors.push("plugin.pages must be an array.");
  if (!Array.isArray(plugin.api)) errors.push("plugin.api must be an array.");

  return { ok: errors.length === 0, errors, warnings };
}

function requireString(obj: AquaPlugin, key: "name" | "tagline" | "description", errors: string[]) {
  const v = obj[key];
  if (typeof v !== "string" || !v.trim()) {
    errors.push(`plugin.${key} is required.`);
  }
}

function validateNavItems(items: NavItem[], errors: string[], warnings: string[]) {
  const ids = new Set<string>();
  for (const [i, item] of items.entries()) {
    const where = `navItems[${i}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${where} must be an object.`);
      continue;
    }
    if (typeof item.id !== "string" || !item.id) {
      errors.push(`${where}.id is required.`);
    } else if (ids.has(item.id)) {
      errors.push(`${where}.id "${item.id}" is duplicated within this manifest.`);
    } else {
      ids.add(item.id);
    }
    if (typeof item.label !== "string" || !item.label) {
      errors.push(`${where}.label is required.`);
    }
    if (typeof item.href !== "string" || !item.href) {
      errors.push(`${where}.href is required.`);
    } else if (!item.href.startsWith("/")) {
      errors.push(`${where}.href "${item.href}" must start with "/".`);
    }
    if (item.panelId !== undefined && !VALID_PANEL_IDS.has(item.panelId)) {
      warnings.push(`${where}.panelId "${item.panelId}" is non-standard — sidebar may not render it.`);
    }
  }
}

function validateFeatures(features: PluginFeature[], errors: string[]) {
  const ids = new Set<string>();
  for (const [i, f] of features.entries()) {
    const where = `features[${i}]`;
    if (typeof f.id !== "string" || !f.id) {
      errors.push(`${where}.id is required.`);
    } else if (ids.has(f.id)) {
      errors.push(`${where}.id "${f.id}" is duplicated.`);
    } else {
      ids.add(f.id);
    }
    if (typeof f.label !== "string" || !f.label) errors.push(`${where}.label is required.`);
    if (typeof f.default !== "boolean") errors.push(`${where}.default must be a boolean.`);
    if (f.plans !== undefined) {
      if (!Array.isArray(f.plans)) {
        errors.push(`${where}.plans must be an array.`);
      } else {
        for (const p of f.plans) {
          if (!VALID_PLAN_IDS.has(p)) errors.push(`${where}.plans contains unknown plan "${p}".`);
        }
      }
    }
  }
}

function validateSettingsGroups(groups: SettingsGroup[], errors: string[]) {
  const groupIds = new Set<string>();
  for (const [i, g] of groups.entries()) {
    const where = `settings.groups[${i}]`;
    if (typeof g.id !== "string" || !g.id) {
      errors.push(`${where}.id is required.`);
    } else if (groupIds.has(g.id)) {
      errors.push(`${where}.id "${g.id}" is duplicated.`);
    } else {
      groupIds.add(g.id);
    }
    if (typeof g.label !== "string" || !g.label) errors.push(`${where}.label is required.`);
    if (!Array.isArray(g.fields)) {
      errors.push(`${where}.fields must be an array.`);
      continue;
    }
    validateSettingsFields(g.fields, `${where}.fields`, errors);
  }
}

function validateSettingsFields(fields: SettingsField[], where: string, errors: string[]) {
  const ids = new Set<string>();
  for (const [i, f] of fields.entries()) {
    const fieldWhere = `${where}[${i}]`;
    if (typeof f.id !== "string" || !f.id) {
      errors.push(`${fieldWhere}.id is required.`);
    } else if (ids.has(f.id)) {
      errors.push(`${fieldWhere}.id "${f.id}" is duplicated within this group.`);
    } else {
      ids.add(f.id);
    }
    if (typeof f.label !== "string" || !f.label) errors.push(`${fieldWhere}.label is required.`);
    if (!VALID_FIELD_TYPES.has(f.type)) errors.push(`${fieldWhere}.type "${f.type}" is unsupported.`);
    if (f.type === "select" && (!Array.isArray(f.options) || f.options.length === 0)) {
      errors.push(`${fieldWhere} (type:"select") must declare options.`);
    }
  }
}

export function validateRegistry(plugins: AquaPlugin[]): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ids = new Set<string>();
  for (const p of plugins) {
    if (!p || typeof p.id !== "string") continue;
    if (ids.has(p.id)) {
      errors.push(`Duplicate plugin id "${p.id}" in registry.`);
    } else {
      ids.add(p.id);
    }
  }

  for (const p of plugins) {
    for (const req of p.requires ?? []) {
      if (!ids.has(req)) {
        warnings.push(`Plugin "${p.id}" requires "${req}" which isn't registered.`);
      }
    }
    for (const c of p.conflicts ?? []) {
      if (!ids.has(c)) {
        warnings.push(`Plugin "${p.id}" lists conflict "${c}" which isn't registered.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
