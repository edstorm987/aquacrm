import { CustomerSubroute } from "../_subroute";

export default async function BookingsPage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "bookings",
        pluginLabel: "the bookings plugin",
        notExposedCopy: "Your upcoming bookings will appear here once your provider exposes the customer scheduling surface.",
        testid: "customer-subroute-bookings",
        heading: "My bookings",
      }}
    />
  );
}
