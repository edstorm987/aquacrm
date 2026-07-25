// `/portal/clients/[clientId]/ecommerce/shipping`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import type { ShippingRate, ShippingZone } from "../lib/admin/shipping";
import { ShippingEditor } from "../components/admin/ShippingEditor";
import { API_BASE } from "./ProductsPage";

export default async function ShippingPage(props: PluginPageProps) {
  const zones = (await props.storage.get<ShippingZone[]>("shipping/zones")) ?? [];
  const rates = (await props.storage.get<ShippingRate[]>("shipping/rates")) ?? [];
  return <ShippingEditor zones={zones} rates={rates} apiBase={API_BASE} />;
}
