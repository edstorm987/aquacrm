import { CustomerSubroute } from "../_subroute";

export default async function AccountPage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "client-crm",
        pluginLabel: "the client CRM",
        redirectTo: "/portal/customer/profile",
        testid: "customer-subroute-account",
        heading: "Account",
      }}
    />
  );
}
