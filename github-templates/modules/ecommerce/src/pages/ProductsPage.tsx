// `/portal/clients/[clientId]/ecommerce/products`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ProductsList } from "../components/admin/ProductsList";

export const API_BASE = "/api/portal/ecommerce";

export default async function ProductsPage(props: PluginPageProps) {
  const c = containerFor(props.storage);
  const products = await c.products.listProducts({ includeHidden: true, includeArchived: true });
  return <ProductsList products={products} apiBase={API_BASE} />;
}
