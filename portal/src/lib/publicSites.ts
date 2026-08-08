export const PUBLIC_AQUA_SITES = {
  aqua_public_aquacrm_v1: {
    brand: "aquacrm",
    propertyId: "aquacrm",
    propertyIds: ["aquacrm", "business-os", "health-check"],
    origins: ["https://aqua-crm.com", "https://www.aqua-crm.com", "https://aquacrm.vercel.app"],
  },
  aqua_public_aquaoasis_web_v1: {
    brand: "aquaoasis-web",
    propertyId: "aquaoasis-web",
    origins: ["https://aquaoasis-web.com", "https://www.aquaoasis-web.com"],
  },
  aqua_public_milesymedia_v1: {
    brand: "milesymedia",
    propertyId: "milesymedia",
    origins: ["https://milesymedia.com", "https://www.milesymedia.com"],
  },
  aqua_public_zimante_group_v1: {
    brand: "zimante-group",
    propertyId: "zimante-group",
    origins: ["https://zimante-group.com", "https://www.zimante-group.com"],
  },
  aqua_public_edward_hallam_v1: {
    brand: "edward-hallam",
    propertyId: "edward-hallam",
    origins: ["https://edward-hallam.com", "https://www.edward-hallam.com"],
  },
} as const;

export type PublicAquaSiteKey = keyof typeof PUBLIC_AQUA_SITES;

export function publicAquaSite(siteKey: string) {
  return PUBLIC_AQUA_SITES[siteKey as PublicAquaSiteKey] ?? null;
}

export function publicAquaPropertyId(siteKey: string, requestedPropertyId: unknown) {
  const site = publicAquaSite(siteKey);
  if (!site) return null;
  const requested = typeof requestedPropertyId === "string" ? requestedPropertyId.trim().slice(0, 120) : "";
  const allowed = "propertyIds" in site ? site.propertyIds as readonly string[] : [site.propertyId];
  return allowed.includes(requested) ? requested : site.propertyId;
}

export function isAllowedPublicSiteOrigin(siteKey: string, origin: string | null) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (
      process.env.NODE_ENV !== "production"
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return true;
    }
  } catch {
    return false;
  }
  const site = publicAquaSite(siteKey);
  return site
    ? (site.origins as readonly string[]).includes(origin.replace(/\/$/, ""))
    : false;
}
