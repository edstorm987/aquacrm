import "server-only";
// Shared port objects used by multiple foundation-adapter side-effect
// files. Each plugin's `register*Foundation` call ends up reading the
// same five-or-six ports off T1's modules; centralising them here means
// per-plugin adapter files only need to wire the bits unique to their
// plugin (Stripe factory, ecommerce order projections, etc.) on top.
//
// Stable shapes — adding a method should be additive (don't break
// existing plugin contracts). Plugin packages own their own
// ActivityLogPort / EventBusPort / TenantPort / etc. interfaces; we
// match structurally.

import { getClient, getClientForAgency } from "@/server/tenants";
import { logActivity, listActivity } from "@/server/activity";
import { emit } from "@/server/eventBus";
import { getInstall } from "@/server/pluginInstalls";
import { getUserById } from "@/server/users";
import type { AquaEventName } from "@/server/eventBus";

export const tenantPort = {
  getClient(id: string) { return getClient(id); },
  getClientForAgency(agencyId: string, clientId: string) {
    return getClientForAgency(agencyId, clientId);
  },
};

// Activity port — the foundation's `ActivityCategory` union is a
// SUPERSET of each plugin's vendored copy (the foundation grows when a
// new plugin lands; each plugin only knows its own categories). The
// `unknown` casts bridge the structural gap: a plugin will only ever
// pass categories from its own narrow set, and entries it reads back
// will (in practice) be its own — but TypeScript can't prove either.
// `any` avoids the variance trap on both arg and return; the
// foundation's runtime types do the validation.
export const activityPort = {
  logActivity(input: Parameters<typeof logActivity>[0]): unknown {
    return logActivity(input);
  },
  listActivity(filter: Parameters<typeof listActivity>[0]): unknown {
    return listActivity(filter);
  },
};

// Plugin-defined event names extend the foundation's union.
// `emit()` doesn't reject unknown names — the cast keeps the call site
// type-safe across plugin packages whose `EventBusPort.emit` accepts
// `string | <PluginEventName>`.
export const eventBusPort = {
  emit<T = unknown>(scope: { agencyId: string; clientId?: string }, name: string, payload: T) {
    emit(scope, name as AquaEventName, payload);
  },
};

export const pluginInstallStorePort = {
  getInstall(scope: { agencyId: string; clientId?: string }, pluginId: string) {
    return getInstall(scope, pluginId);
  },
};

// EndCustomerProfile shape every plugin's UserPort expects. Each plugin
// vendors its own copy; the structural projection here matches all of
// them. Defensive: agency-/client-tier users still resolve, but with a
// best-effort `clientId` fallback so the projection never returns
// nonsense.
export interface UserProfileProjection {
  id: string;
  email: string;
  name?: string;
  agencyId: string;
  clientId: string;
}

export const userPort = {
  getUser(id: string): UserProfileProjection | null {
    const user = getUserById(id);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      agencyId: user.agencyId,
      clientId: user.clientId ?? "",
    };
  },
};
