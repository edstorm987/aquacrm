// Plans admin page. `/portal/clients/<cid>/memberships` and `.../plans`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { PlansList } from "../components/PlansList";
import type { Currency } from "../lib/domain";

export const API_BASE = "/api/portal/memberships";

export default async function PlansPage(props: PluginPageProps) {
  if (!props.clientId) {
    return <p>memberships requires a client scope.</p>;
  }
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const plans = await c.plans.list();
  const defaultCurrency = (props.install.config.defaultCurrency as Currency | undefined) ?? "usd";
  return (
    <PlansList
      plans={plans}
      apiBase={API_BASE}
      defaultCurrency={defaultCurrency}
      canMutate
    />
  );
}
