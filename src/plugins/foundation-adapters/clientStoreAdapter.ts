import "server-only";
// Foundation adapter — wraps `@/server/tenants` to satisfy
// `ClientStorePort` from `@/plugins/_types`. Plugins (incl. T2's
// fulfillment) consume the port; never the underlying module.

import * as tenants from "@/server/tenants";
import type { ClientStorePort, CreateClientInput, UpdateClientPatch } from "@/plugins/_types";
import type { Client } from "@/server/types";

export const clientStoreAdapter: ClientStorePort = {
  createClient(agencyId: string, input: CreateClientInput): Client {
    return tenants.createClient(agencyId, {
      name: input.name,
      slug: input.slug,
      ownerEmail: input.ownerEmail,
      websiteUrl: input.websiteUrl,
      stage: input.stage,
      brand: input.brand,
      metadata: input.metadata,
    });
  },
  getClient(id) { return tenants.getClient(id); },
  getClientForAgency(agencyId, clientId) { return tenants.getClientForAgency(agencyId, clientId); },
  listClients(agencyId) { return tenants.listClients(agencyId); },
  updateClient(agencyId, clientId, patch: UpdateClientPatch) {
    return tenants.updateClient(agencyId, clientId, patch);
  },
};
