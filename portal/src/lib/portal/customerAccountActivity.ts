export type CustomerAccountActivityCapability = "orders" | "bookings";

export interface CustomerAccountActivityNavItem {
  id: CustomerAccountActivityCapability;
  href: string;
  label: string;
}

interface CustomerAccountActivityContract extends CustomerAccountActivityNavItem {
  pluginId: string;
  /** True only after the customer route has a real operational lifecycle. */
  operational: boolean;
}

const CONTRACTS: readonly CustomerAccountActivityContract[] = [
  {
    id: "orders",
    href: "/portal/customer/orders",
    label: "Orders",
    pluginId: "ecommerce",
    operational: true,
  },
  {
    id: "bookings",
    href: "/portal/customer/bookings",
    label: "Bookings",
    pluginId: "bookings",
    // A friendly holding page is not an operational booking capability.
    operational: false,
  },
] as const;

export function resolveCustomerAccountActivityCapabilities(input: {
  registeredPluginIds: Iterable<string>;
  enabledPluginIds: Iterable<string>;
}): CustomerAccountActivityCapability[] {
  const registered = new Set(input.registeredPluginIds);
  const enabled = new Set(input.enabledPluginIds);
  return CONTRACTS
    .filter(contract => contract.operational && registered.has(contract.pluginId) && enabled.has(contract.pluginId))
    .map(contract => contract.id);
}

export function customerAccountActivityNavItems(
  capabilities: readonly CustomerAccountActivityCapability[],
): CustomerAccountActivityNavItem[] {
  const available = new Set(capabilities);
  return CONTRACTS
    .filter(contract => contract.operational && available.has(contract.id))
    .map(({ id, href, label }) => ({ id, href, label }));
}
