import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { AffiliatesList } from "../components/AffiliatesList";

export const API_BASE = "/api/portal/affiliates";

export default async function AffiliatesPage(props: PluginPageProps) {
  if (!props.clientId) return <p>affiliates requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const affiliates = await c.affiliates.list();
  return <AffiliatesList affiliates={affiliates} apiBase={API_BASE} canMutate />;
}
