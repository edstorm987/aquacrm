// Public server-side surface for `@aqua/plugin-website-editor/server`.

export {
  applyStarterVariant,
  listVariantsForPortal,
  getActivePortalVariant,
  setActivePortalVariant,
} from "./portalVariants";

export type {
  ApplyStarterVariantInput,
  ApplyStarterVariantResult,
} from "./portalVariants";

export type { PortalVariantPort } from "./ports";

export {
  listPages,
  getPage,
  getPageBySlug,
  createPage,
  updatePage,
  publishPage,
  revertPage,
  deletePage,
} from "./pages";

export {
  listSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  getOrCreateDefaultSite,
} from "./sites";

export {
  listThemes,
  getTheme,
  getDefaultTheme,
  createTheme,
  updateTheme,
  setDefaultTheme,
  deleteTheme,
} from "./themes";

export {
  getContentState,
  getPublicOverrides,
  getPreviewOverrides,
  setDraftOverrides,
  publishDraft,
  discardDraft,
  revertToSnapshot,
  recordDiscovered,
} from "./content";

export { getEmbeds, setEmbeds, getEmbed, getPublicEmbeds } from "./embeds";
export { getEmbedThemeCss, updateEmbedTheme } from "./embedTheme";
export { mintPreviewToken, verifyPreviewToken } from "./preview";
export {
  listDiscoveries,
  getDiscovery,
  recordHeartbeat,
  dismissDiscovery,
  confirmDiscovery,
} from "./discovery";

export { listStarterIds, loadStarterTree } from "./starterLoader";
export type { StarterTreeFile } from "./starterLoader";

export { storageKeys } from "./storage-keys";
