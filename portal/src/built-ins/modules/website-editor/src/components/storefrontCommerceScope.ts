"use client";

export interface StorefrontCommerceScope {
  agencyId: string;
  clientId: string;
}

const STORE_ROOT = "[data-aqua-storefront][data-aqua-agency-id][data-aqua-client-id]";
const MODULE_PREFIX = "/api/portal/ecommerce/";

export function ecommerceStorefrontScope(
  root: Pick<Document, "querySelector"> | undefined = typeof document === "undefined" ? undefined : document,
): StorefrontCommerceScope | null {
  const element = root?.querySelector<HTMLElement>(STORE_ROOT);
  const agencyId = element?.dataset.aquaAgencyId?.trim();
  const clientId = element?.dataset.aquaClientId?.trim();
  return agencyId && clientId ? { agencyId, clientId } : null;
}

/**
 * Route a mounted storefront through the deliberately narrow anonymous
 * facade. Editor/admin callers without a storefront root retain the existing
 * authenticated API path.
 */
export function ecommerceApiUrl(path: string, scope = ecommerceStorefrontScope()): string {
  if (!scope) return path;
  const url = new URL(path, "https://aqua.invalid");
  if (url.pathname.startsWith(MODULE_PREFIX) && !url.pathname.startsWith(`${MODULE_PREFIX}storefront/`)) {
    url.pathname = `${MODULE_PREFIX}storefront/${url.pathname.slice(MODULE_PREFIX.length)}`;
  }
  url.searchParams.set("agencyId", scope.agencyId);
  url.searchParams.set("clientId", scope.clientId);
  return `${url.pathname}${url.search}${url.hash}`;
}
