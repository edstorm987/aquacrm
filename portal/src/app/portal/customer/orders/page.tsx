import { CustomerSubroute } from "../_subroute";

export default async function OrdersPage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "ecommerce",
        pluginLabel: "orders",
        notExposedCopy: "Your orders will appear here once ordering is ready for your account.",
        testid: "customer-subroute-orders",
        heading: "My orders",
      }}
    />
  );
}
