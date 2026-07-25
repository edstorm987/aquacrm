// Provider config service. One ProviderConfig per agency. The full
// API key lives in the plugin install's `config` (so it's masked
// from API responses); this row carries the masked tail + status.

import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  ProviderConfig,
  ProviderKind,
  UpdateProviderInput,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const PROVIDER_KEY = "provider/config";
const PROVIDER_API_KEY = "provider/api-key";       // full key, never returned via API

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

  async update(input: UpdateProviderInput, actor: UserId): Promise<ProviderConfig> {
    const existing = await this.get();
    const next: ProviderConfig = {
      ...existing,
      provider: input.provider ?? existing.provider,
      defaultFromIdentityId: input.defaultFromIdentityId ?? existing.defaultFromIdentityId,
      webhookSecret: input.webhookSecret ?? existing.webhookSecret,
      smtp: input.smtp ?? existing.smtp,
      status: input.provider === "none" ? "unconfigured" : (input.apiKey ? "active" : existing.status),
      updatedAt: now(),
    };
    if (input.apiKey !== undefined) {
      // Store the full key separately, masked in the public config.
      await this.storage.set(PROVIDER_API_KEY, input.apiKey);
      next.apiKeyMasked = input.apiKey ? maskKey(input.apiKey) : undefined;
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
    await this.storage.set(PROVIDER_KEY, {
      ...existing,
      status: "error",
      errorMessage: reason,
      updatedAt: now(),
    });
  }

  async markActive(): Promise<void> {
    const existing = await this.get();
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
