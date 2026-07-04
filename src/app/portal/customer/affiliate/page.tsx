import { CustomerSubroute } from "../_subroute";

export default async function AffiliatePage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "affiliates",
        pluginLabel: "the affiliate program",
        redirectTo: "/portal/customer/affiliates",
        testid: "customer-subroute-affiliate",
        heading: "Refer & earn",
      }}
    />
  );
}
