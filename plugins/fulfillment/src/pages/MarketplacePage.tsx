// `/portal/agency/fulfillment/marketplace?client=<clientId>` — per-client
// plugin marketplace.
//
// The `client` query param picks which client the install operates on.
// Without it, we render an empty state asking the operator to pick.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { buildFulfillmentContainer } from "../server";
import { MarketplaceUI } from "../components/MarketplaceUI";
import { API_BASE } from "./ClientsPage";

export default async function MarketplacePage(props: PluginPageProps) {
  const queryClientId = readSearchParam(props.searchParams, "client");
  if (!queryClientId) {
    return (
      <section className="fulfillment-marketplace">
        <h1>Plugin marketplace</h1>
        <p>
          Pick a client first. The marketplace installs plugins per-client, so we need to
          know which client this install is for.
        </p>
        <p>
          <a href="/portal/agency/fulfillment/clients">Choose a client →</a>
        </p>
      </section>
    );
  }

  const client = await Promise.resolve(
    props.services.clients.getClientForAgency(props.agencyId, queryClientId),
  );
  if (!client) return <p>Client not found.</p>;

  const c = buildFulfillmentContainer({
    clients: props.services.clients,
    pluginInstalls: props.services.pluginInstalls,
    pluginRuntime: props.services.pluginRuntime,
    registry: props.services.registry,
    phases: props.services.phases,
    activity: props.services.activity,
    events: props.services.events,
    variants: props.services.variants,
    storage: props.storage,
  });

  const initial = await c.marketplaceService.listForClient({
    agencyId: props.agencyId,
    clientId: client.id,
    filter: {
      q: readSearchParam(props.searchParams, "q") ?? undefined,
      category: readSearchParam(props.searchParams, "category") ?? undefined,
    },
  });

  return (
    <MarketplaceUI
      apiBase={API_BASE}
      clientId={client.id}
      clientName={client.name}
      initial={initial}
    />
  );
}

function readSearchParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  if (value === undefined) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
