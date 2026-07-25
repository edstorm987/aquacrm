// R042 — Page-type templates (landing / blog post / product / about /
// contact / FAQ).
//
// Pure data + factory: each template seeds a starting block tree plus
// SEO defaults (title / description / og*). Coexists with
// `components/pageTemplates.ts` — that one is the editor "Create page"
// modal's rich registry (13 entries; ecommerce shop/cart/checkout/...);
// this lib-level registry is the 6-page-type set the round prompt
// asked for, shaped for programmatic creation paths (storage layer
// imports, batch seeding, smoke).
//
// Block trees are intentionally minimal — operators expect to edit
// after picking a template, not to ship a finished page. Real visual
// polish comes from R027 block-catalog presets + R011 brand-kit CSS
// vars layering on top.

import type { Block, BlockTreeJSON } from "../types/block";
import { makeId } from "./ids";
import type { EditorPageSeo } from "../types/editorPage";

// ─── Types ────────────────────────────────────────────────────────────

export type PageTemplateId =
  | "landing" | "blog-post" | "product" | "about" | "contact" | "faq";

export interface PageTemplate {
  id: PageTemplateId;
  name: string;
  description: string;
  defaultSlug: string;
  blocks: BlockTreeJSON;
  seoDefaults: EditorPageSeo;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function blk(
  type: string,
  props: Record<string, unknown> = {},
  children?: Block[],
): Block {
  return {
    id: makeId("blk"),
    type,
    props,
    ...(children && children.length ? { children } : {}),
  };
}

// ─── Templates ───────────────────────────────────────────────────────

const LANDING: PageTemplate = {
  id: "landing",
  name: "Landing page",
  description: "Hero, features, testimonials, and a final CTA — the classic conversion shape.",
  defaultSlug: "/landing",
  blocks: [
    blk("hero", {
      headline: "Your headline here",
      subheadline: "One sentence on the problem you solve.",
      ctaText: "Get started",
      ctaHref: "#cta",
    }),
    blk("feature-grid", {
      heading: "What you get",
      columns: 3,
    }),
    blk("testimonials", { heading: "What people say" }),
    blk("cta", {
      heading: "Ready to start?",
      ctaText: "Sign up",
      ctaHref: "/signup",
    }),
  ],
  seoDefaults: {
    metaTitle: "Landing page",
    metaDescription: "A landing page describing what you offer and how to get started.",
    twitterCard: "summary_large_image",
  },
};

const BLOG_POST: PageTemplate = {
  id: "blog-post",
  name: "Blog post",
  description: "Headline, cover image, body copy, and an author byline.",
  defaultSlug: "/blog/post-title",
  blocks: [
    blk("heading", { text: "Your post title", level: 1 }),
    blk("image", { src: "", alt: "Cover image", width: 1200, height: 600 }),
    blk("text", { text: "Write your post body here." }),
    blk("author-bio", { name: "Author name", bio: "" }),
  ],
  seoDefaults: {
    metaTitle: "Blog post",
    metaDescription: "An article on our blog.",
    twitterCard: "summary_large_image",
  },
};

const PRODUCT: PageTemplate = {
  id: "product",
  name: "Product page",
  description: "Gallery, title, price, description, and a buy CTA.",
  defaultSlug: "/products/new-product",
  blocks: [
    blk("gallery", { images: [] }),
    blk("heading", { text: "Product name", level: 1 }),
    blk("text", { text: "Short product description." }),
    blk("product-card", {
      name: "Product name",
      price: 0,
      currency: "USD",
    }),
    blk("payment-button", { label: "Buy now" }),
  ],
  seoDefaults: {
    metaTitle: "Product",
    metaDescription: "Product details and purchase options.",
    twitterCard: "summary_large_image",
  },
};

const ABOUT: PageTemplate = {
  id: "about",
  name: "About",
  description: "Hero, story, team, and a closing CTA.",
  defaultSlug: "/about",
  blocks: [
    blk("hero", {
      headline: "About us",
      subheadline: "A short tagline.",
    }),
    blk("text", { text: "Our story…" }),
    blk("logo-grid", { heading: "Our team", columns: 4 }),
    blk("cta", {
      heading: "Want to work together?",
      ctaText: "Get in touch",
      ctaHref: "/contact",
    }),
  ],
  seoDefaults: {
    metaTitle: "About",
    metaDescription: "Learn more about our team and what we do.",
    twitterCard: "summary",
  },
};

const CONTACT: PageTemplate = {
  id: "contact",
  name: "Contact",
  description: "Heading, contact form, map, and hours.",
  defaultSlug: "/contact",
  blocks: [
    blk("heading", { text: "Contact us", level: 1 }),
    blk("contact-form", {
      fields: [
        { name: "name", label: "Name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "message", label: "Message", type: "textarea", required: true },
      ],
      submitLabel: "Send",
    }),
    blk("map", { address: "" }),
    blk("text", { text: "Hours: Mon–Fri, 9am–5pm" }),
  ],
  seoDefaults: {
    metaTitle: "Contact",
    metaDescription: "Get in touch with us — contact form, map, and hours.",
    twitterCard: "summary",
  },
};

const FAQ: PageTemplate = {
  id: "faq",
  name: "FAQ",
  description: "Heading and an accordion list of common questions.",
  defaultSlug: "/faq",
  blocks: [
    blk("heading", { text: "Frequently asked questions", level: 1 }),
    blk("accordion", {
      items: [
        { question: "What is this?", answer: "Replace this with your answer." },
        { question: "How do I get started?", answer: "Replace this with your answer." },
        { question: "How much does it cost?", answer: "Replace this with your answer." },
      ],
    }),
  ],
  seoDefaults: {
    metaTitle: "FAQ",
    metaDescription: "Answers to frequently asked questions.",
    twitterCard: "summary",
  },
};

// ─── Registry ────────────────────────────────────────────────────────

export const pageTemplates: readonly PageTemplate[] = [
  LANDING, BLOG_POST, PRODUCT, ABOUT, CONTACT, FAQ,
];

export function getPageTemplate(id: PageTemplateId): PageTemplate | undefined {
  return pageTemplates.find((t) => t.id === id);
}

// Apply a template to fresh page-creation inputs. The caller passes
// the desired slug + title; we slot in the template's blocks and SEO
// defaults. `slug` falls back to the template's `defaultSlug` when
// the caller hasn't picked one yet.
export interface ApplyResult {
  slug: string;
  title: string;
  blocks: BlockTreeJSON;
  seo: EditorPageSeo;
}

export function applyTemplate(
  id: PageTemplateId,
  override: { slug?: string; title?: string } = {},
): ApplyResult {
  const t = getPageTemplate(id);
  if (!t) throw new Error(`unknown template id: ${id}`);
  const title = override.title ?? t.name;
  const seo: EditorPageSeo = {
    ...t.seoDefaults,
    metaTitle: override.title ?? t.seoDefaults.metaTitle,
  };
  // Deep clone so caller mutations don't bleed into the registry.
  const blocks = JSON.parse(JSON.stringify(t.blocks)) as BlockTreeJSON;
  // Re-stamp ids — every applied tree gets fresh ids so two pages
  // created from the same template don't collide on `id` lookup.
  const restamp = (bs: Block[]): Block[] => bs.map((b) => {
    const next: Block = { ...b, id: makeId("blk") };
    if (b.children && b.children.length) next.children = restamp(b.children);
    return next;
  });
  return {
    slug: override.slug ?? t.defaultSlug,
    title,
    blocks: restamp(blocks),
    seo,
  };
}

// Disambiguate slug when creating multiple pages from the same
// template. Caller supplies the existing slugs in the site; we
// append `-2`, `-3`, … until we find an unused one. Idempotent:
// passing a unique slug returns it unchanged.
export function uniqueSlug(desired: string, existing: readonly string[]): string {
  const set = new Set(existing);
  if (!set.has(desired)) return desired;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${desired}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${desired}-${Date.now()}`;
}
