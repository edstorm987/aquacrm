import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { BenefitsList } from "../components/BenefitsList";

export const API_BASE = "/api/portal/memberships";

export default async function BenefitsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>memberships requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const benefits = await c.benefits.list();
  return <BenefitsList benefits={benefits} apiBase={API_BASE} canMutate />;
}
