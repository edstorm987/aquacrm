import { CustomerSubroute } from "../_subroute";

export default async function MembershipPage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "memberships",
        pluginLabel: "memberships",
        redirectTo: "/portal/customer/memberships",
        testid: "customer-subroute-membership",
        heading: "Membership",
      }}
    />
  );
}
