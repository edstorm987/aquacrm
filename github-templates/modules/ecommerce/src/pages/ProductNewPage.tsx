// `/portal/clients/[clientId]/ecommerce/products/new`

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { ProductEditor } from "../components/admin/ProductEditor";
import { API_BASE } from "./ProductsPage";

export default function ProductNewPage(_props: PluginPageProps) {
  return (
    <ProductEditor
      initial={{
        slug: "",
        id: "",
        name: "",
        price: 0,
        currency: "gbp",
      }}
      apiBase={API_BASE}
      isNew
    />
  );
}
