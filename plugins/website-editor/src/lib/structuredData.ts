// R037 — schema.org structured data per page.
//
// Pure JSON-LD generators driven by the block tree. Host injects the
// returned objects as `<script type="application/ld+json">` blobs in
// <head>. No foundation imports, no DOM, no fetch — every input is
// passed in.
//
// Coverage (this round):
//   - article block(s)        → Article schema
//   - product block(s)        → Product schema
//   - faq-item block runs     → FAQPage with mainEntity[]
//   - breadcrumb block        → BreadcrumbList
//   - opts.org always present → Organization (one per page)
//
// NOT in scope: Recipe / Event / LocalBusiness (R+1), nor inferring
// schema from non-typed content blocks (heading/text). The walker
// only reacts to typed kinds listed above.

import type { Block } from "../types/block";

// ─── Inputs ───────────────────────────────────────────────────────────

export interface OrganizationInput {
  name: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
}

export interface BuildJsonLdOpts {
  org: OrganizationInput;
  // Absolute base URL used when block props carry relative image / url
  // values. Optional — when absent the helper passes values through
  // unchanged (the renderer is allowed to ship relative URLs).
  baseUrl?: string;
}

export interface JsonLdPageInput {
  title?: string;
  blocks: Block[];
}

// JSON-LD output is structurally just JSON. We tag it with a `@type`
// so the validator can branch without re-walking. Consumers should
// treat this as `Record<string, unknown>` plus a known type sentinel.
export interface JsonLdObject {
  "@context": "https://schema.org";
  "@type": string;
  [k: string]: unknown;
}

// ─── Walker ───────────────────────────────────────────────────────────

function walk(blocks: readonly Block[], visit: (b: Block) => void): void {
  for (const b of blocks) {
    visit(b);
    if (b.children && b.children.length) walk(b.children, visit);
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// ─── Builders ─────────────────────────────────────────────────────────

function buildArticle(b: Block): JsonLdObject {
  const p = b.props ?? {};
  const out: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Article",
  };
  const headline = str(p.headline) ?? str(p.title);
  if (headline) out.headline = headline;
  const datePublished = str(p.datePublished) ?? str(p.publishedAt);
  if (datePublished) out.datePublished = datePublished;
  const author = str(p.author);
  if (author) out.author = { "@type": "Person", name: author };
  const image = str(p.image) ?? str(p.cover);
  if (image) out.image = image;
  const description = str(p.description) ?? str(p.excerpt);
  if (description) out.description = description;
  return out;
}

function buildProduct(b: Block): JsonLdObject {
  const p = b.props ?? {};
  const out: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Product",
  };
  const name = str(p.name) ?? str(p.title);
  if (name) out.name = name;
  const image = str(p.image);
  if (image) out.image = image;
  const description = str(p.description);
  if (description) out.description = description;

  const price = num(p.price);
  const currency = str(p.currency);
  if (price !== undefined || currency) {
    const offers: Record<string, unknown> = {
      "@type": "Offer",
    };
    if (price !== undefined) offers.price = price;
    if (currency) offers.priceCurrency = currency;
    const availability = str(p.availability);
    if (availability) offers.availability = availability;
    out.offers = offers;
  }
  return out;
}

function buildFaqPage(items: readonly Block[]): JsonlnFaq | null {
  const mainEntity: JsonLdObject[] = [];
  for (const it of items) {
    const p = it.props ?? {};
    const question = str(p.question);
    const answer = str(p.answer);
    if (!question || !answer) continue;
    mainEntity.push({
      "@context": "https://schema.org",
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    });
  }
  if (mainEntity.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}
type JsonlnFaq = JsonLdObject;

function buildBreadcrumb(b: Block): JsonLdObject | null {
  const items = (b.props?.items ?? b.props?.crumbs) as
    | Array<{ name?: string; url?: string }>
    | undefined;
  if (!Array.isArray(items) || items.length === 0) return null;
  const itemListElement = items
    .map((it, i) => {
      const name = str(it?.name);
      const item = str(it?.url);
      if (!name) return null;
      const entry: Record<string, unknown> = {
        "@type": "ListItem",
        position: i + 1,
        name,
      };
      if (item) entry.item = item;
      return entry;
    })
    .filter((x): x is Record<string, unknown> => x !== null);
  if (itemListElement.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}

function buildOrganization(org: OrganizationInput): JsonLdObject {
  const out: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
  };
  if (org.url) out.url = org.url;
  if (org.logo) out.logo = org.logo;
  if (org.sameAs && org.sameAs.length) out.sameAs = [...org.sameAs];
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────

export function buildJsonLd(
  page: JsonLdPageInput,
  opts: BuildJsonLdOpts,
): JsonLdObject[] {
  const out: JsonLdObject[] = [];
  // Walk and group: aggregate consecutive faq-item blocks into one
  // FAQPage. We bucket all faq-items found anywhere in the tree into
  // a single FAQPage per page (Google permits at most one) — the
  // "consecutive" framing isn't enforced, but the smoke verifies a
  // single FAQPage emits regardless of where the items sit.
  const faqItems: Block[] = [];
  walk(page.blocks, (b) => {
    switch (b.type) {
      case "article":
        out.push(buildArticle(b));
        return;
      case "product":
      case "product-card":
        out.push(buildProduct(b));
        return;
      case "faq-item":
        faqItems.push(b);
        return;
      case "breadcrumb": {
        const x = buildBreadcrumb(b);
        if (x) out.push(x);
        return;
      }
      default:
        return;
    }
  });
  const faq = buildFaqPage(faqItems);
  if (faq) out.push(faq);
  out.push(buildOrganization(opts.org));
  return out;
}

// ─── Validation ───────────────────────────────────────────────────────

export interface JsonLdIssue {
  type: string;       // schema @type the issue belongs to
  field: string;      // dotted path inside the object
  message: string;
}

const REQUIRED: Record<string, string[]> = {
  Article: ["headline", "datePublished", "author"],
  Product: ["name"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name"],
  Question: ["name", "acceptedAnswer"],
};

export function validateJsonLd(obj: JsonLdObject): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];
  if (obj["@context"] !== "https://schema.org") {
    issues.push({ type: String(obj["@type"] ?? "?"), field: "@context", message: "must be https://schema.org" });
  }
  const t = String(obj["@type"] ?? "");
  const required = REQUIRED[t];
  if (!required) {
    issues.push({ type: t, field: "@type", message: `unsupported @type ${t || "(missing)"}` });
    return issues;
  }
  for (const field of required) {
    const v = obj[field];
    const missing =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.length === 0) ||
      (Array.isArray(v) && v.length === 0);
    if (missing) {
      issues.push({ type: t, field, message: `missing required field ${field}` });
    }
  }
  // FAQPage — every mainEntity entry must validate as Question.
  if (t === "FAQPage" && Array.isArray(obj.mainEntity)) {
    for (let i = 0; i < (obj.mainEntity as unknown[]).length; i++) {
      const q = (obj.mainEntity as JsonLdObject[])[i];
      if (!q) continue;
      const sub = validateJsonLd(q);
      for (const s of sub) {
        issues.push({ type: s.type, field: `mainEntity[${i}].${s.field}`, message: s.message });
      }
    }
  }
  // BreadcrumbList — itemListElement entries must each have name + position.
  if (t === "BreadcrumbList" && Array.isArray(obj.itemListElement)) {
    const arr = obj.itemListElement as Array<Record<string, unknown>>;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || typeof it.name !== "string" || it.name.length === 0) {
        issues.push({ type: t, field: `itemListElement[${i}].name`, message: "missing name" });
      }
      if (typeof it?.position !== "number") {
        issues.push({ type: t, field: `itemListElement[${i}].position`, message: "missing position" });
      }
    }
  }
  return issues;
}

// ─── Serialization ────────────────────────────────────────────────────

// Escape JSON for safe embedding inside `<script type="application/ld+json">`.
// The risks:
//   - `</script>` inside a JSON string would close the host tag.
//   - U+2028 / U+2029 are valid JSON but break old JS parsers.
//   - `<!--` / `-->` could be parsed as comment markers in some legacy
//     UAs when the script is mishandled. Guarded for completeness.
export function serializeJsonLd(arr: readonly JsonLdObject[]): string {
  const json = JSON.stringify(arr);
  return json
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "\\u003C!--")
    .replace(/-->/g, "--\\u003E")
    .replace(new RegExp("\u2028", "g"), "\\u2028")
    .replace(new RegExp("\u2029", "g"), "\\u2029");
}
