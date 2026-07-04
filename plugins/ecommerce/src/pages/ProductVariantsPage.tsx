// `/portal/clients/[clientId]/ecommerce/products/[slug]/variants`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { VariantsEditor } from "../components/admin/VariantsEditor";
import { API_BASE } from "./ProductsPage";

export default async function ProductVariantsPage(props: PluginPageProps) {
  const slug = props.segments[0];
  if (!slug) return <p>Missing product slug.</p>;
  const c = containerFor(props.storage);
  const product = await c.products.getProduct(slug);
  if (!product) return <p>Product not found.</p>;
  return <VariantsEditor product={product} apiBase={API_BASE} />;
}
