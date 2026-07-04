// Centralised PluginStorage key paths for the website-editor plugin.
//
// Every key is namespaced by `agencyId/clientId` so the foundation's
// per-install storage scopes work cleanly. Per architecture §6, every
// read/write must thread tenant identifiers; centralising here makes
// the boundary inspection trivial during code review.

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PortalRole } from "../lib/portalRole";

const T = (agencyId: AgencyId, clientId: ClientId) => `t/${agencyId}/${clientId}`;

export const storageKeys = {
  // Sites — one row per (agencyId, clientId, siteId).
  siteIndex: (a: AgencyId, c: ClientId) => `${T(a, c)}/sites/index`,
  site: (a: AgencyId, c: ClientId, siteId: string) => `${T(a, c)}/sites/${siteId}`,
  defaultSiteId: (a: AgencyId, c: ClientId) => `${T(a, c)}/sites/_default`,

  // Pages — keyed by (siteId, pageId). Stored under the tenant prefix
  // to satisfy `WHERE agencyId = ? AND clientId = ?` queries cleanly.
  pageIndex: (a: AgencyId, c: ClientId, siteId: string) => `${T(a, c)}/pages/${siteId}/index`,
  page: (a: AgencyId, c: ClientId, siteId: string, pageId: string) =>
    `${T(a, c)}/pages/${siteId}/${pageId}`,

  // Portal-variant active pointers — singleton-enforced per (siteId, role).
  activeVariant: (a: AgencyId, c: ClientId, siteId: string, role: PortalRole) =>
    `${T(a, c)}/portals/${siteId}/${role}/active`,

  // Themes — keyed per (siteId, themeId).
  themeIndex: (a: AgencyId, c: ClientId, siteId: string) => `${T(a, c)}/themes/${siteId}/index`,
  theme: (a: AgencyId, c: ClientId, siteId: string, themeId: string) =>
    `${T(a, c)}/themes/${siteId}/${themeId}`,
  defaultThemeId: (a: AgencyId, c: ClientId, siteId: string) =>
    `${T(a, c)}/themes/${siteId}/_default`,

  // Content overrides — single state blob per (siteId).
  contentState: (a: AgencyId, c: ClientId, siteId: string) =>
    `${T(a, c)}/content/${siteId}`,

  // Embeds + embed theme.
  embeds: (a: AgencyId, c: ClientId, siteId: string) => `${T(a, c)}/embeds/${siteId}`,
  embedTheme: (a: AgencyId, c: ClientId, siteId: string) =>
    `${T(a, c)}/embed-theme/${siteId}`,

  // Blog posts (R008) — keyed per (siteId, postId). Slug index keeps
  // slug→id lookups cheap for `/blog/[slug]` route resolution.
  blogIndex: (a: AgencyId, c: ClientId, siteId: string) => `${T(a, c)}/blog/${siteId}/index`,
  blogPost: (a: AgencyId, c: ClientId, siteId: string, postId: string) =>
    `${T(a, c)}/blog/${siteId}/${postId}`,
  blogSlugIndex: (a: AgencyId, c: ClientId, siteId: string) =>
    `${T(a, c)}/blog/${siteId}/_slug-index`,

  // Discovery (host-scoped — agency-wide).
  discoveries: (a: AgencyId) => `t/${a}/_discoveries/index`,
  discovery: (a: AgencyId, host: string) => `t/${a}/_discoveries/${encodeURIComponent(host)}`,
};
