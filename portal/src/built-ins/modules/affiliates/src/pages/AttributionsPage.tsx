import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { AttributionsList } from "../components/AttributionsList";

export const API_BASE = "/api/portal/affiliates";

export default async function AttributionsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>affiliates requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [attributions, affiliates] = await Promise.all([c.attributions.list(), c.affiliates.list()]);
  return <AttributionsList attributions={attributions} affiliates={affiliates} apiBase={API_BASE} canMutate />;
}
