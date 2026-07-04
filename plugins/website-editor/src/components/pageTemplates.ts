// Starter page templates surfaced on /admin/sites/[siteId]/pages when the
// admin clicks "New page". Each template seeds a block tree the operator
// can then edit. Mirrors the structure Wix / Squarespace use ("Start from
// a template, then customise").
//
// Faithful port of `02/src/components/editor/pageTemplates.ts`. Block ids
// use `blockId(type)` from the plugin's id helper rather than 02's
// inline `Math.random()`.

import type { Block, BlockType } from "../types/block";
import { blockId } from "../lib/ids";
import { getBlockDefinition } from "./blockRegistry";

function blk(type: BlockType, props: Record<string, unknown> = {}, children?: Block[]): Block {
  const def = getBlockDefinition(type);
  return {
    id: blockId(type),
    type,
    props: { ...(def?.defaultProps ?? {}), ...props },
    ...(children ? { children } : {}),
  };
}

export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  defaultSlug: string;
  defaultTitle: string;
  build: () => Block[];
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    description: "Start from an empty canvas.",
    icon: "▢",
    defaultSlug: "/page",
    defaultTitle: "New page",
    build: () => [],
  },
  {
    id: "homepage",
    label: "Homepage",
    description: "Hero, featured products, testimonials, CTA.",
    icon: "🏠",
    defaultSlug: "/",
    defaultTitle: "Home",
    build: () => [
      blk("hero", {
        eyebrow: "Welcome",
        headline: "Build something beautiful",
        subhead: "A short tagline that explains the value proposition. Edit me.",
        ctaLabel: "Shop now",
        ctaHref: "/shop",
      }),
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Featured products", level: 2 }),
        blk("product-grid", { collectionHandle: "all", columns: 3, limit: 6 }),
      ]),
      blk("testimonials", {
        title: "Loved by our customers",
        items: [
          { quote: "This is the future of skincare.", author: "Felicia", role: "Founder" },
          { quote: "Shipped my whole site in a day.", author: "Ed", role: "CTO" },
          { quote: "Best portal I've ever used.", author: "Ada", role: "Product" },
        ],
      }),
      blk("cta", {
        headline: "Ready to start?",
        subhead: "Join thousands of customers already shopping with us.",
        ctaLabel: "Get started",
        ctaHref: "/account",
      }),
    ],
  },
  {
    id: "about",
    label: "About",
    description: "Story + values + team.",
    icon: "✦",
    defaultSlug: "/about",
    defaultTitle: "About",
    build: () => [
      blk("hero", {
        eyebrow: "Our story",
        headline: "Crafted with care",
        subhead: "Heritage, intention, and pure ingredients — passed down through generations.",
        ctaLabel: "",
        ctaHref: "",
      }),
      blk("section", { fullWidth: false }, [
        blk("grid", { columns: 2, gap: "32px" }, [
          blk("column", {}, [
            blk("heading", { text: "Our values", level: 2 }),
            blk("text", { text: "Pure, hormone-safe, fertility-friendly. We believe in skincare that works with your body, not against it." }),
          ]),
          blk("column", {}, [
            blk("image", { src: "", alt: "Team", width: "100%" }),
          ]),
        ]),
      ]),
    ],
  },
  {
    id: "contact",
    label: "Contact",
    description: "Hero + contact form + map.",
    icon: "✉",
    defaultSlug: "/contact",
    defaultTitle: "Contact",
    build: () => [
      blk("hero", {
        eyebrow: "Get in touch",
        headline: "We'd love to hear from you",
        subhead: "Questions, feedback, partnerships — drop us a line.",
        ctaLabel: "",
        ctaHref: "",
      }),
      blk("section", { fullWidth: false }, [
        blk("form", {
          title: "Send us a message",
          action: "/api/contact",
          submitLabel: "Send",
          fields: [
            { name: "name", label: "Name", type: "text", required: true },
            { name: "email", label: "Email", type: "email", required: true },
            { name: "message", label: "Message", type: "textarea", required: true },
          ],
        }),
      ]),
    ],
  },
  {
    id: "shop",
    label: "Shop",
    description: "Collection grid with filters.",
    icon: "🛍",
    defaultSlug: "/shop",
    defaultTitle: "Shop",
    build: () => [
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Shop all", level: 1 }),
        blk("text", { text: "Browse our full catalog." }),
        blk("collection-grid", { showFilters: true, sortKey: "title" }),
      ]),
    ],
  },
  {
    id: "cart",
    label: "Cart",
    description: "Cart summary + checkout button.",
    icon: "🛒",
    defaultSlug: "/cart",
    defaultTitle: "Cart",
    build: () => [
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Your cart", level: 1 }),
        blk("cart-summary", { showThumbnails: true, showQuantitySelector: true }),
      ]),
    ],
  },
  {
    id: "checkout",
    label: "Checkout",
    description: "Order summary + payment.",
    icon: "💳",
    defaultSlug: "/checkout",
    defaultTitle: "Checkout",
    build: () => [
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Checkout", level: 1 }),
        blk("grid", { columns: 2, gap: "32px" }, [
          blk("column", {}, [
            blk("form", {
              title: "Shipping details",
              action: "/api/checkout",
              submitLabel: "Continue to payment",
              fields: [
                { name: "email", label: "Email", type: "email", required: true },
                { name: "name", label: "Full name", type: "text", required: true },
                { name: "address", label: "Address", type: "text", required: true },
                { name: "city", label: "City", type: "text", required: true },
                { name: "postcode", label: "Postcode", type: "text", required: true },
              ],
            }),
          ]),
          blk("column", {}, [
            blk("checkout-summary", { showLineItems: true, showShipping: true, showTax: true }),
            blk("payment-button", { label: "Pay now", provider: "stripe" }),
          ]),
        ]),
      ]),
    ],
  },
  {
    id: "order-success",
    label: "Order success",
    description: "Thank-you page after checkout.",
    icon: "✓",
    defaultSlug: "/order-confirmed",
    defaultTitle: "Order confirmed",
    build: () => [
      blk("order-success", {
        headline: "Thanks for your order!",
        subhead: "We've sent a receipt to your email. Your order will ship within 2 business days.",
        ctaLabel: "Continue shopping",
        ctaHref: "/shop",
      }),
    ],
  },
  {
    id: "landing",
    label: "Landing page",
    description: "Hero + features grid + testimonial + CTA.",
    icon: "★",
    defaultSlug: "/landing",
    defaultTitle: "Landing",
    build: () => [
      blk("hero", {
        eyebrow: "Launch offer",
        headline: "Ship faster, look better",
        subhead: "A focused landing page built block-by-block.",
        ctaLabel: "Get started",
        ctaHref: "/signup",
      }),
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Why us", level: 2 }),
        blk("grid", { columns: 3, gap: "24px" }, [
          blk("column", {}, [blk("icon", { glyph: "⚡", size: "32px", color: "#ff6b35" }), blk("heading", { text: "Fast", level: 3 }), blk("text", { text: "Drag, drop, publish — minutes not weeks." })]),
          blk("column", {}, [blk("icon", { glyph: "🎨", size: "32px", color: "#ff6b35" }), blk("heading", { text: "Beautiful", level: 3 }), blk("text", { text: "Themes that look custom out of the box." })]),
          blk("column", {}, [blk("icon", { glyph: "🛒", size: "32px", color: "#ff6b35" }), blk("heading", { text: "Commerce-ready", level: 3 }), blk("text", { text: "Variants, cart, checkout — all built in." })]),
        ]),
      ]),
      blk("testimonials", {
        title: "Customers say",
        items: [{ quote: "Best builder I've used in years.", author: "Jamie", role: "Founder" }],
      }),
      blk("cta", { headline: "Ready to launch?", subhead: "It's faster than booking a meeting.", ctaLabel: "Start free", ctaHref: "/signup" }),
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    description: "3-tier pricing table.",
    icon: "💰",
    defaultSlug: "/pricing",
    defaultTitle: "Pricing",
    build: () => [
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Simple, honest pricing", level: 1 }),
        blk("text", { text: "No surprises. Cancel anytime." }),
        blk("grid", { columns: 3, gap: "24px" }, [
          blk("column", { gap: "12px" }, [
            blk("heading", { text: "Starter", level: 3 }),
            blk("heading", { text: "£0", level: 2 }),
            blk("text", { text: "per month" }),
            blk("text", { text: "1 site\nUp to 50 products\nCommunity support" }),
            blk("button", { label: "Get started", href: "/signup", variant: "secondary" }),
          ]),
          blk("column", { gap: "12px" }, [
            blk("heading", { text: "Pro", level: 3 }),
            blk("heading", { text: "£49", level: 2 }),
            blk("text", { text: "per month" }),
            blk("text", { text: "5 sites\nUnlimited products\nVariants + analytics\nPriority support" }),
            blk("button", { label: "Start free trial", href: "/signup?plan=pro", variant: "primary" }),
          ]),
          blk("column", { gap: "12px" }, [
            blk("heading", { text: "Enterprise", level: 3 }),
            blk("heading", { text: "£199", level: 2 }),
            blk("text", { text: "per month" }),
            blk("text", { text: "Unlimited everything\nWhite-label\nDedicated manager\nSLA" }),
            blk("button", { label: "Contact sales", href: "/contact", variant: "secondary" }),
          ]),
        ]),
      ]),
    ],
  },
  {
    id: "faq",
    label: "FAQ",
    description: "Common questions + answers.",
    icon: "?",
    defaultSlug: "/faq",
    defaultTitle: "FAQ",
    build: () => [
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Frequently asked questions", level: 1 }),
        blk("html", {
          html: `
<details style="border-bottom:1px solid rgba(255,255,255,0.08); padding:16px 0;">
  <summary style="cursor:pointer; font-weight:600; font-size:16px;">How long does setup take?</summary>
  <p style="margin-top:8px; opacity:0.75;">Most stores ship their first page within 30 minutes.</p>
</details>
<details style="border-bottom:1px solid rgba(255,255,255,0.08); padding:16px 0;">
  <summary style="cursor:pointer; font-weight:600; font-size:16px;">Can I import my existing products?</summary>
  <p style="margin-top:8px; opacity:0.75;">Yes — CSV or Shopify import works in one click.</p>
</details>
<details style="border-bottom:1px solid rgba(255,255,255,0.08); padding:16px 0;">
  <summary style="cursor:pointer; font-weight:600; font-size:16px;">Do you charge transaction fees?</summary>
  <p style="margin-top:8px; opacity:0.75;">No. You pay only your payment provider's fees.</p>
</details>
        `.trim() }),
      ]),
    ],
  },
  {
    id: "services",
    label: "Services",
    description: "Service grid with offerings.",
    icon: "✨",
    defaultSlug: "/services",
    defaultTitle: "Services",
    build: () => [
      blk("hero", {
        eyebrow: "What we do",
        headline: "Services tailored to you",
        subhead: "Browse our offerings or get in touch for a custom quote.",
        ctaLabel: "Contact us",
        ctaHref: "/contact",
      }),
      blk("section", { fullWidth: false }, [
        blk("grid", { columns: 2, gap: "24px" }, [
          blk("column", { gap: "8px" }, [blk("heading", { text: "Strategy", level: 3 }), blk("text", { text: "Brand, positioning, audience research." })]),
          blk("column", { gap: "8px" }, [blk("heading", { text: "Design", level: 3 }), blk("text", { text: "Identity systems, visual languages, packaging." })]),
          blk("column", { gap: "8px" }, [blk("heading", { text: "Development", level: 3 }), blk("text", { text: "Web + mobile builds with conversion baked in." })]),
          blk("column", { gap: "8px" }, [blk("heading", { text: "Growth", level: 3 }), blk("text", { text: "Ads, SEO, retention loops, lifecycle." })]),
        ]),
      ]),
    ],
  },
  {
    id: "blog-index",
    label: "Blog index",
    description: "Latest posts grid.",
    icon: "📝",
    defaultSlug: "/blog",
    defaultTitle: "Blog",
    build: () => [
      blk("section", { fullWidth: false }, [
        blk("heading", { text: "Latest posts", level: 1 }),
        blk("text", { text: "Notes from the team." }),
        blk("html", {
          html: `
<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
  <article style="padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
    <p style="font-size:11px; opacity:0.5; margin:0 0 8px; text-transform:uppercase; letter-spacing:0.18em;">Notes · 5 min read</p>
    <h3 style="font-family:var(--font-playfair, Georgia, serif); font-size:20px; margin:0 0 8px;">First post title</h3>
    <p style="opacity:0.75; line-height:1.5; margin:0;">Replace with the latest post excerpt. Wire to /admin/blog when you're ready.</p>
  </article>
  <article style="padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
    <p style="font-size:11px; opacity:0.5; margin:0 0 8px; text-transform:uppercase; letter-spacing:0.18em;">Tutorial · 8 min read</p>
    <h3 style="font-family:var(--font-playfair, Georgia, serif); font-size:20px; margin:0 0 8px;">Second post title</h3>
    <p style="opacity:0.75; line-height:1.5; margin:0;">Another placeholder excerpt.</p>
  </article>
</div>
        `.trim() }),
      ]),
    ],
  },
  // ── Aqua Incubator ────────────────────────────────────────────────────
  // Notion-style client-onboarding portal — chapter §15e. Auto-applied
  // when phase = "Epic Intro" via selectStarterForPhase().
  ...buildAquaIncubatorTemplates(),
  // ── Therapist / healing brand-page templates (R004) ──────────────────
  // 7 starter pages a typical Aqua client storefront needs. Composite
  // "brand-page-pack" starter seeds all 7 in one apply.
  ...buildBrandPageTemplates(),
];

const AQUA_INCUBATOR_COVER = "/aqua-incubator/cover-roots.jpg";
const AQUA_INCUBATOR_ICON = "/aqua-incubator/icon-incubator.png";
const AQUA_INCUBATOR_CARD_COVER = "/aqua-incubator/card-cover.jpg";

function aquaIncubatorRootBody(): Block[] {
  return [
    blk("hero", {
      eyebrow: "",
      headline: "Welcome to the Aqua Incubator",
      subhead: "Your Onboarding Control Panel — Please Follow Each Step in Order.",
      ctaLabel: "",
      ctaHref: "",
      backgroundImage: AQUA_INCUBATOR_COVER,
    }),
    blk("icon", { image: AQUA_INCUBATOR_ICON, offsetY: -32, label: "" }),
    blk("heading", { text: "THE OPULENCE INCUBATOR 3.0", level: 1 }),
    blk("text", { text: "Your Onboarding Control Panel — Please Follow Each Step in Order." }),
    blk("property-strip", {
      // Placeholders resolve via `applyIncubatorClientMetadata` when
      // the template instantiates with client context — falls back to
      // sensible literals when metadata is absent (preview / smoke).
      rows: [
        { key: "Phase",   type: "phase",  value: "{{phase}}" },
        { key: "Plan",    type: "select", value: "{{planTier}}" },
        { key: "Started", type: "date",   value: "{{onboardingStartedAt}}" },
      ],
      collapsedLabel: "3 properties",
    }),
    blk("toggle", { label: "Your First Action Step - Please Open Me!", defaultOpen: false }, [
      blk("text", { text: "Watch the introduction video, then click into 'Aqua Onboarding - Start Here!' below." }),
    ]),
    blk("toggle", { label: "Need Some Help? Get In Touch Here.", defaultOpen: false }, [
      blk("text", { text: "Send a WhatsApp message — operator overrides this with the real link." }),
    ]),
    blk("toggle", { label: "Have an Idea? Your Feedback Drives Our System Evolution.", defaultOpen: false }, [
      blk("text", { text: "Drop your idea in the feedback form — operator wires the form id." }),
    ]),
    blk("divider", {}),
    blk("card-grid", {
      heading: "Incubator Navigation",
      columns: 2,
      items: [
        { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "💎", label: "Aqua Onboarding - Start Here!", href: "./onboarding" },
        { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "🏛", label: "My Client Portal - Access",     href: "./client-portal" },
        { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "✨", label: "Aqua Resources Lite - Bonus!",  href: "./resources" },
        { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "🌊", label: "Discover AquaOasis-Web",         href: "./discover" },
      ],
    }),
    blk("divider", {}),
  ];
}

function aquaSubPage(title: string, caption: string, body: Block[]): Block[] {
  return [
    blk("hero", { headline: title, subhead: caption, backgroundImage: AQUA_INCUBATOR_COVER, ctaLabel: "", ctaHref: "" }),
    blk("icon", { image: AQUA_INCUBATOR_ICON, offsetY: -32 }),
    blk("heading", { text: title, level: 1 }),
    ...body,
  ];
}

function buildAquaIncubatorTemplates(): PageTemplate[] {
  return [
    {
      id: "aqua-incubator",
      label: "Aqua Incubator",
      description: "Notion-style client-onboarding portal (Epic Intro phase).",
      icon: "💎",
      defaultSlug: "/",
      defaultTitle: "Welcome to the Aqua Incubator",
      build: aquaIncubatorRootBody,
    },
    {
      id: "aqua-incubator-onboarding",
      label: "Aqua Onboarding",
      description: "Sub-page: onboarding video + first-action toggles.",
      icon: "💎",
      defaultSlug: "/onboarding",
      defaultTitle: "Aqua Onboarding - Start Here!",
      build: () => aquaSubPage(
        "Aqua Onboarding - Start Here!",
        "Watch the intro and complete each form below.",
        [
          blk("video-embed", { provider: "raw", url: "" }),
          blk("toggle", { label: "Introduction", defaultOpen: true }, [
            blk("text", { text: "Welcome — operator replaces this with the introduction copy." }),
          ]),
          blk("button", { label: "System Production Form", href: "#", variant: "primary" }),
          blk("button", { label: "My Minimum Viable Business Checklist", href: "#", variant: "secondary" }),
        ],
      ),
    },
    {
      id: "aqua-incubator-portal",
      label: "My Client Portal",
      description: "Sub-page: bridge button into the client's Aqua portal.",
      icon: "🏛",
      defaultSlug: "/client-portal",
      defaultTitle: "My Client Portal - Access",
      build: () => aquaSubPage(
        "My Client Portal - Access",
        "Your gateway into the live Aqua portal.",
        [
          blk("toggle", { label: "Introduction", defaultOpen: true }, [
            blk("text", { text: "Click the button below to enter your portal." }),
          ]),
          blk("button", {
            label: "Click Me To Enter Your Portal!",
            href: "/portal/customer",
            variant: "primary",
            hoverAnim: "lift",
          }),
        ],
      ),
    },
    {
      id: "aqua-incubator-resources",
      label: "Aqua Resources Lite",
      description: "Sub-page: modules + AI assistants + tutorial toggles.",
      icon: "✨",
      defaultSlug: "/resources",
      defaultTitle: "Aqua Resources Lite - Bonus!",
      build: () => aquaSubPage(
        "Aqua Resources Lite - Bonus!",
        "All Things Aqua — modules, assistants, tutorials.",
        [
          blk("card-grid", {
            heading: "Aqua Resources",
            columns: 2,
            items: [
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "📚", label: "Incubator Modules", href: "#" },
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "🤖", label: "Personal AI Assistants", href: "#" },
            ],
          }),
          blk("toggle", { label: "AquaSuite GHL Tutorial" }, [blk("text", { text: "Tutorial coming soon." })]),
          blk("toggle", { label: "My Business OS Tutorial" }, [blk("text", { text: "Tutorial coming soon." })]),
          blk("toggle", { label: "Where time is no longer tied to income" }, [blk("text", { text: "Mythos copy — operator override." })]),
        ],
      ),
    },
    {
      id: "aqua-incubator-discover",
      label: "Discover AquaOasis-Web",
      description: "Sub-page: brand discovery cards.",
      icon: "🌊",
      defaultSlug: "/discover",
      defaultTitle: "Discover AquaOasis-Web",
      build: () => aquaSubPage(
        "Discover AquaOasis-Web",
        "All Things Aqua — community, philosophy, charity, affiliates.",
        [
          blk("card-grid", {
            heading: "All Things Aqua",
            columns: 2,
            items: [
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "📜", label: "Aqua Philosophy",     href: "#" },
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "👥", label: "Meet the Team",        href: "#" },
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "💬", label: "Aqua Community",       href: "#" },
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "❤️", label: "Charity & Impact",      href: "#" },
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "📣", label: "Follow the Movement",  href: "#" },
              { coverImg: AQUA_INCUBATOR_CARD_COVER, icon: "🤝", label: "Become an Affiliate",  href: "#" },
            ],
          }),
        ],
      ),
    },
  ];
}

// IDs of every Aqua Incubator template (root + 4 sub-pages). Used by
// applyStarterVariant to seed all 5 pages when "aqua-incubator" is
// applied as a starter (chapter §15e: each card destination is itself
// a page using the same anatomy).
export const AQUA_INCUBATOR_TEMPLATE_IDS: readonly string[] = [
  "aqua-incubator",
  "aqua-incubator-onboarding",
  "aqua-incubator-portal",
  "aqua-incubator-resources",
  "aqua-incubator-discover",
];

// IDs of the 7 brand-page presets. The composite `brand-page-pack`
// starter seeds all of them as siblings in one applyStarterVariant
// pass (chapter R004 Goal B).
export const BRAND_PAGE_TEMPLATE_IDS: readonly string[] = [
  "brand-about",
  "brand-our-story",
  "brand-philosophy",
  "brand-sustainability",
  "brand-faq",
  "brand-contact",
  "brand-lab-tests",
];

function brandHero(headline: string, subhead: string): Block {
  return blk("hero", { headline, subhead, ctaLabel: "", ctaHref: "" });
}

function buildBrandPageTemplates(): PageTemplate[] {
  return [
    {
      id: "brand-about",
      label: "About",
      description: "Brand about page — hero + paragraph + team grid.",
      icon: "👋",
      defaultSlug: "/about",
      defaultTitle: "About",
      build: () => [
        brandHero("About us", "The people, the practice, the why."),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Our practice", level: 2 }),
          blk("text", { text: "We're a small team of practitioners who believe healing happens in relationship. Every session is a co-creation. Every client is a story we have the privilege to walk beside." }),
        ]),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Meet the team", level: 2 }),
          blk("card-grid", {
            heading: "",
            columns: 3,
            items: [
              { coverImg: "", icon: "👤", label: "Lead practitioner",      href: "#" },
              { coverImg: "", icon: "👤", label: "Senior associate",       href: "#" },
              { coverImg: "", icon: "👤", label: "Practice manager",       href: "#" },
            ],
          }),
        ]),
      ],
    },
    {
      id: "brand-our-story",
      label: "Our story",
      description: "Brand story — alternating image+text chapters.",
      icon: "📖",
      defaultSlug: "/our-story",
      defaultTitle: "Our story",
      build: () => [
        brandHero("Our story", "How a question became a practice."),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Chapter one — the question", level: 2 }),
          blk("text", { text: "It started with a simple question: what if healing wasn't a transaction? What if it was a relationship?" }),
        ]),
        blk("divider", {}),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Chapter two — the practice", level: 2 }),
          blk("text", { text: "From that question, a practice. From the practice, a community. From the community, a movement." }),
        ]),
        blk("divider", {}),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Chapter three — today", level: 2 }),
          blk("text", { text: "Today we serve clients across the world. The question still drives us. The relationship is still at the centre." }),
        ]),
      ],
    },
    {
      id: "brand-philosophy",
      label: "Philosophy",
      description: "Brand philosophy — principles list.",
      icon: "🌿",
      defaultSlug: "/philosophy",
      defaultTitle: "Philosophy",
      build: () => [
        brandHero("Our philosophy", "Five principles that guide every session."),
        blk("section", { fullWidth: false }, [
          blk("card-grid", {
            heading: "Principles",
            columns: 2,
            items: [
              { coverImg: "", icon: "🪞", label: "Honesty over comfort",      href: "#" },
              { coverImg: "", icon: "🌳", label: "Roots before reach",        href: "#" },
              { coverImg: "", icon: "🤲", label: "Service as practice",       href: "#" },
              { coverImg: "", icon: "🕯️", label: "Slow over fast",            href: "#" },
              { coverImg: "", icon: "🌊", label: "Flow with what is",         href: "#" },
            ],
          }),
        ]),
      ],
    },
    {
      id: "brand-sustainability",
      label: "Sustainability",
      description: "Brand sustainability — impact metrics + commitments.",
      icon: "♻️",
      defaultSlug: "/sustainability",
      defaultTitle: "Sustainability",
      build: () => [
        brandHero("Our impact", "Measured, reported, improved."),
        blk("stats-bar", {
          items: [
            { label: "Trees planted",        value: "2,400" },
            { label: "Carbon offset (tons)", value: "12" },
            { label: "% recycled packaging", value: "100%" },
          ],
        }),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Our commitments", level: 2 }),
          blk("toggle", { label: "Carbon-neutral by 2027" }, [
            blk("text", { text: "We track every shipment, every flight, every kilowatt. Independent verification by a third-party body." }),
          ]),
          blk("toggle", { label: "Plastic-free packaging" }, [
            blk("text", { text: "100% recycled or biodegradable. No exceptions." }),
          ]),
          blk("toggle", { label: "1% for the planet" }, [
            blk("text", { text: "1% of revenue donated to environmental causes — annually published." }),
          ]),
        ]),
      ],
    },
    {
      id: "brand-faq",
      label: "FAQ",
      description: "Brand FAQ — accordion of toggle blocks.",
      icon: "❓",
      defaultSlug: "/faq",
      defaultTitle: "FAQ",
      build: () => [
        brandHero("Frequently asked", "The questions we hear most."),
        blk("section", { fullWidth: false }, [
          blk("toggle", { label: "How do I book a session?" }, [
            blk("text", { text: "Use the contact form, or call us directly. We'll match you with the right practitioner." }),
          ]),
          blk("toggle", { label: "What's your cancellation policy?" }, [
            blk("text", { text: "24 hours' notice — we know life happens. Three or more late cancellations and we'll have a conversation." }),
          ]),
          blk("toggle", { label: "Do you take insurance?" }, [
            blk("text", { text: "We can provide receipts for out-of-network reimbursement. Direct billing varies by carrier — ask us." }),
          ]),
          blk("toggle", { label: "Are sessions remote or in-person?" }, [
            blk("text", { text: "Both. Most clients mix. The practitioner will guide what fits your work." }),
          ]),
          blk("toggle", { label: "How long is each session?" }, [
            blk("text", { text: "60 or 90 minutes. The first session is always 90." }),
          ]),
        ]),
      ],
    },
    {
      id: "brand-contact",
      label: "Contact",
      description: "Brand contact — form + map placeholder.",
      icon: "✉️",
      defaultSlug: "/contact",
      defaultTitle: "Contact",
      build: () => [
        brandHero("Get in touch", "Tell us where you are. We'll meet you there."),
        blk("section", { fullWidth: false }, [
          blk("contact-form", {
            heading: "Send us a message",
            subheading: "We respond within one business day.",
            submitLabel: "Send",
            showPhone: true,
            formName: "contact",
          }),
        ]),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Find us", level: 2 }),
          blk("map", { address: "" }),
        ]),
      ],
    },
    {
      id: "brand-lab-tests",
      label: "Lab tests & certifications",
      description: "Brand lab tests — cert grid + downloads.",
      icon: "🧪",
      defaultSlug: "/lab-tests",
      defaultTitle: "Lab tests & certifications",
      build: () => [
        brandHero("Lab tests & certifications", "Independently verified, publicly available."),
        blk("section", { fullWidth: false }, [
          blk("card-grid", {
            heading: "Certifications",
            columns: 3,
            items: [
              { coverImg: "", icon: "✅", label: "ISO 9001",                href: "#" },
              { coverImg: "", icon: "🌿", label: "Organic certified",       href: "#" },
              { coverImg: "", icon: "🔬", label: "Third-party lab tested",  href: "#" },
            ],
          }),
        ]),
        blk("section", { fullWidth: false }, [
          blk("heading", { text: "Downloads", level: 2 }),
          blk("toggle", { label: "Latest lab report (PDF)" }, [
            blk("text", { text: "Operator: link the PDF here." }),
          ]),
          blk("toggle", { label: "Certificate of analysis" }, [
            blk("text", { text: "Operator: link the COA here." }),
          ]),
        ]),
      ],
    },
  ];
}

// Selects the brand-page composite pack id when the operator picks
// "Use brand pack" at "+ New page". Pure helper — pairs with
// `BRAND_PAGE_TEMPLATE_IDS` for sibling-seeding in `applyStarterVariant`.
export const BRAND_PAGE_PACK_ID = "brand-page-pack";

export function getTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find(t => t.id === id);
}

// Phase-driven starter selection. T2 fulfillment calls this when phase
// transitions; "Epic Intro" → "aqua-incubator". Foundation hook only;
// T1's "+ New client" modal exposes it as a toggleable default.
export function selectStarterForPhase(phase: string | null | undefined): string | null {
  if (!phase) return null;
  if (phase === "Epic Intro") return "aqua-incubator";
  return null;
}
