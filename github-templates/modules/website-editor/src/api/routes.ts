// `PluginApiRoute[]` exposed by the website-editor plugin manifest.
//
// All routes mount under `/api/portal/website-editor/<path>` (foundation
// catchall). Tenant comes from the session via `requireRole()`; siteId
// comes from query/body and is validated against clientId in the
// handler scope check.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  handleListPages,
  handleCreatePage,
  handleGetPage,
  handleGetPageBySlug,
  handleUpdatePage,
  handlePublishPage,
  handleRevertPage,
  handleDeletePage,
  handleListPortalVariants,
  handleListAllPortalVariants,
  handleSetActivePortalVariant,
} from "./handlers/pages";
import {
  handleListThemes,
  handleCreateTheme,
  handleGetTheme,
  handleUpdateTheme,
  handleSetDefaultTheme,
  handleDeleteTheme,
} from "./handlers/themes";
import {
  handleGetContent,
  handleSetDraftContent,
  handlePublishContent,
  handleDiscardContent,
  handleRevertContent,
  handleContentDiscovery,
  handlePreviewToken,
  handleContentState,
} from "./handlers/content";
import {
  handleListSites,
  handleGetSite,
  handleCreateSite,
  handleUpdateSite,
  handleDeleteSite,
} from "./handlers/sites";
import {
  handleListEmbeds,
  handleSetEmbeds,
  handleListPublicEmbeds,
  handleGetEmbedTheme,
  handleUpdateEmbedTheme,
} from "./handlers/embeds";
import {
  handleListDiscoveries,
  handleHeartbeat,
  handleDismissDiscovery,
  handleConfirmDiscovery,
  handleConfigStub,
} from "./handlers/discoveries";
import { handlePromote } from "./handlers/promote";
import { handleListAssets, handleUploadAsset, handleDeleteAsset, handleBulkTagAssets } from "./handlers/assets";
import {
  handleListTemplates,
  handleSaveTemplate,
  handleDeleteTemplate,
  handleInstallTick,
  handleGetFeatured,
  handleSetFeatured,
} from "./handlers/templates";
import { handleGetForcePassword, handleSetForcePassword } from "./handlers/forcePassword";
import { handleGetBrandKitExtended, handleSaveBrandKitExtended } from "./handlers/brandKit";
import { handleGetEmbedAllowList, handleSetEmbedAllowList } from "./handlers/embedAllow";
import { handleOgCard } from "./handlers/seoMeta";
import {
  handleAdvancedSitemapXml,
  handleAdvancedRobotsTxt,
  handleLocaleSitemapXml,
} from "./handlers/sitemapHostRoutes";
import {
  handleFormSubmit,
  handleListFormWebhookLog,
} from "./handlers/formSubmissionHost";
import {
  handleSaveVersion,
  handleListVersions,
  handleGetVersion,
  handleDeleteVersion,
  handleRenameVersion,
} from "./handlers/pageVersions";
import {
  handleListRedirects,
  handleAddRedirect,
  handleRemoveRedirect,
  handleResolveRedirect,
} from "./handlers/redirects";
import {
  handleSetPagePrivacy,
  handleUnlockPage,
} from "./handlers/pagePrivacy";
import {
  handleListComponents,
  handleGetComponent,
  handleCreateComponent,
  handleUpdateComponent,
  handleDeleteComponent,
} from "./handlers/components";
import { handleGetCustomCode, handleSetCustomCode } from "./handlers/customCode";
import {
  handleListBlogPosts,
  handleGetBlogPost,
  handleGetBlogPostBySlug,
  handleCreateBlogPost,
  handleUpdateBlogPost,
  handleDeleteBlogPost,
} from "./handlers/blog";

export const apiRoutes: PluginApiRoute[] = [
  // Pages
  { path: "/pages", methods: ["GET"], handler: handleListPages },
  { path: "/pages", methods: ["POST"], handler: handleCreatePage },
  { path: "/pages/get", methods: ["GET"], handler: handleGetPage },
  { path: "/pages/by-slug", methods: ["GET"], handler: handleGetPageBySlug },
  { path: "/pages", methods: ["PATCH"], handler: handleUpdatePage },
  { path: "/pages/publish", methods: ["POST"], handler: handlePublishPage },
  { path: "/pages/revert", methods: ["POST"], handler: handleRevertPage },
  { path: "/pages", methods: ["DELETE"], handler: handleDeletePage },
  { path: "/portal-variants", methods: ["GET"], handler: handleListPortalVariants },
  { path: "/portal-variants/all", methods: ["GET"], handler: handleListAllPortalVariants },
  { path: "/portal-variants/active", methods: ["POST"], handler: handleSetActivePortalVariant },

  // Themes
  { path: "/themes", methods: ["GET"], handler: handleListThemes },
  { path: "/themes", methods: ["POST"], handler: handleCreateTheme },
  { path: "/themes/get", methods: ["GET"], handler: handleGetTheme },
  { path: "/themes", methods: ["PATCH"], handler: handleUpdateTheme },
  { path: "/themes/default", methods: ["POST"], handler: handleSetDefaultTheme },
  { path: "/themes", methods: ["DELETE"], handler: handleDeleteTheme },

  // Content
  { path: "/content", methods: ["GET"], handler: handleGetContent },
  { path: "/content/draft", methods: ["POST"], handler: handleSetDraftContent },
  { path: "/content/publish", methods: ["POST"], handler: handlePublishContent },
  { path: "/content/discard", methods: ["POST"], handler: handleDiscardContent },
  { path: "/content/revert", methods: ["POST"], handler: handleRevertContent },
  { path: "/content/discovery", methods: ["POST"], handler: handleContentDiscovery },
  { path: "/content/preview-token", methods: ["POST"], handler: handlePreviewToken },
  { path: "/content/state", methods: ["GET"], handler: handleContentState },

  // Sites
  { path: "/sites", methods: ["GET"], handler: handleListSites },
  { path: "/sites", methods: ["POST"], handler: handleCreateSite },
  { path: "/sites/get", methods: ["GET"], handler: handleGetSite },
  { path: "/sites", methods: ["PATCH"], handler: handleUpdateSite },
  { path: "/sites", methods: ["DELETE"], handler: handleDeleteSite },

  // Embeds + embed-theme
  { path: "/embeds", methods: ["GET"], handler: handleListEmbeds },
  { path: "/embeds", methods: ["PUT"], handler: handleSetEmbeds },
  { path: "/embeds/public", methods: ["GET"], handler: handleListPublicEmbeds },
  { path: "/embed-theme", methods: ["GET"], handler: handleGetEmbedTheme },
  { path: "/embed-theme", methods: ["PUT"], handler: handleUpdateEmbedTheme },

  // Discoveries
  { path: "/discoveries", methods: ["GET"], handler: handleListDiscoveries },
  { path: "/discoveries/heartbeat", methods: ["POST"], handler: handleHeartbeat },
  { path: "/discoveries/dismiss", methods: ["POST"], handler: handleDismissDiscovery },
  { path: "/discoveries/confirm", methods: ["POST"], handler: handleConfirmDiscovery },

  // Config snapshot used by storefront overlay
  { path: "/config", methods: ["GET"], handler: handleConfigStub },

  // Promote (GitHub PR)
  { path: "/promote", methods: ["POST"], handler: handlePromote },

  // Assets — Round-1 stubs (R024 extends with tags + bulk-tag).
  { path: "/assets", methods: ["GET"], handler: handleListAssets },
  { path: "/assets", methods: ["POST"], handler: handleUploadAsset },
  { path: "/assets", methods: ["DELETE"], handler: handleDeleteAsset },
  { path: "/assets/bulk-tag", methods: ["POST"], handler: handleBulkTagAssets },

  // Template marketplace (R006) — builtin gallery + per-agency saved.
  { path: "/templates", methods: ["GET"], handler: handleListTemplates },
  { path: "/templates", methods: ["POST"], handler: handleSaveTemplate },
  { path: "/templates", methods: ["DELETE"], handler: handleDeleteTemplate },
  { path: "/templates/install-tick", methods: ["POST"], handler: handleInstallTick },
  { path: "/templates/featured", methods: ["GET"], handler: handleGetFeatured },
  { path: "/templates/featured", methods: ["POST"], handler: handleSetFeatured },

  // Force-password-change toggle (R007). Login-time redirect itself
  // is foundation/T1 territory; these endpoints surface the flag.
  { path: "/users/force-password", methods: ["GET"], handler: handleGetForcePassword },
  { path: "/users/force-password", methods: ["POST"], handler: handleSetForcePassword },

  // Blog (R008) — admin CRUD + public-by-slug for storefront blocks.
  { path: "/blog/posts", methods: ["GET"], handler: handleListBlogPosts },
  { path: "/blog/posts/get", methods: ["GET"], handler: handleGetBlogPost },
  { path: "/blog/posts/by-slug", methods: ["GET"], handler: handleGetBlogPostBySlug },
  { path: "/blog/posts", methods: ["POST"], handler: handleCreateBlogPost },
  { path: "/blog/posts", methods: ["PATCH"], handler: handleUpdateBlogPost },
  { path: "/blog/posts", methods: ["DELETE"], handler: handleDeleteBlogPost },

  // Brand-kit extended fields (R011) — per-install bg/text/border/
  // radius scale / darkMode hint. Foundation owns the primary /
  // secondary / accent / fonts.
  { path: "/brand-kit/extended", methods: ["GET"], handler: handleGetBrandKitExtended },
  { path: "/brand-kit/extended", methods: ["POST"], handler: handleSaveBrandKitExtended },

  // Embed allow-list (R013) — per-client list of origins permitted
  // to iframe the customer surface. Foundation middleware reads this
  // to emit `frame-ancestors` CSP on `/embed/[clientSlug]/[variant]`.
  { path: "/embed/allowed-origins", methods: ["GET"], handler: handleGetEmbedAllowList },
  { path: "/embed/allowed-origins", methods: ["POST"], handler: handleSetEmbedAllowList },

  // SEO + sitemap + OG card. XML/text/SVG responses, not JSON.
  // R044 swaps R014's narrow handlers on /sitemap.xml + /robots.txt for
  // R036's advanced generators (changefreq + priority + per-locale
  // alternates + redirect-source filter). R014 helpers stay exported
  // from `handlers/seoMeta.ts` for the static-export pipeline (R033).
  { path: "/sitemap.xml", methods: ["GET"], handler: handleAdvancedSitemapXml },
  { path: "/sitemap-:locale.xml", methods: ["GET"], handler: handleLocaleSitemapXml },
  { path: "/robots.txt", methods: ["GET"], handler: handleAdvancedRobotsTxt },
  { path: "/og", methods: ["GET"], handler: handleOgCard },

  // R047 — Form submission host route + webhook-log listing.
  { path: "/forms/submit", methods: ["POST"], handler: handleFormSubmit },
  { path: "/forms/webhook-log", methods: ["GET"], handler: handleListFormWebhookLog },

  // Page versions (R022) — auto-save + named checkpoints.
  { path: "/pages/versions", methods: ["GET"], handler: handleListVersions },
  { path: "/pages/versions/get", methods: ["GET"], handler: handleGetVersion },
  { path: "/pages/versions", methods: ["POST"], handler: handleSaveVersion },
  { path: "/pages/versions", methods: ["PATCH"], handler: handleRenameVersion },
  { path: "/pages/versions", methods: ["DELETE"], handler: handleDeleteVersion },

  // Redirects (R025) — slug aliases with 301 semantics, capped at 100.
  { path: "/redirects", methods: ["GET"], handler: handleListRedirects },
  { path: "/redirects", methods: ["POST"], handler: handleAddRedirect },
  { path: "/redirects", methods: ["DELETE"], handler: handleRemoveRedirect },
  { path: "/redirects/resolve", methods: ["GET"], handler: handleResolveRedirect },

  // Page privacy (R026) — public/unlisted/password/members-only.
  { path: "/pages/privacy", methods: ["POST"], handler: handleSetPagePrivacy },
  { path: "/pages/privacy/unlock", methods: ["POST"], handler: handleUnlockPage },

  // Components (R028) — reusable block-group components.
  { path: "/components", methods: ["GET"], handler: handleListComponents },
  { path: "/components/get", methods: ["GET"], handler: handleGetComponent },
  { path: "/components", methods: ["POST"], handler: handleCreateComponent },
  { path: "/components", methods: ["PATCH"], handler: handleUpdateComponent },
  { path: "/components", methods: ["DELETE"], handler: handleDeleteComponent },

  // Custom code (R029) — per-variant CSS + head fragment.
  { path: "/pages/custom-code", methods: ["GET"], handler: handleGetCustomCode },
  { path: "/pages/custom-code", methods: ["POST"], handler: handleSetCustomCode },
];
