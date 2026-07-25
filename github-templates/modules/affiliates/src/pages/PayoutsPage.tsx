import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { PayoutsList } from "../components/PayoutsList";

export const API_BASE = "/api/portal/affiliates";

export default async function PayoutsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>affiliates requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [payouts, affiliates] = await Promise.all([c.payouts.list(), c.affiliates.list()]);
  return <PayoutsList payouts={payouts} affiliates={affiliates} apiBase={API_BASE} canMutate />;
}
