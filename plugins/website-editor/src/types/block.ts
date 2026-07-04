// Block — leaf unit of an EditorPage tree.
//
// Faithful port of `02 felicias aqua portal work/src/portal/server/types.ts`
// (sections covering Block, BlockStyles, BlockVariant, BlockA11y, BlockSeo,
// SplitTestGroup, SplitTestStatus, SplitTestResult). The plugin re-exports
// these so the lifted block components and renderer can import from
// `@plugin/types/block` without touching the foundation type module.
//
// `type` remains an open string so other plugins (ecommerce, blog, etc.)
// can extend the registry. The website-editor plugin contributes the
// canonical 58 types; their values are aliased in `BlockType` for
// in-tree references.

export type BlockType =
  // layout
  | "container" | "section" | "row" | "column" | "grid" | "spacer" | "divider"
  // content
  | "heading" | "text" | "button" | "hero" | "cta" | "testimonials"
  | "pricing-table" | "faq" | "quote" | "banner" | "author-bio" | "stats-bar"
  | "logo-grid" | "feature-grid" | "tabs" | "accordion" | "card-grid"
  | "property-strip" | "toggle"
  | "footer" | "navbar" | "timeline" | "form" | "contact-form"
  // media
  | "image" | "video" | "video-embed" | "icon" | "gallery" | "map" | "before-after" | "marquee"
  // commerce
  | "product-card" | "product-grid" | "collection-grid" | "cart-summary"
  | "checkout-summary" | "payment-button" | "order-success" | "variant-picker"
  | "product-search" | "donation-button" | "booking-widget"
  // auth
  | "login-form" | "signup-form" | "theme-selector" | "social-auth" | "member-gate"
  // advanced
  | "html" | "countdown-timer" | "language-switcher" | "newsletter-signup"
  | "app-showcase" | "social-proof-bar"
  // open extension
  | (string & {});

// Per-block style overrides. Optional — empty object means inherit. The
// renderer maps these to inline styles so the editor preview matches the
// host site exactly without per-block CSS classes.
export interface BlockStyles {
  padding?: string;
  margin?: string;
  background?: string;
  textColor?: string;
  align?: "left" | "center" | "right";
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  borderRadius?: string;
  border?: string;
  boxShadow?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string | number;
  lineHeight?: string | number;
  letterSpacing?: string;
  display?: "block" | "flex" | "grid" | "inline-block";
  flexDirection?: "row" | "column";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  gap?: string;
  gridTemplateColumns?: string;
  customCss?: string;
  // Responsive overrides
  mobile?: Partial<Omit<BlockStyles, "mobile" | "tablet" | "animate">>;
  tablet?: Partial<Omit<BlockStyles, "mobile" | "tablet" | "animate">>;
  // R019 — per-viewport visibility toggles. When true, the renderer
  // omits the block from the matching viewport. Foundation respects
  // these in storefront render; editor preview honours them when
  // the matching viewport is active so operators see what end-users
  // see.
  hideOnDesktop?: boolean;
  hideOnTablet?: boolean;
  hideOnMobile?: boolean;
  // On-scroll entrance animation
  animate?: "fade-in" | "slide-up" | "slide-left" | "slide-right" | "zoom-in" | "rotate-in" | "blur-in";
  animateDuration?: string;
  animateDelay?: string;
  animateEasing?: string;
}

export interface BlockA11y {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  role?: string;
  ariaHidden?: boolean;
  alt?: string;
  tabIndex?: number;
  htmlId?: string;
}

export interface BlockSeo {
  schemaType?: string;
  schemaProps?: Record<string, unknown>;
}

export interface BlockVariant {
  id: string;
  name: string;
  props?: Record<string, unknown>;
  styles?: BlockStyles;
  weight?: number;
}

export interface Block {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  styles?: BlockStyles;
  children?: Block[];
  a11y?: BlockA11y;
  seo?: BlockSeo;
  themeStyles?: Record<string, BlockStyles>;
  variantsByGroup?: Record<string, BlockVariant[]>;
}

export type SplitTestStatus = "draft" | "running" | "paused" | "completed";

export interface SplitTestGroup {
  id: string;
  siteId: string;
  name: string;
  description?: string;
  status: SplitTestStatus;
  startedAt?: number;
  endsAt?: number;
  trafficPercent?: number;
  stickyBy?: "visitor" | "session";
  goalEvent?: string;
  blockRefs?: Array<{ pageId: string; blockId: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface SplitTestResult {
  groupId: string;
  variantId: string;
  exposures: number;
  conversions: number;
  updatedAt: number;
}

export type BlockTreeJSON = Block[];
