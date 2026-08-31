// Provider config service. One ProviderConfig per agency.
//
// ── Where the credentials actually live ──────────────────────────────────
//
// The comment here used to say the full API key lives on the plugin install's
// `config`. It never did, and it must not: `install.config` is handed to page
// props and therefore to the browser. The full send token and the Postmark
// account token live in this module's own private storage slots below, which
// only server code reads; the `ProviderConfig` row carries the masked tail and
// the readiness status, and is the only shape any API response returns.
//
// This is also why `provider` and `webhookSecret` are no longer declared as
// manifest settings fields. They were, and the generic Settings-hub panel
// wrote them to `install.config` — a store the delivery and webhook paths
// never read. The form saved without error and changed nothing, which is the
// exact hazard `lib/chrome/settingsModules.ts` warns about. One store, edited
// from the module's own Settings page through the provider PATCH route.

import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  ProviderConfig,
  ProviderKind,
  PublicProviderConfig,
  UpdateProviderInput,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const PROVIDER_KEY = "provider/config";
const PROVIDER_API_KEY = "provider/api-key";       // full key, never returned via API
const PROVIDER_ACCOUNT_TOKEN = "provider/account-token"; // ditto — account-level token

export class ProviderService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async get(): Promise<ProviderConfig> {
    const row = await this.storage.get<ProviderConfig>(PROVIDER_KEY);
    if (row) return row;
    return {
      agencyId: this.agencyId,
      provider: "none",
      status: "unconfigured",
      updatedAt: 0,
    };
  }

  // Internal — DeliveryService reads the full key.
  async _readApiKey(): Promise<string | undefined> {
    return this.storage.get<string>(PROVIDER_API_KEY);
  }

  // Internal — IdentityService reads the account-level token when it asks a
  // driver to confirm a sender address.
  async _readAccountToken(): Promise<string | undefined> {
    return this.storage.get<string>(PROVIDER_ACCOUNT_TOKEN);
  }

  async update(input: UpdateProviderInput, actor: UserId): Promise<ProviderConfig> {
    const existing = await this.get();
    const provider = input.provider ?? existing.provider;
    const deliveryConfigChanged =
      (input.provider !== undefined && input.provider !== existing.provider)
      || input.apiKey !== undefined
      || input.smtp !== undefined;
    const resetReadiness = provider === "none" || deliveryConfigChanged;
    const next: ProviderConfig = {
      ...existing,
      provider,
      defaultFromIdentityId: input.defaultFromIdentityId ?? existing.defaultFromIdentityId,
      webhookSecret: input.webhookSecret ?? existing.webhookSecret,
      smtp: input.smtp ?? existing.smtp,
      status: resetReadiness ? "unconfigured" : existing.status,
      testedAt: resetReadiness ? undefined : existing.testedAt,
      errorMessage: resetReadiness ? undefined : existing.errorMessage,
      updatedAt: now(),
    };
    if (input.apiKey !== undefined) {
      // Store the full key separately, masked in the public config.
      await this.storage.set(PROVIDER_API_KEY, input.apiKey);
      next.apiKeyMasked = input.apiKey ? maskKey(input.apiKey) : undefined;
    }
    if (input.accountToken !== undefined) {
      await this.storage.set(PROVIDER_ACCOUNT_TOKEN, input.accountToken);
      next.accountTokenMasked = input.accountToken ? maskKey(input.accountToken) : undefined;
    }
    await this.storage.set(PROVIDER_KEY, next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "email",
      action: "email.provider.updated",
      message: `Provider updated to ${next.provider}${next.apiKeyMasked ? ` (key …${next.apiKeyMasked})` : ""}.`,
      metadata: { provider: next.provider, status: next.status },
    });
    this.events.emit({ agencyId: this.agencyId }, "email.provider.updated", {
      provider: next.provider, status: next.status,
    });
    return next;
  }

  // Mark provider as errored (called from DeliveryService when a send
  // fails for an authentication-style reason).
  async markError(reason: string): Promise<void> {
    const existing = await this.get();
    if (existing.provider === "none") return;
    await this.storage.set(PROVIDER_KEY, {
      ...existing,
      status: "error",
      errorMessage: reason,
      updatedAt: now(),
    });
  }

  async markActive(): Promise<void> {
    const existing = await this.get();
    if (existing.provider === "none") return;
    if (existing.status === "active") return;
    await this.storage.set(PROVIDER_KEY, {
      ...existing,
      status: "active",
      errorMessage: undefined,
      testedAt: now(),
      updatedAt: now(),
    });
  }

  // Helper used by drivers / tests.
  static currentProvider(): ProviderKind {
    return "none";
  }
}

function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return key.slice(-4);
}

/**
 * The only shape that may leave the server — an API body, or a prop handed to a
 * client component (which is serialised into the page and reaches the browser
 * just the same).
 *
 * The webhook signing secret is dropped and replaced by its tail. It is what
 * proves a delivery callback really came from the provider; anyone who can read
 * it can forge "delivered" and "bounced" events, so it is a credential, not a
 * display field. The rest of the row is already masked or public.
 */
export function redactProviderConfig(config: ProviderConfig): PublicProviderConfig {
  const { webhookSecret, ...rest } = config;
  return {
    ...rest,
    ...(webhookSecret ? { webhookSecretMasked: maskKey(webhookSecret) } : {}),
  };
}
