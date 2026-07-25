import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { CodesList } from "../components/CodesList";

export const API_BASE = "/api/portal/affiliates";

export default async function CodesPage(props: PluginPageProps) {
  if (!props.clientId) return <p>affiliates requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [codes, affiliates] = await Promise.all([c.codes.list(), c.affiliates.list()]);
  return <CodesList codes={codes} affiliates={affiliates} apiBase={API_BASE} />;
}
