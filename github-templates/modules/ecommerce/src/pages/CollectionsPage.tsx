// `/portal/clients/[clientId]/ecommerce/collections`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import type { ProductCollection } from "../lib/admin/collections";
import { CollectionsEditor } from "../components/admin/CollectionsEditor";
import { API_BASE } from "./ProductsPage";

export default async function CollectionsPage(props: PluginPageProps) {
  const collections = (await props.storage.get<ProductCollection[]>("collections")) ?? [];
  return <CollectionsEditor collections={collections} apiBase={API_BASE} />;
}
