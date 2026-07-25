// `/portal/clients/[clientId]/ecommerce/discounts`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { DiscountsEditor } from "../components/admin/DiscountsEditor";
import { API_BASE } from "./ProductsPage";

export default async function DiscountsPage(props: PluginPageProps) {
  const c = containerFor(props.storage);
  const codes = await c.discounts.listCustomCodes();
  return <DiscountsEditor codes={codes} apiBase={API_BASE} />;
}
