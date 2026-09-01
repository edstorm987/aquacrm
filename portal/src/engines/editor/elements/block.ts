// Element — the leaf unit of a page tree. THE canonical declaration.
//
// This module used to live at
// `src/built-ins/modules/website-editor/src/types/block.ts`. It moved here in
// P1 of the element engine because three surfaces need the same vocabulary —
// the public website, the client portal, and product lifecycle stages — and
// only one of them is a plugin. The plugin re-exports every name below from its
// old path verbatim, so no import site changed when this moved.
//
// Naming: `Element`/`ElementDefinition` are the forward-looking names and
// `Block`/`BlockDefinition` are exported aliases of exactly the same types, so
// the 78 shipped block components keep compiling untouched. Both spellings are
// the same type — not two shapes to keep in sync.
//
// `type` remains an open string so other plugins (ecommerce, blog, etc.)
// can extend the registry. The website-editor plugin contributes the
// canonical block types; their values are aliased in `BlockType` for
// in-tree references.
//
// HAZARD: this module must stay dependency-free at runtime. It is imported by
// client components and by code that runs under `--conditions react-server`.
// Type-only imports (erased by `isolatedModules`) are fine; a value import of
// anything server-side is not, and `import "server-only"` never belongs here.

import type {
  ClientPortalBlockDataSource,
  ClientPortalBlockVisibilityRule,
  ClientPortalPageBlock,
} from "@/server/types";

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

// ─── Surface side-channels (P2, all optional) ─────────────────────────────
//
// A website element is `props → JSX`. A portal element is
// `props + this client's live records → JSX`. The two extra inputs a portal
// element needs are deliberately NOT stuffed into `props`:
//
//  • `binding`    — WHICH records this element reads. Authored, stored in the
//                   tree, travels with a published template.
//  • `visibility` — WHO sees it. Also authored, also in the tree.
//  • `context`    — the records themselves, supplied at render time by the
//                   host. Never stored. See `BlockRenderProps.context` in
//                   `./definition`.
//
// Keeping them off `props` means `defaultProps` schema validation stays about
// authored copy, and a `productIds` array can never be mistaken for a prop a
// component is supposed to render.

/** How wide a product match has to be for a bound/gated element to apply. */
export type ElementProductMatch = "any" | "all";

/**
 * Where an element's live data comes from.
 *
 * Mirrors the fields the portal builder stores today on
 * `ClientPortalPageBlock` (`dataSource` / `requestType` / `approvalType` /
 * `uploadCategory` / `productIds` / `productMatch`) so P3 can move a stored
 * portal block onto an Element losslessly. Every member is optional: a website
 * element simply has no `binding` at all.
 */
export interface ElementBinding {
  source?: ClientPortalBlockDataSource;
  requestType?: NonNullable<ClientPortalPageBlock["requestType"]>;
  approvalType?: NonNullable<ClientPortalPageBlock["approvalType"]>;
  uploadCategory?: NonNullable<ClientPortalPageBlock["uploadCategory"]>;
  productIds?: string[];
  productMatch?: ElementProductMatch;
}

/**
 * Audience gating for an element.
 *
 * Portal-only by design (§3.4 of the element-engine design): a `visibility`
 * rule on a public marketing page is a security smell, not a feature, so the
 * website renderer never consults this. It rides on the element rather than on
 * `props` for the same reason as `binding`.
 */
export interface ElementVisibility {
  rule: ClientPortalBlockVisibilityRule;
  productIds?: string[];
  productMatch?: ElementProductMatch;
}

/**
 * The live data channel handed to a renderer.
 *
 * NON-NEGOTIABLE part of P2 (design §2.2): without it, the 14 data-bound
 * portal blocks become static placeholders the moment they join the shared
 * registry in P3. It ships now, optional and unread, so that P3 is a wiring
 * job rather than a re-typing job.
 *
 * `records` is deliberately a loose bag rather than a closed union. The portal
 * surfaces that will fill it (summary / delivery / billing / results feeds)
 * each have their own record shapes and live behind server modules this
 * dependency-free module must not import. P3 narrows it per-surface at the
 * point of use.
 *
 * NOTE what is NOT here: per-client STATE. Checklist ticks, approvals and
 * upload progress live in `PortalProductWorkspace`, keyed by
 * `(clientId, productId, elementId)`. If they ever entered the tree,
 * publishing a template would overwrite live client progress.
 */
export interface ElementContext {
  agencyId: string;
  clientId?: string;
  /** Published website identity used by visitor-safe server facades. */
  siteId?: string;
  pageId?: string;
  /**
   * True only when the host is rendering an actually published website.
   * Editor canvases and draft previews carry the same ids for fidelity but
   * must not turn visitor blocks into live mutation surfaces.
   */
  publishedWebsite?: boolean;
  productId?: string;
  stageId?: string;
  records?: Record<string, unknown>;
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
  /** P2 — data source side-channel. Portal surfaces only; undefined on websites. */
  binding?: ElementBinding;
  /** P2 — audience side-channel. Portal surfaces only; undefined on websites. */
  visibility?: ElementVisibility;
}

/** Forward-looking spelling. Identical type, not a second shape. */
export type Element = Block;
export type ElementType = BlockType;
export type ElementStyles = BlockStyles;

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
export type ElementTreeJSON = BlockTreeJSON;
