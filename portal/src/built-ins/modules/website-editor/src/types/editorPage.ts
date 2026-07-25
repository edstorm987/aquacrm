// EditorPage — primary unit of the website editor. Adapted from
// `02 felicias aqua portal work/src/portal/server/types.ts` and
// re-scoped for 04's three-tier tenancy:
// - 02: keyed by `siteId`
// - 04: still keyed by `siteId`, but every Site row carries
//   `{ agencyId, clientId }` so queries can be tenant-scoped.
//
// Round-2 widening: extra fields (`publishedBlocks`, `customHead`,
// `customFoot`, `customCss`, `seo`) lifted from 02 so the visual editor
// admin page (`pages/EditorPage.tsx`) compiles unchanged.

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PortalRole } from "../lib/portalRole";
import type { Block } from "./block";

export type EditorPageStatus = "draft" | "published";

// R026 — Per-page privacy. Storefront enforces; editor surfaces
// toggle + password input.
export type EditorPagePrivacy = "public" | "unlisted" | "password" | "members-only";

// Per-page SEO meta — JSON-LD + Open Graph fragments injected at render.
export interface EditorPageSeo {
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  schemaJsonLd?: string;
  noIndex?: boolean;
  // R014 — SEO surface completion.
  canonical?: string;        // explicit canonical URL (defaults to page absolute URL)
  keywords?: string[];       // optional keyword list, comma-joined for the meta tag
}

export interface EditorPage {
  id: string;
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;

  slug: string;
  title: string;
  description?: string;

  status: EditorPageStatus;
  isHomepage?: boolean;

  // R026 — Privacy gate. Defaults to "public" when absent.
  // `passwordHash` only set when privacy === "password"; computed
  // server-side when operator sets a fresh password (the editor
  // never persists raw passwords).
  privacy?: EditorPagePrivacy;
  passwordHash?: string;


  // Portal-variant identity. When set, the page is one of (potentially many)
  // candidates for the customer-facing route at this role. Exactly zero or
  // one variant per (siteId, role) may have `isActivePortal=true`.
  portalRole?: PortalRole;
  isActivePortal?: boolean;
  variantId?: string;

  blocks: Block[];
  draftBlocks?: Block[];
  // Last-published snapshot. Lets the runtime serve the published
  // version even while the admin edits a draft, and lets the editor
  // revert.
  publishedBlocks?: Block[];

  themeId?: string;
  // Page-level custom CSS — both Round-1 alias `customCSS` and 02's
  // `customCss` resolve to the same render output.
  customCSS?: string;
  customCss?: string;
  customHead?: string;
  customFoot?: string;
  headInjection?: string;
  layoutOverrides?: Record<string, unknown>;
  seo?: EditorPageSeo;

  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

export interface CreatePageInput {
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;
  slug?: string;
  title: string;
  description?: string;
  blocks?: Block[];
  portalRole?: PortalRole;
  isActivePortal?: boolean;
  variantId?: string;
  themeId?: string;
  isHomepage?: boolean;
}

export interface UpdatePagePatch {
  title?: string;
  slug?: string;
  description?: string;
  blocks?: Block[];
  draftBlocks?: Block[];
  publishedBlocks?: Block[];
  themeId?: string;
  customCSS?: string;
  customCss?: string;
  customHead?: string;
  customFoot?: string;
  headInjection?: string;
  layoutOverrides?: Record<string, unknown>;
  portalRole?: PortalRole;
  isActivePortal?: boolean;
  isHomepage?: boolean;
  seo?: EditorPageSeo;
  // R026 — Privacy patches (raw passwords never accepted here; the
  // pagePrivacy handler hashes server-side before threading through).
  privacy?: EditorPagePrivacy;
  passwordHash?: string;
}
