import { CustomerSubroute } from "../_subroute";

export default async function OrdersPage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "ecommerce",
        pluginLabel: "the ecommerce plugin",
        notExposedCopy: "Your orders will appear here once your provider exposes the storefront customer surface.",
        testid: "customer-subroute-orders",
        heading: "My orders",
      }}
    />
  );
}
