import "server-only";

// Reading a plugin's declared secrets back, from where they are actually kept.
//
// A plugin manifest declares its settings as `settings.groups[].fields[]`, and
// the code that consumes them reads `install.config.<fieldId>` — for example
// agency-finance's `stripeConfigured(config)` and
// `readStripeKeysFromInstall(config)`.
//
// Secrets must not live on `install.config`: that record is handed to page
// props and therefore to the browser. They live in the encrypted integrations
// vault, addressed by the field's `secretVault: { provider, field }`.
//
// This helper closes the loop. It hands back a config-shaped object with the
// vault's values merged in under the MANIFEST field ids, so every existing
// `config.stripeSecretKey` reader keeps working unchanged and none of them has
// to learn about the vault.
//
// Before this existed, `readStripeKeysFromInstall` read only
// `install.config.stripeSecretKey`, nothing ever wrote that key, and a genuinely
// vault-connected Stripe still counted as "not configured" — the second half of
// the 22 Aug 2026 finding.

import { getPlugin } from "@/built-ins/runtime/_registry";
import type { SettingsField } from "@/built-ins/runtime/_types";
import { MANAGED_INTEGRATION_PROVIDERS } from "@/lib/server/integrations/integrationConnections";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import type { IntegrationProvider } from "@/lib/integrations/catalog";

export interface PluginSecretScope {
  agencyId: string;
  clientId?: string;
}

/** Every settings field of a plugin, flattened, in declaration order. */
export function pluginSettingsFields(pluginId: string): SettingsField[] {
  return getPlugin(pluginId)?.settings.groups.flatMap(group => group.fields) ?? [];
}

/** A field routed to the vault, with a provider the catalogue actually knows. */
export function vaultTargetOf(field: SettingsField): { provider: IntegrationProvider; field: string } | null {
  const target = field.secretVault;
  if (!target?.provider || !target.field) return null;
  if (!(MANAGED_INTEGRATION_PROVIDERS as readonly string[]).includes(target.provider)) return null;
  return { provider: target.provider as IntegrationProvider, field: target.field };
}

/**
 * `install.config` with the plugin's vault-held secrets merged in under their
 * manifest field ids.
 *
 * The vault WINS over a same-named entry on the config record. That is
 * deliberate: `install.config` is a client-visible surface, so a secret sitting
 * there is either a mistake or a leftover, and the value an operator most
 * recently saved through the settings surface is the one in the vault.
 */
export function installConfigWithSecrets(
  pluginId: string,
  scope: PluginSecretScope,
  config: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(config ?? {}) };
  const byProvider = new Map<IntegrationProvider, Record<string, string>>();

  for (const field of pluginSettingsFields(pluginId)) {
    const target = vaultTargetOf(field);
    if (!target) continue;
    let values = byProvider.get(target.provider);
    if (!values) {
      values = resolveIntegrationValues(scope.agencyId, target.provider, { clientId: scope.clientId });
      byProvider.set(target.provider, values);
    }
    const value = values[target.field];
    if (typeof value === "string" && value.length > 0) merged[field.id] = value;
  }
  return merged;
}
