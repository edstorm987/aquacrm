// `/portal/clients/[clientId]/ecommerce/inventory`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { InventoryTable } from "../components/admin/InventoryTable";
import type { InventoryItem } from "../lib/admin/inventory";
import { API_BASE } from "./ProductsPage";

export default async function InventoryPage(props: PluginPageProps) {
  const c = containerFor(props.storage);
  const items = await c.products.listInventory();
  const products = await c.products.listProducts({ includeHidden: true, includeArchived: true });
  // Augment with name + slug for the UI.
  const bySku = new Map<string, { name?: string; slug?: string }>();
  for (const p of products) {
    if (p.stockSku) bySku.set(p.stockSku, { name: p.name, slug: p.slug });
  }
  const augmented: InventoryItem[] = items.map(it => {
    const meta = bySku.get(it.sku);
    return { ...it, name: meta?.name, productSlug: meta?.slug };
  });
  return <InventoryTable items={augmented} apiBase={API_BASE} />;
}
