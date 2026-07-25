// Site — a tenant's website. In 02 keyed by `siteId` only; in 04 every
// Site row carries `agencyId + clientId` so queries scope through the
// foundation's `requireRole()` session.
//
// Field set mirrors 02's `src/lib/admin/sites.ts` Site interface so the
// lifted editor admin pages compile without bespoke patches.

import type { AgencyId, ClientId, EntityStatus } from "../lib/tenancy";

export interface SiteSocialHandles {
  instagram?: string;
  twitter?: string;
  tiktok?: string;
}

export interface Site {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  slug: string;
  // Domains that should resolve to this site. `customDomain` is the
  // legacy single-value field; `domains[]` matches 02 + supports host
  // multi-mapping.
  customDomain?: string;
  domains?: string[];
  primaryDomain?: string;
  // Branding
  logoUrl?: string;
  faviconUrl?: string;
  tagline?: string;
  description?: string;
  themeVariantId?: string;
  defaultThemeId?: string;
  // Per-site UX toggles (X-1)
  smoothScroll?: boolean;
  customCursor?: "default" | "dot" | "ring" | "blur";
  cursorColor?: string;
  // Custom head/body code (P-3)
  customHead?: string;
  customBody?: string;
  // SEO sitelinks JSON-LD
  siteNavigationJsonLd?: string;
  // Catalog scoping
  enabledProductRanges?: string[];
  socialHandles?: SiteSocialHandles;
  // Identity
  isPrimary?: boolean;
  status: EntityStatus | "draft" | "live";
  createdAt: number;
  updatedAt: number;
  publishedSnapshotAt?: number;
}

export interface CreateSiteInput {
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  slug?: string;
  defaultThemeId?: string;
  domains?: string[];
  tagline?: string;
}

export interface UpdateSitePatch {
  name?: string;
  slug?: string;
  customDomain?: string;
  domains?: string[];
  primaryDomain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  tagline?: string;
  description?: string;
  themeVariantId?: string;
  defaultThemeId?: string;
  smoothScroll?: boolean;
  customCursor?: "default" | "dot" | "ring" | "blur";
  cursorColor?: string;
  customHead?: string;
  customBody?: string;
  siteNavigationJsonLd?: string;
  enabledProductRanges?: string[];
  socialHandles?: SiteSocialHandles;
  isPrimary?: boolean;
  status?: EntityStatus | "draft" | "live";
}
