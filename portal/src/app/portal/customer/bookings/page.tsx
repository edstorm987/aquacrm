import { CustomerSubroute } from "../_subroute";

export default async function BookingsPage() {
  return (
    <CustomerSubroute
      cfg={{
        pluginId: "bookings",
        pluginLabel: "bookings",
        notExposedCopy: "Your upcoming bookings will appear here once scheduling is ready for your account.",
        testid: "customer-subroute-bookings",
        heading: "My bookings",
      }}
    />
  );
}
