// Block registry for the visual editor.
//
// Faithful port of `02/src/components/editor/blockRegistry.ts`, with
// the auth category preserved (login/signup/social/theme-selector/
// member-gate are surfaced under "auth" in the editor's block-library
// sidebar even though 02 grouped some of them under "content").
//
// Maps each BlockType to:
//   - the React component that renders it
//   - the default props for newly inserted blocks
//   - a property-panel schema (which fields the editor exposes)
//   - an icon + label for the block library sidebar
//
// Adding a new block type: add it to BlockType in `../types/block.ts`,
// add the component file under `./blocks/`, and append a registry entry
// here. The plugin manifest derives `BlockDescriptor[]` from this map
// via `BLOCK_DESCRIPTORS`.

import type { ComponentType, ReactNode } from "react";
import type { Block, BlockType } from "../types/block";
import type { BlockDescriptor, BlockCategory } from "../lib/aquaPluginTypes";

// ─── Block component imports (all default exports per 02) ──────────────────

import AccordionBlock from "./blocks/AccordionBlock";
import AppShowcaseBlock from "./blocks/AppShowcaseBlock";
import AuthorBioBlock from "./blocks/AuthorBioBlock";
import BannerBlock from "./blocks/BannerBlock";
import CookieConsentBlock from "./blocks/CookieConsentBlock";
import BlogFeedBlock from "./blocks/BlogFeedBlock";
import BlogPostBlock from "./blocks/BlogPostBlock";
import FormEmbedBlock from "./blocks/FormEmbedBlock";
import FeatureComparisonBlock from "./blocks/FeatureComparisonBlock";
import TeamGridBlock from "./blocks/TeamGridBlock";
import BreadcrumbBlock from "./blocks/BreadcrumbBlock";
import ProcessStepsBlock from "./blocks/ProcessStepsBlock";
import ShareButtonsBlock from "./blocks/ShareButtonsBlock";
import BeforeAfterBlock from "./blocks/BeforeAfterBlock";
import BookingWidgetBlock from "./blocks/BookingWidgetBlock";
import ButtonBlock from "./blocks/ButtonBlock";
import CardGridBlock from "./blocks/CardGridBlock";
import CartSummaryBlock from "./blocks/CartSummaryBlock";
import CheckoutSummaryBlock from "./blocks/CheckoutSummaryBlock";
import CollectionGridBlock from "./blocks/CollectionGridBlock";
import ColumnBlock from "./blocks/ColumnBlock";
import ContactFormBlock from "./blocks/ContactFormBlock";
import ContainerBlock from "./blocks/ContainerBlock";
import CountdownTimerBlock from "./blocks/CountdownTimerBlock";
import CtaBlock from "./blocks/CtaBlock";
import DividerBlock from "./blocks/DividerBlock";
import DonationButtonBlock from "./blocks/DonationButtonBlock";
import FaqBlock from "./blocks/FaqBlock";
import FeatureGridBlock from "./blocks/FeatureGridBlock";
import FooterBlock from "./blocks/FooterBlock";
import FormBlock from "./blocks/FormBlock";
import GalleryBlock from "./blocks/GalleryBlock";
import GridBlock from "./blocks/GridBlock";
import HeadingBlock from "./blocks/HeadingBlock";
import HeroBlock from "./blocks/HeroBlock";
import HtmlBlock from "./blocks/HtmlBlock";
import IconBlock from "./blocks/IconBlock";
import ImageBlock from "./blocks/ImageBlock";
import LanguageSwitcherBlock from "./blocks/LanguageSwitcherBlock";
import LoginFormBlock from "./blocks/LoginFormBlock";
import LogoGridBlock from "./blocks/LogoGridBlock";
import MapBlock from "./blocks/MapBlock";
import MarqueeBlock from "./blocks/MarqueeBlock";
import MemberGateBlock from "./blocks/MemberGateBlock";
import NavbarBlock from "./blocks/NavbarBlock";
import NewsletterSignupBlock from "./blocks/NewsletterSignupBlock";
import OrderSuccessBlock from "./blocks/OrderSuccessBlock";
import PropertyStripBlock from "./blocks/PropertyStripBlock";
import ToggleBlock from "./blocks/ToggleBlock";
import PaymentButtonBlock from "./blocks/PaymentButtonBlock";
import PricingTableBlock from "./blocks/PricingTableBlock";
import ProductCardBlock from "./blocks/ProductCardBlock";
import ProductGridBlock from "./blocks/ProductGridBlock";
import ProductSearchBlock from "./blocks/ProductSearchBlock";
import QuoteBlock from "./blocks/QuoteBlock";
import RowBlock from "./blocks/RowBlock";
import SectionBlock from "./blocks/SectionBlock";
import SignupFormBlock from "./blocks/SignupFormBlock";
import SocialAuthBlock from "./blocks/SocialAuthBlock";
import SocialProofBarBlock from "./blocks/SocialProofBarBlock";
import SpacerBlock from "./blocks/SpacerBlock";
import StatsBarBlock from "./blocks/StatsBarBlock";
import TabsBlock from "./blocks/TabsBlock";
import TestimonialsBlock from "./blocks/TestimonialsBlock";
import TextBlock from "./blocks/TextBlock";
import ThemeSelectorBlock from "./blocks/ThemeSelectorBlock";
import TimelineBlock from "./blocks/TimelineBlock";
import VariantPickerBlock from "./blocks/VariantPickerBlock";
import VideoBlock from "./blocks/VideoBlock";
import VideoEmbedBlock from "./blocks/VideoEmbedBlock";

// ─── External-plugin block renderers (registered by this plugin) ──────────
// T2's @aqua/plugin-ecommerce + @aqua/plugin-memberships declare block
// descriptors with delegated rendering. Components live under blocks/*
// alongside the native 58 — but they aren't members of BLOCK_REGISTRY
// (which carries the editor metadata for the native palette). They show
// up only in RENDERER_REGISTRATIONS so the runtime renderer can resolve
// them by id.
import MembershipPaywallBlock from "./blocks/MembershipPaywallBlock";
import MembershipSignupBlock from "./blocks/MembershipSignupBlock";
import MembershipTierGridBlock from "./blocks/MembershipTierGridBlock";
import AffiliateSignupBlock from "./blocks/AffiliateSignupBlock";
import AffiliatePayoutMeterBlock from "./blocks/AffiliatePayoutMeterBlock";
import AffiliateLeaderboardBlock from "./blocks/AffiliateLeaderboardBlock";
import FormRenderBlock from "./blocks/FormRenderBlock";
import CrmContactFormBlock from "./blocks/CrmContactFormBlock";

// ─── Registry shape ────────────────────────────────────────────────────────

export interface BlockRenderProps {
  block: Block;
  editorMode?: boolean;
  renderChildren?: (children: Block[] | undefined) => React.ReactNode;
}

export type PropFieldType =
  | "text" | "textarea" | "url" | "color" | "select" | "number" | "boolean" | "image" | "richtext";

export interface PropField {
  key: string;
  label: string;
  type: PropFieldType;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
}

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  iconNode?: ReactNode;
  category: BlockCategory;
  isContainer: boolean;
  Component: ComponentType<BlockRenderProps>;
  defaultProps: Record<string, unknown>;
  defaultChildren?: Block[];
  fields: PropField[];
  requiresPlugin?: string;
  requiresFeature?: string;
}

// ─── The 58 ────────────────────────────────────────────────────────────────

export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  // ── Layout ─────────────────────────────────────────────────────────────
  container: {
    type: "container", label: "Container", icon: "▭", category: "layout", isContainer: true,
    Component: ContainerBlock, defaultProps: {}, fields: [],
  },
  section: {
    type: "section", label: "Section", icon: "⫷⫸", category: "layout", isContainer: true,
    Component: SectionBlock, defaultProps: { fullWidth: false },
    fields: [
      { key: "fullWidth", label: "Full-bleed background", type: "boolean", default: false },
    ],
  },
  row: {
    type: "row", label: "Row", icon: "▤", category: "layout", isContainer: true,
    Component: RowBlock, defaultProps: { gap: "16px" },
    fields: [{ key: "gap", label: "Gap", type: "text", default: "16px" }],
  },
  column: {
    type: "column", label: "Column", icon: "▥", category: "layout", isContainer: true,
    Component: ColumnBlock, defaultProps: { gap: "12px" },
    fields: [{ key: "gap", label: "Gap", type: "text", default: "12px" }],
  },
  grid: {
    type: "grid", label: "Grid", icon: "▦", category: "layout", isContainer: true,
    Component: GridBlock, defaultProps: { columns: 3, gap: "24px" },
    fields: [
      { key: "columns", label: "Columns", type: "number", default: 3 },
      { key: "gap", label: "Gap", type: "text", default: "24px" },
    ],
  },
  spacer: {
    type: "spacer", label: "Spacer", icon: "↕", category: "layout", isContainer: false,
    Component: SpacerBlock, defaultProps: { height: "32px" },
    fields: [{ key: "height", label: "Height", type: "text", default: "32px" }],
  },
  divider: {
    type: "divider", label: "Divider", icon: "—", category: "layout", isContainer: false,
    Component: DividerBlock, defaultProps: { color: "rgba(255,255,255,0.1)" },
    fields: [{ key: "color", label: "Colour", type: "color", default: "#1a1a1a" }],
  },

  // ── Content ────────────────────────────────────────────────────────────
  heading: {
    type: "heading", label: "Heading", icon: "H", category: "content", isContainer: false,
    Component: HeadingBlock, defaultProps: { text: "Your headline", level: 2 },
    fields: [
      { key: "text", label: "Text", type: "text", default: "Your headline" },
      { key: "level", label: "Level", type: "select", default: 2, options: [
        { value: "1", label: "H1" }, { value: "2", label: "H2" }, { value: "3", label: "H3" },
        { value: "4", label: "H4" }, { value: "5", label: "H5" }, { value: "6", label: "H6" },
      ] },
    ],
  },
  text: {
    type: "text", label: "Text", icon: "T", category: "content", isContainer: false,
    Component: TextBlock, defaultProps: { text: "Add your copy here. Click to edit." },
    fields: [{ key: "text", label: "Text", type: "richtext", default: "Add your copy here." }],
  },
  button: {
    type: "button", label: "Button", icon: "▶", category: "content", isContainer: false,
    Component: ButtonBlock, defaultProps: { label: "Click me", href: "#", variant: "primary", hoverAnim: "lift" },
    fields: [
      { key: "label", label: "Label", type: "text", default: "Click me" },
      { key: "href", label: "URL", type: "url", default: "#" },
      { key: "variant", label: "Style", type: "select", default: "primary", options: [
        { value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" }, { value: "ghost", label: "Ghost" },
      ] },
      { key: "hoverAnim", label: "Hover effect", type: "select", default: "lift", options: [
        { value: "none", label: "None" }, { value: "lift", label: "Lift" },
        { value: "glow", label: "Glow" }, { value: "shrink", label: "Shrink" },
        { value: "shine", label: "Shine" }, { value: "wiggle", label: "Wiggle" },
      ] },
    ],
  },
  hero: {
    type: "hero", label: "Hero", icon: "★", category: "content", isContainer: false,
    Component: HeroBlock,
    defaultProps: {
      eyebrow: "Welcome",
      headline: "Build something beautiful",
      subhead: "A short tagline that explains the value proposition.",
      ctaLabel: "Get started",
      ctaHref: "#",
      backgroundImage: "",
    },
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", default: "Welcome" },
      { key: "headline", label: "Headline", type: "text", default: "Build something beautiful" },
      { key: "subhead", label: "Sub-headline", type: "textarea", default: "A short tagline." },
      { key: "ctaLabel", label: "CTA label", type: "text", default: "Get started" },
      { key: "ctaHref", label: "CTA URL", type: "url", default: "#" },
      { key: "backgroundImage", label: "Background image URL", type: "image", default: "" },
    ],
  },
  cta: {
    type: "cta", label: "Call to action", icon: "❯", category: "content", isContainer: false,
    Component: CtaBlock, defaultProps: { headline: "Ready to start?", ctaLabel: "Sign up", ctaHref: "#" },
    fields: [
      { key: "headline", label: "Headline", type: "text", default: "Ready to start?" },
      { key: "subhead", label: "Sub-headline", type: "text", default: "" },
      { key: "ctaLabel", label: "CTA label", type: "text", default: "Sign up" },
      { key: "ctaHref", label: "CTA URL", type: "url", default: "#" },
    ],
  },
  testimonials: {
    type: "testimonials", label: "Testimonials", icon: "❝", category: "content", isContainer: false,
    Component: TestimonialsBlock,
    defaultProps: {
      title: "Loved by founders",
      items: [
        { quote: "This is the future.", author: "Felicia", role: "Founder, Odo" },
        { quote: "Shipped our portal in a day.", author: "Ed", role: "CTO" },
      ],
    },
    fields: [{ key: "title", label: "Title", type: "text", default: "Loved by founders" }],
  },
  "pricing-table": {
    type: "pricing-table", label: "Pricing table", icon: "💲", category: "content", isContainer: false,
    Component: PricingTableBlock,
    defaultProps: { heading: "Simple, honest pricing", subheading: "Pick the plan that fits." },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
    ],
  },
  faq: {
    type: "faq", label: "FAQ", icon: "?", category: "content", isContainer: false,
    Component: FaqBlock, defaultProps: { heading: "Frequently asked" },
    fields: [{ key: "heading", label: "Heading", type: "text" }],
  },
  quote: {
    type: "quote", label: "Quote", icon: "❝", category: "content", isContainer: false,
    Component: QuoteBlock,
    defaultProps: { text: "Design is intelligence made visible.", align: "center" },
    fields: [
      { key: "text", label: "Quote", type: "textarea" },
      { key: "author", label: "Author", type: "text" },
      { key: "role", label: "Role / context", type: "text" },
      { key: "align", label: "Align", type: "select", default: "center", options: [
        { value: "left", label: "Left" }, { value: "center", label: "Center" },
      ] },
    ],
  },
  banner: {
    type: "banner", label: "Banner", icon: "▬", category: "content", isContainer: false,
    Component: BannerBlock,
    defaultProps: { text: "Free UK shipping over £40", tone: "promo", dismissible: true, sticky: false },
    fields: [
      { key: "text", label: "Text", type: "text" },
      { key: "ctaLabel", label: "CTA label", type: "text" },
      { key: "ctaHref", label: "CTA URL", type: "url" },
      { key: "tone", label: "Tone", type: "select", default: "promo", options: [
        { value: "info", label: "Info" }, { value: "promo", label: "Promo" }, { value: "alert", label: "Alert" },
      ] },
      { key: "dismissible", label: "Dismissible", type: "boolean", default: true },
      { key: "sticky", label: "Stick to top", type: "boolean", default: false },
    ],
  },
  "feature-comparison": {
    type: "feature-comparison", label: "Feature comparison", icon: "▦", category: "content", isContainer: false,
    Component: FeatureComparisonBlock,
    defaultProps: {
      heading: "Compare plans",
      subheading: "Pick the tier that matches your stage.",
      columns: [
        { id: "starter", label: "Starter", ctaLabel: "Choose", ctaHref: "#starter" },
        { id: "growth", label: "Growth", ctaLabel: "Choose", ctaHref: "#growth", highlighted: true },
        { id: "scale", label: "Scale", ctaLabel: "Talk to us", ctaHref: "#scale" },
      ],
      rows: [
        { feature: "Active clients",        values: { starter: "Up to 5", growth: "Up to 25", scale: "Unlimited" } },
        { feature: "Storage",               values: { starter: "10 GB", growth: "100 GB", scale: "1 TB" } },
        { feature: "Custom domain",         values: { starter: false, growth: true, scale: true } },
        { feature: "AI page builder",       values: { starter: false, growth: true, scale: true } },
        { feature: "Priority support",      values: { starter: false, growth: false, scale: true } },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Subheading", type: "textarea" },
    ],
  },
  "team-grid": {
    type: "team-grid", label: "Team grid", icon: "👥", category: "content", isContainer: false,
    Component: TeamGridBlock,
    defaultProps: {
      heading: "Meet the team",
      columns: 3,
      members: [
        { name: "Felicia", role: "Founder", bio: "Crafting brands rooted in honesty and care." },
        { name: "Member two", role: "Strategist", bio: "Where systems meet sales." },
        { name: "Member three", role: "Designer", bio: "Aesthetic discipline; brand-kit driven." },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Subheading", type: "textarea" },
      { key: "columns", label: "Columns", type: "number", default: 3 },
    ],
  },
  breadcrumb: {
    type: "breadcrumb", label: "Breadcrumb", icon: "›", category: "content", isContainer: false,
    Component: BreadcrumbBlock,
    defaultProps: {
      separator: "›",
      homeLabel: "Home",
    },
    fields: [
      { key: "separator", label: "Separator", type: "text", default: "›" },
      { key: "homeLabel", label: "Home label", type: "text", default: "Home" },
    ],
  },
  "process-steps": {
    type: "process-steps", label: "Process steps", icon: "①", category: "content", isContainer: false,
    Component: ProcessStepsBlock,
    defaultProps: {
      heading: "How it works",
      layout: "horizontal",
      steps: [
        { title: "Discover", description: "We learn about your story, your offer, your audience." },
        { title: "Design",   description: "We craft the system: brand, site, sales pages." },
        { title: "Deliver",  description: "We launch, measure, refine — together." },
      ],
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Subheading", type: "textarea" },
      { key: "layout", label: "Layout", type: "select", default: "horizontal", options: [
        { value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" },
      ] },
    ],
  },
  "share-buttons": {
    type: "share-buttons", label: "Share buttons", icon: "↗", category: "content", isContainer: false,
    Component: ShareButtonsBlock,
    defaultProps: {
      heading: "Share this:",
      networks: ["twitter", "linkedin", "facebook", "copy"],
    },
    fields: [
      { key: "heading", label: "Heading", type: "text", default: "Share this:" },
      { key: "url", label: "URL (blank → current page)", type: "url" },
      { key: "text", label: "Share text (Twitter)", type: "text" },
    ],
  },
  "form-embed": {
    type: "form-embed", label: "Form (from Forms plugin)", icon: "📋", category: "content", isContainer: false,
    Component: FormEmbedBlock,
    defaultProps: {
      formId: "",
      fallbackTitle: "Loading form…",
      inlineThankYou: "Thanks — we got it.",
    },
    fields: [
      { key: "formId", label: "Form ID", type: "text", help: "Pick via Form picker (or paste a Forms-plugin form id)." },
      { key: "fallbackTitle", label: "Loading text", type: "text", default: "Loading form…" },
      { key: "inlineThankYou", label: "Inline thank-you message", type: "text", default: "Thanks — we got it." },
    ],
  },
  "blog-feed": {
    type: "blog-feed", label: "Blog feed", icon: "📰", category: "content", isContainer: false,
    Component: BlogFeedBlock,
    defaultProps: { count: 6, layout: "grid" },
    fields: [
      { key: "count", label: "Post count", type: "number", default: 6 },
      { key: "layout", label: "Layout", type: "select", default: "grid", options: [
        { value: "grid", label: "Grid" }, { value: "list", label: "List" },
      ] },
      { key: "filterTag", label: "Filter by tag", type: "text" },
      { key: "linkBase", label: "Link base", type: "text", default: "/blog" },
      { key: "siteId", label: "Site ID override", type: "text" },
    ],
  },
  "blog-post": {
    type: "blog-post", label: "Blog post", icon: "📄", category: "content", isContainer: false,
    Component: BlogPostBlock,
    defaultProps: { slug: "auto" },
    fields: [
      { key: "slug", label: "Post slug ('auto' = read URL)", type: "text", default: "auto" },
      { key: "siteId", label: "Site ID override", type: "text" },
    ],
  },
  "cookie-consent": {
    type: "cookie-consent", label: "Cookie consent", icon: "🍪", category: "content", isContainer: false,
    Component: CookieConsentBlock,
    defaultProps: {
      message: "We use cookies to improve your experience. Read our policy or choose below.",
      acceptLabel: "Accept",
      declineLabel: "Decline",
      position: "bottom-bar",
    },
    fields: [
      { key: "message", label: "Message", type: "textarea" },
      { key: "acceptLabel", label: "Accept label", type: "text" },
      { key: "declineLabel", label: "Decline label", type: "text" },
      { key: "policyUrl", label: "Policy URL", type: "url" },
      { key: "position", label: "Position", type: "select", default: "bottom-bar", options: [
        { value: "bottom-bar", label: "Bottom bar" },
        { value: "corner", label: "Corner card" },
        { value: "modal", label: "Modal" },
      ] },
    ],
  },
  "author-bio": {
    type: "author-bio", label: "Author bio", icon: "👤", category: "content", isContainer: false,
    Component: AuthorBioBlock, defaultProps: { name: "Felicia", role: "Founder", bio: "" },
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "role", label: "Role / title", type: "text" },
      { key: "bio", label: "Bio", type: "textarea" },
      { key: "avatarUrl", label: "Avatar URL", type: "url" },
    ],
  },
  "stats-bar": {
    type: "stats-bar", label: "Stats bar", icon: "📊", category: "content", isContainer: false,
    Component: StatsBarBlock, defaultProps: {}, fields: [],
  },
  "logo-grid": {
    type: "logo-grid", label: "Logo grid", icon: "▦", category: "content", isContainer: false,
    Component: LogoGridBlock, defaultProps: { heading: "As featured in", logos: [] },
    fields: [{ key: "heading", label: "Heading", type: "text" }],
  },
  "feature-grid": {
    type: "feature-grid", label: "Feature grid", icon: "▥", category: "content", isContainer: false,
    Component: FeatureGridBlock, defaultProps: { heading: "What's included", columns: 3 },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
      { key: "columns", label: "Columns", type: "number", default: 3 },
    ],
  },
  tabs: {
    type: "tabs", label: "Tabs", icon: "▤", category: "content", isContainer: false,
    Component: TabsBlock, defaultProps: {}, fields: [],
  },
  accordion: {
    type: "accordion", label: "Accordion", icon: "▭▭", category: "content", isContainer: false,
    Component: AccordionBlock, defaultProps: {}, fields: [],
  },
  "card-grid": {
    type: "card-grid", label: "Card grid", icon: "▥", category: "content", isContainer: false,
    Component: CardGridBlock, defaultProps: { columns: 3, cards: [] },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
      { key: "columns", label: "Columns", type: "number", default: 3 },
    ],
  },
  "property-strip": {
    type: "property-strip", label: "Property strip", icon: "≡", category: "content", isContainer: false,
    Component: PropertyStripBlock, defaultProps: { rows: [] },
    fields: [
      { key: "collapsedLabel", label: "Collapsed label", type: "text", default: "" },
    ],
  },
  toggle: {
    type: "toggle", label: "Toggle", icon: "▸", category: "content", isContainer: true,
    Component: ToggleBlock, defaultProps: { label: "Toggle", defaultOpen: false },
    fields: [
      { key: "label", label: "Label", type: "text", default: "Toggle" },
      { key: "defaultOpen", label: "Open by default", type: "boolean", default: false },
    ],
  },
  footer: {
    type: "footer", label: "Footer", icon: "⌐", category: "content", isContainer: false,
    Component: FooterBlock,
    defaultProps: {
      brand: "Brand", tagline: "Crafted with care.",
      columns: [
        { title: "Company", links: [{ label: "About", href: "/about" }, { label: "Contact", href: "/contact" }] },
        { title: "Products", links: [{ label: "Shop", href: "/shop" }, { label: "Catalog", href: "/catalog" }] },
      ],
    },
    fields: [
      { key: "brand", label: "Brand name", type: "text", default: "Brand" },
      { key: "tagline", label: "Tagline", type: "text", default: "Crafted with care." },
    ],
  },
  navbar: {
    type: "navbar", label: "Navigation bar", icon: "≡", category: "content", isContainer: false,
    Component: NavbarBlock,
    defaultProps: {
      brand: "Brand",
      links: [
        { label: "Home", href: "/" },
        { label: "About", href: "/about" },
        { label: "Shop", href: "/shop" },
      ],
      ctaLabel: "Sign in", ctaHref: "/account",
    },
    fields: [
      { key: "brand", label: "Brand name", type: "text", default: "Brand" },
      { key: "ctaLabel", label: "CTA label", type: "text", default: "Sign in" },
      { key: "ctaHref", label: "CTA URL", type: "url", default: "/account" },
    ],
  },
  timeline: {
    type: "timeline", label: "Timeline", icon: "│", category: "content", isContainer: false,
    Component: TimelineBlock, defaultProps: { heading: "Our story" },
    fields: [{ key: "heading", label: "Heading", type: "text" }],
  },
  form: {
    type: "form", label: "Form", icon: "▤", category: "content", isContainer: false,
    Component: FormBlock,
    defaultProps: {
      title: "Get in touch", action: "/api/contact",
      fields: [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "message", label: "Message", type: "textarea", required: true },
      ],
      submitLabel: "Send",
    },
    fields: [
      { key: "title", label: "Title", type: "text", default: "Get in touch" },
      { key: "action", label: "Submit URL", type: "url", default: "/api/contact" },
      { key: "submitLabel", label: "Submit label", type: "text", default: "Send" },
    ],
  },
  "contact-form": {
    type: "contact-form", label: "Contact form", icon: "✉", category: "content", isContainer: false,
    Component: ContactFormBlock,
    defaultProps: {
      heading: "Get in touch",
      subheading: "We'll get back to you within 1 business day.",
      submitLabel: "Send message", showPhone: true, formName: "contact",
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
      { key: "submitLabel", label: "Submit label", type: "text" },
      { key: "showPhone", label: "Show phone field", type: "boolean" },
      { key: "formName", label: "Form name (admin)", type: "text" },
    ],
  },

  // ── Media ──────────────────────────────────────────────────────────────
  image: {
    type: "image", label: "Image", icon: "🖼", category: "media", isContainer: false,
    Component: ImageBlock,
    defaultProps: { src: "", alt: "", width: "100%", filenameForSeo: true },
    fields: [
      { key: "src", label: "Image URL", type: "image", default: "" },
      { key: "alt", label: "Alt text", type: "text", default: "", help: "Describes the image for screen readers + search engines" },
      { key: "title", label: "Title (hover tooltip)", type: "text", default: "" },
      { key: "width", label: "Width", type: "text", default: "100%" },
      { key: "href", label: "Link URL (optional)", type: "url", default: "" },
      { key: "filenameForSeo", label: "Use filename as fallback alt", type: "boolean", default: true, help: "When alt is empty, derives one from the image filename — bonus SEO" },
    ],
  },
  video: {
    type: "video", label: "Video", icon: "▶︎", category: "media", isContainer: false,
    Component: VideoBlock, defaultProps: { src: "", autoplay: false, controls: true },
    fields: [
      { key: "src", label: "Video URL (mp4 or YouTube)", type: "url", default: "" },
      { key: "autoplay", label: "Autoplay", type: "boolean", default: false },
      { key: "controls", label: "Show controls", type: "boolean", default: true },
    ],
  },
  "video-embed": {
    type: "video-embed", label: "Video embed", icon: "▶︎", category: "media", isContainer: false,
    Component: VideoEmbedBlock,
    defaultProps: { provider: "raw", url: "", aspectRatio: 16 / 9, autoplay: false, controls: true },
    fields: [
      { key: "url", label: "Video URL (Vimeo / YouTube / Loom)", type: "url", default: "", help: "Provider auto-detects from the URL on save." },
      { key: "provider", label: "Provider", type: "select", default: "raw", options: [
        { value: "vimeo", label: "Vimeo" }, { value: "youtube", label: "YouTube" },
        { value: "loom", label: "Loom" },   { value: "raw", label: "Raw iframe" },
      ] },
      { key: "aspectRatio", label: "Aspect ratio (W/H)", type: "number", default: 16 / 9 },
      { key: "autoplay", label: "Autoplay", type: "boolean", default: false },
      { key: "controls", label: "Show controls", type: "boolean", default: true },
      { key: "caption", label: "Caption", type: "text", default: "" },
    ],
  },
  icon: {
    type: "icon", label: "Icon", icon: "✦", category: "media", isContainer: false,
    Component: IconBlock, defaultProps: { glyph: "✦", size: "32px", color: "#ff6b35" },
    fields: [
      { key: "glyph", label: "Icon character", type: "text", default: "✦" },
      { key: "size", label: "Size", type: "text", default: "32px" },
      { key: "color", label: "Colour", type: "color", default: "#ff6b35" },
      { key: "image", label: "Image URL (image mode)", type: "image", default: "", help: "When set, renders a 64×64 image chip with offsetY for cover overlap (Notion-style)" },
      { key: "offsetY", label: "Vertical offset (image mode)", type: "number", default: -32 },
      { key: "label", label: "Caption (image mode)", type: "text", default: "" },
    ],
  },
  gallery: {
    type: "gallery", label: "Gallery", icon: "🖼", category: "media", isContainer: false,
    Component: GalleryBlock, defaultProps: { columns: 3, gap: 12, lightbox: true, photos: [] },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "columns", label: "Columns", type: "number", default: 3 },
      { key: "gap", label: "Gap (px)", type: "number", default: 12 },
      { key: "lightbox", label: "Lightbox on click", type: "boolean", default: true },
    ],
  },
  map: {
    type: "map", label: "Map", icon: "📍", category: "media", isContainer: false,
    Component: MapBlock, defaultProps: { lat: 51.5074, lng: -0.1278, zoom: 14, height: 360 },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "lat", label: "Latitude", type: "number" },
      { key: "lng", label: "Longitude", type: "number" },
      { key: "zoom", label: "Zoom", type: "number", default: 14 },
      { key: "height", label: "Height (px)", type: "number", default: 360 },
      { key: "iframeUrl", label: "Custom embed URL (overrides above)", type: "url" },
    ],
  },
  "before-after": {
    type: "before-after", label: "Before / after", icon: "↔", category: "media", isContainer: false,
    Component: BeforeAfterBlock, defaultProps: { beforeLabel: "Before", afterLabel: "After" },
    fields: [
      { key: "beforeUrl", label: "Before image URL", type: "url" },
      { key: "afterUrl", label: "After image URL", type: "url" },
      { key: "beforeLabel", label: "Before label", type: "text" },
      { key: "afterLabel", label: "After label", type: "text" },
    ],
  },
  marquee: {
    type: "marquee", label: "Marquee", icon: "→", category: "media", isContainer: false,
    Component: MarqueeBlock, defaultProps: { speed: 30, items: [] },
    fields: [{ key: "speed", label: "Speed (seconds per loop)", type: "number", default: 30 }],
  },

  // ── Commerce (gated on ecommerce plugin) ──────────────────────────────
  "product-card": {
    type: "product-card", label: "Product card", icon: "🛍", category: "commerce", isContainer: false,
    Component: ProductCardBlock, requiresPlugin: "ecommerce",
    defaultProps: {
      productHandle: "", title: "Product name", price: "£0.00", image: "", ctaLabel: "Add to cart",
    },
    fields: [
      { key: "productHandle", label: "Product handle", type: "text", default: "", help: "Used at runtime to fetch live data" },
      { key: "title", label: "Title (preview)", type: "text", default: "Product name" },
      { key: "price", label: "Price (preview)", type: "text", default: "£0.00" },
      { key: "image", label: "Image URL (preview)", type: "image", default: "" },
      { key: "ctaLabel", label: "CTA label", type: "text", default: "Add to cart" },
    ],
  },
  "product-grid": {
    type: "product-grid", label: "Product grid", icon: "▦", category: "commerce", isContainer: false,
    Component: ProductGridBlock, requiresPlugin: "ecommerce",
    defaultProps: { collectionHandle: "all", columns: 3, limit: 9 },
    fields: [
      { key: "collectionHandle", label: "Collection handle", type: "text", default: "all" },
      { key: "columns", label: "Columns", type: "number", default: 3 },
      { key: "limit", label: "Max items", type: "number", default: 9 },
    ],
  },
  "collection-grid": {
    type: "collection-grid", label: "Collection grid", icon: "▦", category: "commerce", isContainer: false,
    Component: CollectionGridBlock, requiresPlugin: "ecommerce",
    defaultProps: { showFilters: true, sortKey: "title" },
    fields: [
      { key: "showFilters", label: "Show filter sidebar", type: "boolean", default: true },
      { key: "sortKey", label: "Default sort", type: "select", default: "title", options: [
        { value: "title", label: "Title" }, { value: "price", label: "Price" }, { value: "newest", label: "Newest" },
      ] },
    ],
  },
  "cart-summary": {
    type: "cart-summary", label: "Cart summary", icon: "🛒", category: "commerce", isContainer: false,
    Component: CartSummaryBlock, requiresPlugin: "ecommerce",
    defaultProps: { showThumbnails: true, showQuantitySelector: true },
    fields: [
      { key: "showThumbnails", label: "Show thumbnails", type: "boolean", default: true },
      { key: "showQuantitySelector", label: "Quantity controls", type: "boolean", default: true },
    ],
  },
  "checkout-summary": {
    type: "checkout-summary", label: "Checkout summary", icon: "➔", category: "commerce", isContainer: false,
    Component: CheckoutSummaryBlock, requiresPlugin: "ecommerce",
    defaultProps: { showLineItems: true, showShipping: true, showTax: true },
    fields: [
      { key: "showLineItems", label: "Show line items", type: "boolean", default: true },
      { key: "showShipping", label: "Show shipping", type: "boolean", default: true },
      { key: "showTax", label: "Show tax", type: "boolean", default: true },
    ],
  },
  "payment-button": {
    type: "payment-button", label: "Payment button", icon: "💳", category: "commerce", isContainer: false,
    Component: PaymentButtonBlock, requiresPlugin: "ecommerce",
    defaultProps: { label: "Pay now", provider: "stripe" },
    fields: [
      { key: "label", label: "Label", type: "text", default: "Pay now" },
      { key: "provider", label: "Provider", type: "select", default: "stripe", options: [
        { value: "stripe", label: "Stripe" }, { value: "paypal", label: "PayPal" }, { value: "applepay", label: "Apple Pay" },
      ] },
    ],
  },
  "order-success": {
    type: "order-success", label: "Order success", icon: "✓", category: "commerce", isContainer: false,
    Component: OrderSuccessBlock, requiresPlugin: "ecommerce",
    defaultProps: {
      headline: "Thanks for your order!",
      subhead: "We've sent a receipt to your email. Your order will ship soon.",
      ctaLabel: "Continue shopping", ctaHref: "/shop",
    },
    fields: [
      { key: "headline", label: "Headline", type: "text", default: "Thanks for your order!" },
      { key: "subhead", label: "Sub-headline", type: "textarea", default: "" },
      { key: "ctaLabel", label: "CTA label", type: "text", default: "Continue shopping" },
      { key: "ctaHref", label: "CTA URL", type: "url", default: "/shop" },
    ],
  },
  "variant-picker": {
    type: "variant-picker", label: "Variant picker", icon: "🎨", category: "commerce", isContainer: false,
    Component: VariantPickerBlock, requiresPlugin: "ecommerce",
    defaultProps: { productHandle: "", showPrice: true, showCta: true, ctaLabel: "Add to cart" },
    fields: [
      { key: "productHandle", label: "Product handle", type: "text", default: "" },
      { key: "showPrice", label: "Show price", type: "boolean", default: true },
      { key: "showCta", label: "Show add-to-cart button", type: "boolean", default: true },
      { key: "ctaLabel", label: "CTA label", type: "text", default: "Add to cart" },
    ],
  },
  "product-search": {
    type: "product-search", label: "Product search", icon: "🔍", category: "commerce", isContainer: false,
    Component: ProductSearchBlock, requiresPlugin: "ecommerce",
    defaultProps: { placeholder: "Search products…", showPlaceholder: true },
    fields: [
      { key: "placeholder", label: "Placeholder", type: "text", default: "Search products…" },
      { key: "showPlaceholder", label: "Show placeholder", type: "boolean", default: true },
    ],
  },
  "donation-button": {
    type: "donation-button", label: "Donation button", icon: "♡", category: "commerce", isContainer: false,
    Component: DonationButtonBlock,
    defaultProps: {
      heading: "Support our work",
      subheading: "Every donation goes directly to the cause.",
      currency: "GBP", amounts: "5,10,25,50,100",
      allowCustom: true, allowRecurring: true,
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
      { key: "currency", label: "Currency", type: "select", default: "GBP", options: [
        { value: "GBP", label: "GBP" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" },
      ] },
      { key: "amounts", label: "Amounts (comma-separated)", type: "text" },
      { key: "allowCustom", label: "Allow custom amount", type: "boolean", default: true },
      { key: "allowRecurring", label: "Show monthly toggle", type: "boolean", default: true },
    ],
  },
  "booking-widget": {
    type: "booking-widget", label: "Booking widget", icon: "📅", category: "commerce", isContainer: false,
    Component: BookingWidgetBlock,
    defaultProps: {
      heading: "Book an appointment",
      subheading: "Pick a service and time that works for you.",
      showStaff: true,
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
      { key: "showStaff", label: "Show staff picker (when service has multiple)", type: "boolean", default: true },
      { key: "orgId", label: "Org id (override; auto-detected by default)", type: "text" },
    ],
  },

  // ── Auth ───────────────────────────────────────────────────────────────
  "login-form": {
    type: "login-form", label: "Login form", icon: "🔑", category: "auth", isContainer: false,
    Component: LoginFormBlock,
    defaultProps: {
      title: "Sign in", action: "/api/auth/login", submitLabel: "Sign in",
      showRemember: true, showForgot: true, showSignupLink: true,
      signupHref: "/signup", forgotHref: "/account/forgot-password",
    },
    fields: [
      { key: "title", label: "Title", type: "text", default: "Sign in" },
      { key: "subtitle", label: "Subtitle", type: "text", default: "" },
      { key: "action", label: "Submit URL", type: "url", default: "/api/auth/login" },
      { key: "submitLabel", label: "Submit label", type: "text", default: "Sign in" },
      { key: "showRemember", label: "Show remember", type: "boolean", default: true },
      { key: "showForgot", label: "Show forgot link", type: "boolean", default: true },
      { key: "forgotHref", label: "Forgot URL", type: "url", default: "/account/forgot-password" },
      { key: "showSignupLink", label: "Show sign-up link", type: "boolean", default: true },
      { key: "signupHref", label: "Sign-up URL", type: "url", default: "/signup" },
    ],
  },
  "signup-form": {
    type: "signup-form", label: "Sign-up form", icon: "✏", category: "auth", isContainer: false,
    Component: SignupFormBlock,
    defaultProps: {
      title: "Create your account", action: "/api/auth/signup", submitLabel: "Create account",
      showName: true, requireTerms: false, termsHref: "/terms",
      showLoginLink: true, loginHref: "/login",
    },
    fields: [
      { key: "title", label: "Title", type: "text", default: "Create your account" },
      { key: "action", label: "Submit URL", type: "url", default: "/api/auth/signup" },
      { key: "submitLabel", label: "Submit label", type: "text", default: "Create account" },
      { key: "showName", label: "Show name field", type: "boolean", default: true },
      { key: "requireTerms", label: "Require terms checkbox", type: "boolean", default: false },
      { key: "termsHref", label: "Terms URL", type: "url", default: "/terms" },
      { key: "showLoginLink", label: "Show login link", type: "boolean", default: true },
      { key: "loginHref", label: "Login URL", type: "url", default: "/login" },
    ],
  },
  "theme-selector": {
    type: "theme-selector", label: "Theme selector", icon: "🎨", category: "auth", isContainer: false,
    Component: ThemeSelectorBlock, defaultProps: { label: "Theme", variant: "select" },
    fields: [
      { key: "label", label: "Label", type: "text", default: "Theme" },
      { key: "variant", label: "Variant", type: "select", default: "select", options: [
        { value: "select", label: "Dropdown" }, { value: "buttons", label: "Pill buttons" },
      ] },
    ],
  },
  "social-auth": {
    type: "social-auth", label: "Social auth", icon: "🔐", category: "auth", isContainer: false,
    Component: SocialAuthBlock,
    defaultProps: { enabled: ["google", "github"], baseUrl: "/api/auth", showDivider: true, dividerLabel: "or" },
    fields: [
      { key: "baseUrl", label: "Base URL", type: "url", default: "/api/auth", help: "Each button links to {baseUrl}/{provider}." },
      { key: "showDivider", label: "Show divider", type: "boolean", default: true },
      { key: "dividerLabel", label: "Divider label", type: "text", default: "or" },
    ],
  },
  "member-gate": {
    type: "member-gate", label: "Member gate", icon: "🔒", category: "auth", isContainer: true,
    Component: MemberGateBlock,
    defaultProps: {
      tier: "free",
      lockMessage: "Members only — sign in or join to read.",
      ctaLabel: "Sign in or join", ctaHref: "/account?mode=signup",
    },
    fields: [
      { key: "tier", label: "Required tier", type: "text", default: "free" },
      { key: "lockMessage", label: "Lock message", type: "textarea" },
      { key: "ctaLabel", label: "CTA label", type: "text" },
      { key: "ctaHref", label: "CTA URL", type: "url" },
    ],
  },

  // ── Advanced ───────────────────────────────────────────────────────────
  html: {
    type: "html", label: "Raw HTML", icon: "</>", category: "advanced", isContainer: false,
    Component: HtmlBlock, defaultProps: { html: "<p>Custom HTML here</p>" },
    fields: [{ key: "html", label: "HTML", type: "textarea", default: "<p>Custom HTML</p>" }],
  },
  "countdown-timer": {
    type: "countdown-timer", label: "Countdown timer", icon: "⏱", category: "advanced", isContainer: false,
    Component: CountdownTimerBlock,
    defaultProps: { heading: "Sale ends in", target: "+7d", expiredText: "Sale has ended.", showSeconds: true },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "target", label: "Target (ISO date or +Nd/+Nh/+Nm)", type: "text", placeholder: "+7d" },
      { key: "expiredText", label: "Expired text", type: "text" },
      { key: "showSeconds", label: "Show seconds", type: "boolean" },
    ],
  },
  "language-switcher": {
    type: "language-switcher", label: "Language switcher", icon: "🌐", category: "advanced", isContainer: false,
    Component: LanguageSwitcherBlock,
    defaultProps: { variant: "dropdown", enabledLocales: "en,fr,es" },
    fields: [
      { key: "variant", label: "Variant", type: "select", default: "dropdown", options: [
        { value: "dropdown", label: "Dropdown" }, { value: "pills", label: "Pills" },
      ] },
      { key: "enabledLocales", label: "Enabled locales (csv)", type: "text" },
    ],
  },
  "newsletter-signup": {
    type: "newsletter-signup", label: "Newsletter signup", icon: "📧", category: "advanced", isContainer: false,
    Component: NewsletterSignupBlock,
    defaultProps: {
      heading: "Stay in the loop",
      subheading: "One email a month. New launches, no spam.",
      submitLabel: "Subscribe", successMessage: "You're in. Welcome!",
    },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Sub-heading", type: "textarea" },
      { key: "submitLabel", label: "Submit label", type: "text" },
      { key: "successMessage", label: "Success message", type: "text" },
    ],
  },
  "app-showcase": {
    type: "app-showcase", label: "App showcase", icon: "📱", category: "advanced", isContainer: false,
    Component: AppShowcaseBlock, defaultProps: { orientation: "image-right" },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body", type: "textarea" },
      { key: "screenshotUrl", label: "Screenshot URL", type: "url" },
      { key: "appStoreUrl", label: "App Store URL", type: "url" },
      { key: "playStoreUrl", label: "Google Play URL", type: "url" },
      { key: "orientation", label: "Orientation", type: "select", default: "image-right", options: [
        { value: "image-left", label: "Image left" }, { value: "image-right", label: "Image right" },
      ] },
    ],
  },
  "social-proof-bar": {
    type: "social-proof-bar", label: "Social proof bar", icon: "★", category: "advanced", isContainer: false,
    Component: SocialProofBarBlock,
    defaultProps: { text: "Join 12,000+ customers loving the change.", avatars: [] },
    fields: [
      { key: "text", label: "Text", type: "text" },
      { key: "rating", label: "Average rating (0–5)", type: "number" },
      { key: "reviewCount", label: "Review count", type: "number" },
    ],
  },
};

// ─── Public selectors ──────────────────────────────────────────────────────

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_REGISTRY[type];
}

export function listBlockDefinitions(): BlockDefinition[] {
  return Object.values(BLOCK_REGISTRY);
}

export function listBlocksByCategory(category: BlockCategory): BlockDefinition[] {
  return Object.values(BLOCK_REGISTRY).filter(d => d.category === category);
}

// ─── Plugin manifest derivative ────────────────────────────────────────────
//
// The Aqua plugin contract expects `BlockDescriptor[]` (see
// `aquaPluginTypes.ts`). Derive that flat shape from the BlockDefinition
// registry so we have a single source of truth — adding a new block
// here automatically updates what the manifest exposes to other plugins
// and the foundation editor.

export const BLOCK_DESCRIPTORS: BlockDescriptor[] = Object.values(BLOCK_REGISTRY).map(def => ({
  type: def.type,
  label: def.label,
  category: def.category,
  defaultProps: def.defaultProps,
  defaultChildren: def.defaultChildren as unknown as BlockDescriptor[] | undefined,
  ...(def.requiresPlugin ? { requiresPlugin: def.requiresPlugin } : {}),
  ...(def.requiresFeature ? { requiresFeature: def.requiresFeature } : {}),
}));

export const BLOCK_TYPES = Object.keys(BLOCK_REGISTRY);

export function getBlockDescriptor(type: string): BlockDescriptor | undefined {
  return BLOCK_DESCRIPTORS.find(d => d.type === type);
}

// ─── Round-1 compatibility shim ────────────────────────────────────────────
// Existing callers (smoke test, manifest derivation) imported these names
// from blockRegistry. Keep them as re-exports so imports don't break.

export interface BlockComponentProps {
  block: Block;
  editorMode?: boolean;
  renderChildren?: (children: Block[] | undefined) => React.ReactNode;
}

export interface BlockRegistryEntry {
  descriptor: BlockDescriptor;
  component: ComponentType<BlockRenderProps>;
}

export function getBlockEntry(type: string): BlockRegistryEntry | undefined {
  const def = BLOCK_REGISTRY[type];
  if (!def) return undefined;
  return {
    descriptor: BLOCK_DESCRIPTORS.find(d => d.type === type)!,
    component: def.Component,
  };
}

// ─── Cross-plugin renderer registrations ───────────────────────────────────
//
// Other plugins (ecommerce, memberships, blog, etc.) can declare
// `BlockDescriptor[]` in their manifest's `storefront.blocks` to add
// new block types to the editor palette. Per the architecture decision
// in T2 R2, **rendering is delegated to this plugin** — descriptors
// from external plugins carry only metadata + defaultProps, not a
// React component.
//
// `RENDERER_REGISTRATIONS` is the single source of truth for which
// React component renders which block id, regardless of which plugin
// declared it. It seeds with:
//   - The native 58 BlockDefinition.Component values
//   - The 8 ecommerce block components (already lifted in R2 Phase A)
//   - The 3 memberships block components (added in R3 Goal B)
//
// Foundation calls `registerExternalBlockRenderers(plugins)` once at
// boot to validate that every external block descriptor with
// `requiresPlugin` set has a matching renderer here. Missing renderers
// log a clear warning so the operator notices in dev.

export type BlockComponentType = ComponentType<BlockRenderProps>;

const NATIVE_RENDERERS: Record<string, BlockComponentType> = Object.fromEntries(
  Object.entries(BLOCK_REGISTRY).map(([type, def]) => [type, def.Component]),
);

export const RENDERER_REGISTRATIONS: Record<string, BlockComponentType> = {
  ...NATIVE_RENDERERS,

  // ecommerce (T2's @aqua/plugin-ecommerce — declared in its manifest)
  "product-card":      ProductCardBlock,
  "product-grid":      ProductGridBlock,
  "cart-summary":      CartSummaryBlock,
  "checkout-summary":  CheckoutSummaryBlock,
  "payment-button":    PaymentButtonBlock,
  "order-success":     OrderSuccessBlock,
  "variant-picker":    VariantPickerBlock,
  "product-search":    ProductSearchBlock,

  // memberships (T2 R4 — @aqua/plugin-memberships)
  "membership-paywall":    MembershipPaywallBlock,
  "membership-signup":     MembershipSignupBlock,
  "membership-tier-grid":  MembershipTierGridBlock,

  // affiliates (T2 R5 — @aqua/plugin-affiliates)
  "affiliate-signup":         AffiliateSignupBlock,
  "affiliate-payout-meter":   AffiliatePayoutMeterBlock,
  "affiliate-leaderboard":    AffiliateLeaderboardBlock,

  // forms (T2 R9 — @aqua/plugin-forms)
  "form-render":              FormRenderBlock,

  // client-crm (T2 R8 — @aqua/plugin-client-crm)
  "crm-contact-form":         CrmContactFormBlock,
};

export function getBlockRenderer(type: string): BlockComponentType | undefined {
  return RENDERER_REGISTRATIONS[type];
}

// Minimal AquaPlugin shape used by the registration helper. Importing
// the full type would create a foundation-side cycle; declaring the
// subset we read here keeps this module standalone.
interface PluginWithBlocks {
  id: string;
  storefront?: {
    blocks?: Array<{
      type?: string;
      id?: string;
      requiresPlugin?: string;
    }>;
  };
}

// Walks each installed plugin manifest and validates that every block
// it contributes (excluding native ones declared by this plugin) has a
// renderer registered above. Logs a console warning for each missing
// renderer so operators in dev mode notice immediately.
//
// Returns the list of ids that were missing — useful for tests and
// boot-time health checks. Idempotent.
export function registerExternalBlockRenderers(plugins: PluginWithBlocks[]): string[] {
  const missing: string[] = [];
  for (const plugin of plugins) {
    if (plugin.id === "website-editor") continue;
    for (const descriptor of plugin.storefront?.blocks ?? []) {
      const blockId = descriptor.type ?? descriptor.id;
      if (!blockId) continue;
      if (RENDERER_REGISTRATIONS[blockId]) continue;
      missing.push(blockId);
      if (typeof console !== "undefined") {
        console.warn(
          `[website-editor] No renderer registered for block id "${blockId}" ` +
          `contributed by plugin "${plugin.id}". Add it to RENDERER_REGISTRATIONS.`,
        );
      }
    }
  }
  return missing;
}
