// Public component-side surface for `@aqua/plugin-website-editor/components`.
//
// Round-2 surface mirrors 02's editor module exports: the renderer takes
// `blocks: Block[]` (not a single `block`); helpers are the lifted
// versions; the registry is BlockDefinition-shaped with a derived
// BlockDescriptor[] for the manifest.

export { default as BlockRenderer, BlockTreeRenderer } from "./BlockRenderer";
export type { BlockRendererProps } from "./BlockRenderer";
export {
  BLOCK_REGISTRY,
  BLOCK_DESCRIPTORS,
  BLOCK_TYPES,
  RENDERER_REGISTRATIONS,
  getBlockDefinition,
  getBlockRenderer,
  listBlockDefinitions,
  listBlocksByCategory,
  getBlockEntry,
  getBlockDescriptor,
  registerExternalBlockRenderers,
} from "./blockRegistry";
export type {
  BlockComponentProps,
  BlockComponentType,
  BlockRegistryEntry,
  BlockRenderProps,
  BlockDefinition,
  PropField,
  PropFieldType,
} from "./blockRegistry";
export { default as AnimateOnScroll } from "./AnimateOnScroll";
export { default as AssetPicker } from "./AssetPicker";
export { tokensToCssVars, tokensToCssVarsClient } from "./themeCss";
export {
  blockStylesToCss,
  overridesToCssText,
  STYLE_FIELD_GROUPS,
} from "./blockStyles";
export {
  resolveVariant,
  applyVariant,
  recordExposure,
  recordConversion,
  visitorId,
  sessionId,
} from "./variantResolver";
export type { ResolvedVariant } from "./variantResolver";
export { PAGE_TEMPLATES, getTemplate } from "./pageTemplates";
export type { PageTemplate } from "./pageTemplates";
export {
  useCatalog,
  useProductByHandle,
  useProductsByRange,
  fetchCatalog,
  formatPrice,
  invalidateCatalogCache,
  useProducts,
} from "./useProducts";
export type { CatalogProduct } from "./useProducts";
export {
  useCart,
  setCartProvider,
  default as ProductVariantPicker,
} from "./ecommerceBridge";
export type {
  CartItem,
  CartSnapshot,
  Product,
  ProductVariant,
  ResolvedVariant as EcommerceResolvedVariant,
  VariantPickerState,
  ProductVariantPickerProps,
} from "./ecommerceBridge";

// Storefront overlay
export { PortalEditOverlay } from "./storefront/PortalEditOverlay";
export { PortalPageRenderer } from "./storefront/PortalPageRenderer";
export { PreviewBar } from "./storefront/PreviewBar";
export { SiteResolver } from "./storefront/SiteResolver";
export { SiteUX } from "./storefront/SiteUX";
export { SiteHead } from "./storefront/SiteHead";
export { EditorThemeInjector } from "./storefront/EditorThemeInjector";
