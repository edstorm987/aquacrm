import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { SubscribersList } from "../components/SubscribersList";

export const API_BASE = "/api/portal/memberships";

export default async function SubscribersPage(props: PluginPageProps) {
  if (!props.clientId) return <p>memberships requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [subscribers, plans] = await Promise.all([
    c.subscriptions.list(),
    c.plans.list(),
  ]);
  return (
    <SubscribersList
      subscribers={subscribers}
      plans={plans}
      apiBase={API_BASE}
      canMutate
    />
  );
}
