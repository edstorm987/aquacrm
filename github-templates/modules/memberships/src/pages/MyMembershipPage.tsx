// Customer-facing membership page. `panelId: "customer"` so it lands
// on the end-customer surface T1 R5 builds out.
//
// `props.actor` is the end-customer's userId (the foundation's
// session cookie carries it). Non-end-customer roles can still hit
// the URL but the data they see is their own subscription record —
// agency-side users won't have memberships rows so they get the
// "become a member" prompt, which is harmless.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { MyMembershipPanel } from "../components/MyMembershipPanel";

export const API_BASE = "/api/portal/memberships";

export default async function MyMembershipPage(props: PluginPageProps) {
  if (!props.clientId) return <p>memberships requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const [subscription, plans] = await Promise.all([
    c.subscriptions.getByUser(props.actor),
    c.plans.listActive(),
  ]);
  const [plan, benefits] = subscription
    ? await Promise.all([
        c.plans.get(subscription.planId),
        c.benefits.getBenefitsForUser(props.actor),
      ])
    : [null, []];

  return (
    <MyMembershipPanel
      subscription={subscription}
      plan={plan}
      benefits={benefits}
      availablePlans={plans}
      apiBase={API_BASE}
    />
  );
}
