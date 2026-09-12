import type { PluginApiRoute } from "@/built-ins/runtime/_types";

export const PLUGIN_PUBLIC_ROUTE_AUTHORITIES = [
  "provider-webhook",
  "published-site-write",
  "published-site-read",
  "storefront-read",
  "storefront-checkout",
] as const;

type PublicRouteAuthority = (typeof PLUGIN_PUBLIC_ROUTE_AUTHORITIES)[number];

function isAuthority(value: unknown): value is PublicRouteAuthority {
  return typeof value === "string"
    && (PLUGIN_PUBLIC_ROUTE_AUTHORITIES as readonly string[]).includes(value);
}

/** Anonymous plugin routes are fail-closed until their authority is classified. */
export function isClassifiedPublicPluginRoute(route: PluginApiRoute | undefined): boolean {
  return route?.public === true && isAuthority(route.publicAuthority);
}
