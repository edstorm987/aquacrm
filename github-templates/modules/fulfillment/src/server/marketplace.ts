// Marketplace — per-client install / disable / uninstall helpers.
//
// Thin orchestration over `services.pluginRuntime` + `services.registry`.
// The marketplace UI calls these via API handlers; the new-client wizard
// also reuses them under the hood.
//
// All operations scope to a (agencyId, clientId) tuple — agency-wide
// installs of optional plugins go through a separate admin path (out
// of scope for v1; agency-only marketplace lives in foundation).

import type { AgencyId, ClientId, PluginInstall, UserId } from "../lib/tenancy";
import type {
  ActivityLogPort,
  PluginInstallStorePort,
  PluginRegistryEntry,
  PluginRegistryPort,
  PluginRuntimePort,
} from "./ports";

export interface MarketplaceCard extends PluginRegistryEntry {
  install?: PluginInstall;        // undefined = not installed for this client
  installed: boolean;
  enabled: boolean;
}

export interface MarketplaceListResult {
  total: number;
  cards: MarketplaceCard[];
  facets: {
    categories: { id: string; count: number }[];
    statuses: { id: string; count: number }[];
  };
}

export interface MarketplaceFilter {
  q?: string;
  category?: string;
  status?: string;
}

export class MarketplaceService {
  constructor(
    private registry: PluginRegistryPort,
    private installs: PluginInstallStorePort,
    private runtime: PluginRuntimePort,
    private activity: ActivityLogPort,
  ) {}

  async listForClient(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    filter?: MarketplaceFilter;
  }): Promise<MarketplaceListResult> {
    const all = this.registry.listInstallablePlugins();
    const installed = await this.installs.listInstalledForClientOnly({
      agencyId: args.agencyId,
      clientId: args.clientId,
    });
    const installedMap = new Map(installed.map(i => [i.pluginId, i]));

    const filter = args.filter ?? {};
    const filtered = all.filter(p => {
      if (filter.category && p.category !== filter.category) return false;
      if (filter.status && p.status !== filter.status) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const haystack = `${p.id} ${p.name} ${p.tagline} ${p.description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const cards: MarketplaceCard[] = filtered.map(p => {
      const install = installedMap.get(p.id);
      return {
        ...p,
        install,
        installed: install !== undefined,
        enabled: install?.enabled ?? false,
      };
    });

    const categories = new Map<string, number>();
    const statuses = new Map<string, number>();
    for (const p of all) {
      categories.set(p.category, (categories.get(p.category) ?? 0) + 1);
      statuses.set(p.status, (statuses.get(p.status) ?? 0) + 1);
    }

    return {
      total: cards.length,
      cards,
      facets: {
        categories: [...categories.entries()].map(([id, count]) => ({ id, count })),
        statuses: [...statuses.entries()].map(([id, count]) => ({ id, count })),
      },
    };
  }

  async installForClient(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    pluginId: string;
    actor: UserId;
    setupAnswers?: Record<string, string>;
  }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }> {
    const result = await this.runtime.installPlugin({
      pluginId: args.pluginId,
      scope: { agencyId: args.agencyId, clientId: args.clientId },
      installedBy: args.actor,
      setupAnswers: args.setupAnswers,
    });
    if (result.ok) {
      await this.activity.logActivity({
        agencyId: args.agencyId,
        clientId: args.clientId,
        actorUserId: args.actor,
        category: "plugin",
        action: "plugin.installed",
        message: `Installed ${args.pluginId} via marketplace.`,
      });
    }
    return result;
  }

  async setEnabledForClient(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    pluginId: string;
    enabled: boolean;
    actor: UserId;
  }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }> {
    const result = await this.runtime.setEnabled({
      pluginId: args.pluginId,
      scope: { agencyId: args.agencyId, clientId: args.clientId },
      enabled: args.enabled,
      actor: args.actor,
    });
    if (result.ok) {
      await this.activity.logActivity({
        agencyId: args.agencyId,
        clientId: args.clientId,
        actorUserId: args.actor,
        category: "plugin",
        action: args.enabled ? "plugin.enabled" : "plugin.disabled",
        message: `${args.enabled ? "Enabled" : "Disabled"} ${args.pluginId} for client.`,
      });
    }
    return result;
  }

  async uninstallForClient(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    pluginId: string;
    actor: UserId;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await this.runtime.uninstallPlugin({
      pluginId: args.pluginId,
      scope: { agencyId: args.agencyId, clientId: args.clientId },
      actor: args.actor,
    });
    if (result.ok) {
      await this.activity.logActivity({
        agencyId: args.agencyId,
        clientId: args.clientId,
        actorUserId: args.actor,
        category: "plugin",
        action: "plugin.uninstalled",
        message: `Uninstalled ${args.pluginId} from client.`,
      });
    }
    return result;
  }
}
