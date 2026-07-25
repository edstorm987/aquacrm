// Customer-facing affiliate dashboard. `panelId: "customer"` so it
// lands on the end-customer surface (T1 R5 + R5 customer chrome).

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { MyAffiliatePanel } from "../components/MyAffiliatePanel";

export const API_BASE = "/api/portal/affiliates";

export default async function MyAffiliatePage(props: PluginPageProps) {
  if (!props.clientId) return <p>affiliates requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const affiliate = await c.affiliates.getByUser(props.actor);
  if (!affiliate) {
    return <MyAffiliatePanel affiliate={null} codes={[]} attributions={[]} payouts={[]} apiBase={API_BASE} />;
  }
  const [codes, attributions, payouts] = await Promise.all([
    c.codes.list({ affiliateId: affiliate.id }),
    c.attributions.listForAffiliate(affiliate.id),
    c.payouts.listForAffiliate(affiliate.id),
  ]);
  return (
    <MyAffiliatePanel
      affiliate={affiliate}
      codes={codes}
      attributions={attributions}
      payouts={payouts}
      apiBase={API_BASE}
    />
  );
}
