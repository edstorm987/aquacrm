import type { PortalProductKey, PortalProductSelection } from "@/lib/portal/portalProducts";

const MARKETING_KEYS = new Set<PortalProductKey>(["content", "google-profile", "social-ads"]);
const SYSTEM_KEYS = new Set<PortalProductKey>(["website", "automation", "custom-software", "ongoing-care", "health-check"]);

export interface ClientServiceCapabilities {
  hasServices: boolean;
  marketing: boolean;
  systems: boolean;
  keys: PortalProductKey[];
}

interface ServiceCatalogueRecord {
  id: string;
  portalTemplateKey?: PortalProductKey;
  includedProductIds?: string[];
}

export function inheritedClientServiceKeys(
  products: PortalProductSelection[],
  catalogue: ServiceCatalogueRecord[],
): PortalProductKey[] {
  const byId = new Map(catalogue.map(product => [product.id, product]));
  return [...new Set(products.flatMap(selection => {
    const assigned = byId.get(selection.id);
    if (!assigned) return [];
    return [
      assigned.portalTemplateKey,
      ...(assigned.includedProductIds ?? []).map(id => byId.get(id)?.portalTemplateKey),
    ].filter((key): key is PortalProductKey => Boolean(key));
  }))];
}

export function clientServiceCapabilities(
  products: PortalProductSelection[],
  inheritedKeys: Array<PortalProductKey | undefined> = [],
): ClientServiceCapabilities {
  const keys = [...new Set([
    ...products.map(product => product.catalogKey),
    ...inheritedKeys,
  ].filter((key): key is PortalProductKey => Boolean(key)))];

  return {
    hasServices: products.length > 0,
    marketing: keys.some(key => MARKETING_KEYS.has(key)),
    systems: keys.some(key => SYSTEM_KEYS.has(key)),
    keys,
  };
}
