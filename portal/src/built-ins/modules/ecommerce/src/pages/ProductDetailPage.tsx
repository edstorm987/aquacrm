// `/portal/clients/[clientId]/ecommerce/products/[slug]`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ProductEditor } from "../components/admin/ProductEditor";
import { API_BASE } from "./ProductsPage";

export default async function ProductDetailPage(props: PluginPageProps) {
  const slug = props.segments[0];
  if (!slug) return <p>Missing product slug.</p>;
  const c = containerFor(props.storage);
  const product = await c.products.getProduct(slug);
  if (!product) return <p>Product not found.</p>;
  return <ProductEditor initial={product} apiBase={API_BASE} />;
}
