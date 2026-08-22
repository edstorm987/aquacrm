import "server-only";

// The generic plugin settings surface — read and write whatever a manifest
// declares in `settings.groups`.
//
// Finding 2026-08-22 "Stripe can never be configured": agency-finance declared
// `stripeSecretKey` and `stripeWebhookSecret` as password fields, and NO
// component anywhere rendered a plugin's `settings.groups`. The only
// `patchInstall` caller in `src/app` wrote four hardcoded finance keys. So
// `stripeConfigured()` was permanently false, `invoices/checkout` and
// `payments/refund` were unreachable by construction, and two error messages
// told the operator to "Set up Stripe in Finance settings" — a control that had
// never been built.
//
// Built generically on purpose: the next plugin's declared settings work
// without anyone writing a second form.
//
// Two stores, and which one is used is not the caller's choice:
//   • ordinary fields  → `install.config` (client-visible; that is fine)
//   • password fields  → the encrypted integrations vault, addressed by the
//                        field's `secretVault: { provider, field }`
// A password field with no vault target is refused, here and by the registry
// validator. Secret values are never returned by `describePluginSettings` —
// the surface reports only whether something is stored.

import { getPlugin } from "@/built-ins/runtime/_registry";
import type { SettingsField } from "@/built-ins/runtime/_types";
import { getInstall, patchInstall } from "@/server/pluginInstalls";
import {
  resolveIntegrationValues,
  saveIntegrationConnection,
} from "@/lib/server/integrations/integrationConnections";
import type { IntegrationProvider } from "@/lib/integrations/catalog";
import { pluginSettingsFields, vaultTargetOf, type PluginSecretScope } from "./pluginSecretConfig";

export type PluginSettingsValue = string | number | boolean | null;

export interface PluginSettingsFieldView {
  id: string;
  label: string;
  type: SettingsField["type"];
  helpText?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Ordinary fields only. A secret's value is NEVER echoed back. */
  value: PluginSettingsValue;
  secret: boolean;
  /** Secrets only: is a usable value in place? */
  configured: boolean;
  /**
   * Secrets only, and deliberately distinguished. "vault" = this workspace
   * saved its own. "environment" = it is working off the deployment's
   * credentials, which belong to the founder's agency, not to this one.
   */
  source: "vault" | "environment" | null;
}

export interface PluginSettingsGroupView {
  id: string;
  label: string;
  description?: string;
  fields: PluginSettingsFieldView[];
}

export interface PluginSettingsView {
  pluginId: string;
  pluginName: string;
  installed: boolean;
  groups: PluginSettingsGroupView[];
}

export class PluginSettingsError extends Error {}

// ─── Read ─────────────────────────────────────────────────────────────────

export function describePluginSettings(
  pluginId: string,
  scope: PluginSecretScope,
): PluginSettingsView | null {
  const plugin = getPlugin(pluginId);
  if (!plugin) return null;
  const install = getInstall({ agencyId: scope.agencyId, clientId: scope.clientId }, pluginId)
    ?? getInstall({ agencyId: scope.agencyId }, pluginId);
  const config = install?.config ?? {};

  // One resolve per provider, twice: with the environment fallback and
  // without, so "this workspace saved a key" and "this workspace is running on
  // the deployment's key" can be told apart on screen.
  const own = new Map<IntegrationProvider, Record<string, string>>();
  const effective = new Map<IntegrationProvider, Record<string, string>>();
  const valuesFor = (provider: IntegrationProvider) => {
    if (!own.has(provider)) {
      own.set(provider, resolveIntegrationValues(scope.agencyId, provider, {
        clientId: scope.clientId, includeEnvironmentFallback: false,
      }));
      effective.set(provider, resolveIntegrationValues(scope.agencyId, provider, { clientId: scope.clientId }));
    }
    return { own: own.get(provider)!, effective: effective.get(provider)! };
  };

  const groups = plugin.settings.groups.map(group => ({
    id: group.id,
    label: group.label,
    ...(group.description ? { description: group.description } : {}),
    fields: group.fields.map((field): PluginSettingsFieldView => {
      const base = {
        id: field.id,
        label: field.label,
        type: field.type,
        ...(field.helpText ? { helpText: field.helpText } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.options ? { options: field.options } : {}),
      };
      if (field.type !== "password") {
        const stored = config[field.id];
        const value = stored === undefined ? (field.default ?? null) : stored;
        return {
          ...base,
          value: (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
            ? value
            : null,
          secret: false,
          configured: value !== null && value !== "",
          source: null,
        };
      }
      const target = vaultTargetOf(field);
      if (!target) {
        // Declared a secret with nowhere safe to put it. Reported as
        // unconfigurable rather than silently rendered as a working input.
        return { ...base, value: null, secret: true, configured: false, source: null };
      }
      const { own: ownValues, effective: effectiveValues } = valuesFor(target.provider);
      const savedHere = Boolean(ownValues[target.field]);
      const works = Boolean(effectiveValues[target.field]);
      return {
        ...base,
        value: null,
        secret: true,
        configured: works,
        source: savedHere ? "vault" : works ? "environment" : null,
      };
    }),
  }));

  return { pluginId, pluginName: plugin.name, installed: Boolean(install), groups };
}

// ─── Write ────────────────────────────────────────────────────────────────

export interface WritePluginSettingsInput {
  pluginId: string;
  scope: PluginSecretScope;
  values: Record<string, unknown>;
  actorUserId: string;
  actorEmail?: string;
}

export interface WritePluginSettingsResult {
  /** Manifest field ids written to `install.config`. */
  configFields: string[];
  /** Manifest field ids written to the vault. Values are never reported. */
  secretFields: string[];
}

export function writePluginSettings(input: WritePluginSettingsInput): WritePluginSettingsResult {
  const plugin = getPlugin(input.pluginId);
  if (!plugin) throw new PluginSettingsError("unknown_plugin");
  const install = getInstall({ agencyId: input.scope.agencyId, clientId: input.scope.clientId }, input.pluginId)
    ?? getInstall({ agencyId: input.scope.agencyId }, input.pluginId);
  if (!install) throw new PluginSettingsError("plugin_not_installed");

  const declared = new Map(pluginSettingsFields(input.pluginId).map(field => [field.id, field]));
  const configPatch: Record<string, unknown> = {};
  const secretsByProvider = new Map<IntegrationProvider, Record<string, string>>();
  const secretFields: string[] = [];

  for (const [key, raw] of Object.entries(input.values)) {
    const field = declared.get(key);
    // Only what the manifest declares. An undeclared key would otherwise be a
    // write-anything hole into the install record.
    if (!field) throw new PluginSettingsError(`unknown_field:${key}`);

    if (field.type === "password") {
      const value = typeof raw === "string" ? raw.trim() : "";
      // Blank means "leave the stored one alone". A settings form re-submitted
      // after a currency change must never wipe the Stripe key it could not
      // display in the first place.
      if (!value) continue;
      const target = vaultTargetOf(field);
      if (!target) throw new PluginSettingsError(`no_vault_target:${key}`);
      const bucket = secretsByProvider.get(target.provider) ?? {};
      bucket[target.field] = value;
      secretsByProvider.set(target.provider, bucket);
      secretFields.push(key);
      continue;
    }

    configPatch[key] = coerce(field, raw);
  }

  // Secrets first: if the vault refuses (a required companion field missing,
  // no encryption key in production), nothing has been written yet and the
  // caller gets a clean failure instead of a half-applied save.
  for (const [provider, values] of secretsByProvider) {
    // Merge with what is already stored for this provider so a partial save
    // (just the webhook secret, say) does not trip the catalogue's
    // required-field check against a fresh connection.
    const existing = resolveIntegrationValues(input.scope.agencyId, provider, {
      clientId: input.scope.clientId, includeEnvironmentFallback: false,
    });
    try {
      saveIntegrationConnection({
        agencyId: input.scope.agencyId,
        provider,
        clientId: input.scope.clientId,
        values: { ...existing, ...values },
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "vault_write_failed";
      throw new PluginSettingsError(message);
    }
  }

  if (Object.keys(configPatch).length) {
    patchInstall(
      { agencyId: install.agencyId, clientId: install.clientId },
      input.pluginId,
      { config: configPatch },
    );
  }

  return { configFields: Object.keys(configPatch), secretFields };
}

function coerce(field: SettingsField, raw: unknown): unknown {
  switch (field.type) {
    case "number": {
      const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
      if (!Number.isFinite(value)) throw new PluginSettingsError(`not_a_number:${field.id}`);
      return value;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on" || raw === 1 || raw === "1";
    case "select": {
      const value = String(raw ?? "");
      const allowed = (field.options ?? []).map(option => option.value);
      if (!allowed.includes(value)) throw new PluginSettingsError(`not_an_option:${field.id}`);
      return value;
    }
    default:
      return typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  }
}
