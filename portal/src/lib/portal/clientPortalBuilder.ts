import type {
  ClientPortalBlockDataSource,
  ClientPortalBlockTone,
  ClientPortalBlockType,
  ClientPortalBlockVisibilityRule,
  ClientPortalBlockWidth,
  ClientPortalBlockAlignment,
  ClientPortalBlockSpacing,
  ClientPortalMediaAspect,
  ClientPortalMediaFit,
  ClientPortalBuilderDocument,
  ClientPortalCustomPage,
  ClientPortalDesignDocument,
  ClientPortalPageBlock,
  ClientPortalSectionId,
} from "@/server/types";
import { PORTAL_ELEMENT_PAIRINGS, createPortalBlockRecord } from "@/lib/elements/portalElements";

/**
 * The portal palette — 16 placeable things, in palette order.
 *
 * DERIVED since element-engine P3. This used to be a hand-written second block
 * registry sitting alongside the website-editor's `BLOCK_REGISTRY`, and 14 of
 * its 16 entries were an element the website already had under another name.
 * The list now comes from `PORTAL_ELEMENT_PAIRINGS`, where each entry states
 * which shared element it is a name for, so there is one vocabulary rather than
 * two that happen to agree.
 *
 * The exported shape and order are unchanged — `_ClientPortalStudio` renders
 * this array directly and was not touched.
 */
export const CLIENT_PORTAL_BLOCK_REGISTRY: Array<{
  type: ClientPortalBlockType;
  label: string;
  description: string;
  category: "content" | "live-data" | "layout";
}> = PORTAL_ELEMENT_PAIRINGS
  .filter(pairing => pairing.palette)
  .map(({ type, label, description, category }) => ({ type, label, description, category }));

const BLOCK_TYPES = new Set<ClientPortalBlockType>(PORTAL_ELEMENT_PAIRINGS.map(pairing => pairing.type));
const BLOCK_WIDTHS = new Set<ClientPortalBlockWidth>(["full", "half"]);
const BLOCK_TONES = new Set<ClientPortalBlockTone>(["surface", "dark", "accent", "quiet"]);
const DATA_SOURCES = new Set<ClientPortalBlockDataSource>(["portal-summary", "delivery", "billing", "results"]);
const VISIBILITY_RULES = new Set<ClientPortalBlockVisibilityRule>(["always", "with-products", "without-products", "single-product", "multiple-products", "specific-products"]);
const PRODUCT_MATCHES = new Set<ClientPortalPageBlock["productMatch"]>(["any", "all"]);
const BLOCK_SPACING = new Set<ClientPortalBlockSpacing>(["none", "compact", "comfortable", "spacious"]);
const BLOCK_ALIGNMENT = new Set<ClientPortalBlockAlignment>(["left", "center"]);
const MEDIA_ASPECTS = new Set<ClientPortalMediaAspect>(["landscape", "square", "portrait"]);
const MEDIA_FITS = new Set<ClientPortalMediaFit>(["cover", "contain"]);
const REQUEST_TYPES = new Set<NonNullable<ClientPortalPageBlock["requestType"]>>(["choose", "suggestion", "design-feedback", "support-ticket", "cancel", "move-provider"]);
const APPROVAL_TYPES = new Set<NonNullable<ClientPortalPageBlock["approvalType"]>>(["all", "design", "launch"]);
const UPLOAD_CATEGORIES = new Set<NonNullable<ClientPortalPageBlock["uploadCategory"]>>(["brief", "recording", "inspiration", "design-feedback", "misc"]);

/**
 * A freshly inserted portal block.
 *
 * The per-type defaults moved to `PORTAL_ELEMENT_PAIRINGS` in P3. They used to
 * be an if-ladder here plus two more in `blockTitle`/`blockBody` — the same
 * per-type knowledge written out three times, which is how a portal type could
 * quietly disagree with itself. One table now, next to the shared element each
 * type is a name for.
 *
 * The record this returns is byte-identical to the pre-merge one;
 * `scripts/smoke-portal-element-parity.test.ts` is what enforces that.
 */
export function createPortalBlock(type: ClientPortalBlockType, id = portalBuilderId("block")): ClientPortalPageBlock {
  return createPortalBlockRecord(type, id, () => portalBuilderId("item"));
}

export function createPortalCustomPage(label = "New page"): ClientPortalCustomPage {
  const id = portalBuilderId("page");
  return {
    id,
    slug: uniquePortalSlug(label, []),
    label,
    visible: true,
    blocks: [createPortalBlock("hero"), createPortalBlock("rich-text")],
  };
}

export function defaultPortalBuilder(sections: readonly ClientPortalSectionId[]): ClientPortalBuilderDocument {
  return {
    pages: Object.fromEntries(sections.map(section => [section, [createPortalBlock("system-content", `system-${section}`)]])),
    customPages: [],
  };
}

export function normalisePortalBuilder(
  value: unknown,
  sections: readonly ClientPortalSectionId[],
  fallback?: ClientPortalBuilderDocument,
): ClientPortalBuilderDocument {
  const input = objectValue(value);
  const inputPages = objectValue(input.pages);
  const fallbackPages = fallback?.pages ?? {};
  const pages = Object.fromEntries(sections.map(section => {
    const candidate = Array.isArray(inputPages[section])
      ? inputPages[section]
      : Array.isArray(fallbackPages[section])
        ? fallbackPages[section]
        : [createPortalBlock("system-content", `system-${section}`)];
    return [section, normaliseBlocks(candidate, true, section)];
  })) as ClientPortalBuilderDocument["pages"];

  const customCandidates = Array.isArray(input.customPages)
    ? input.customPages
    : fallback?.customPages ?? [];
  const usedSlugs: string[] = [];
  const customPages = customCandidates.slice(0, 24).flatMap((candidate, index) => {
    const page = objectValue(candidate);
    const label = cleanText(page.label, `Custom page ${index + 1}`, 60);
    const slug = uniquePortalSlug(cleanText(page.slug, label, 70), usedSlugs);
    usedSlugs.push(slug);
    return [{
      id: cleanIdentifier(page.id, `page-${index + 1}`),
      slug,
      label,
      visible: typeof page.visible === "boolean" ? page.visible : true,
      blocks: normaliseBlocks(page.blocks, false, `custom-${index + 1}`),
    }];
  });
  return { pages, customPages };
}

export function portalBuilder(document: ClientPortalDesignDocument): ClientPortalBuilderDocument {
  return document.builder ?? { pages: {}, customPages: [] };
}

export function portalPageBlocks(document: ClientPortalDesignDocument, section: ClientPortalSectionId): ClientPortalPageBlock[] {
  return portalBuilder(document).pages[section] ?? [createPortalBlock("system-content", `system-${section}`)];
}

export function portalCustomPage(document: ClientPortalDesignDocument, slug?: string): ClientPortalCustomPage | undefined {
  const clean = portalSlug(slug || "");
  return portalBuilder(document).customPages.find(page => page.visible && page.slug === clean);
}

export function portalBlockMatchesProducts(block: ClientPortalPageBlock, assignedProductIds: readonly string[]): boolean {
  const productCount = assignedProductIds.length;
  if (block.visibilityRule === "with-products") return productCount > 0;
  if (block.visibilityRule === "without-products") return productCount === 0;
  if (block.visibilityRule === "single-product") return productCount === 1;
  if (block.visibilityRule === "multiple-products") return productCount > 1;
  if (block.visibilityRule === "specific-products") {
    if (!block.productIds.length) return false;
    const assigned = new Set(assignedProductIds);
    return block.productMatch === "all"
      ? block.productIds.every(productId => assigned.has(productId))
      : block.productIds.some(productId => assigned.has(productId));
  }
  return true;
}

export function portalSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "page";
}

export function uniquePortalSlug(value: string, used: string[]): string {
  const base = portalSlug(value);
  if (!used.includes(base)) return base;
  let index = 2;
  while (used.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function portalBuilderId(prefix: string): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${random}`;
}

function normaliseBlocks(value: unknown, requireSystem: boolean, pageKey: string): ClientPortalPageBlock[] {
  const candidates = Array.isArray(value) ? value.slice(0, 40) : [];
  const blocks: ClientPortalPageBlock[] = candidates.flatMap((candidate, index) => {
    const input = objectValue(candidate);
    const type = BLOCK_TYPES.has(input.type as ClientPortalBlockType)
      ? input.type as ClientPortalBlockType
      : "rich-text";
    const base = createPortalBlock(type, cleanIdentifier(input.id, `${pageKey}-block-${index + 1}`));
    const dataSource = DATA_SOURCES.has(input.dataSource as ClientPortalBlockDataSource)
      ? input.dataSource as ClientPortalBlockDataSource
      : base.dataSource;
    const rawItems = Array.isArray(input.items) ? input.items.slice(0, 12) : [];
    return [{
      ...base,
      visible: typeof input.visible === "boolean" ? input.visible : base.visible,
      visibilityRule: VISIBILITY_RULES.has(input.visibilityRule as ClientPortalBlockVisibilityRule) ? input.visibilityRule as ClientPortalBlockVisibilityRule : base.visibilityRule,
      productIds: cleanIdentifierList(input.productIds, 24),
      productMatch: PRODUCT_MATCHES.has(input.productMatch as ClientPortalPageBlock["productMatch"]) ? input.productMatch as ClientPortalPageBlock["productMatch"] : base.productMatch,
      responsive: normaliseResponsive(input.responsive, base.responsive),
      width: BLOCK_WIDTHS.has(input.width as ClientPortalBlockWidth) ? input.width as ClientPortalBlockWidth : base.width,
      tone: BLOCK_TONES.has(input.tone as ClientPortalBlockTone) ? input.tone as ClientPortalBlockTone : base.tone,
      eyebrow: cleanText(input.eyebrow, base.eyebrow, 100),
      title: cleanText(input.title, base.title, 180),
      body: cleanOptionalText(input.body, base.body, 1_200),
      actionLabel: cleanOptionalText(input.actionLabel, base.actionLabel, 80),
      actionHref: cleanOptionalText(input.actionHref, base.actionHref, 500),
      dataSource,
      requestType: type === "request-form" && REQUEST_TYPES.has(input.requestType as NonNullable<ClientPortalPageBlock["requestType"]>) ? input.requestType as ClientPortalPageBlock["requestType"] : base.requestType,
      approvalType: type === "approval-panel" && APPROVAL_TYPES.has(input.approvalType as NonNullable<ClientPortalPageBlock["approvalType"]>) ? input.approvalType as ClientPortalPageBlock["approvalType"] : base.approvalType,
      uploadCategory: type === "file-upload" && UPLOAD_CATEGORIES.has(input.uploadCategory as NonNullable<ClientPortalPageBlock["uploadCategory"]>) ? input.uploadCategory as ClientPortalPageBlock["uploadCategory"] : base.uploadCategory,
      items: rawItems.map((item, itemIndex) => {
        const row = objectValue(item);
        return {
          id: cleanIdentifier(row.id, `${base.id}-item-${itemIndex + 1}`),
          label: cleanText(row.label, `Item ${itemIndex + 1}`, 100),
          detail: cleanOptionalText(row.detail, "", 300),
          href: cleanOptionalText(row.href, "", 500) || undefined,
          imageUrl: cleanOptionalText(row.imageUrl, "", 800) || undefined,
        };
      }),
      media: type === "image" || type === "video" ? normaliseBlockMedia(input.media, base.media) : undefined,
      extension: type === "custom-extension" ? normaliseBlockExtension(input.extension, base.extension) : undefined,
    }];
  });
  if (requireSystem && !blocks.some(block => block.type === "system-content")) {
    blocks.push(createPortalBlock("system-content", `system-${pageKey}`));
  }
  const seenSystem = new Set<string>();
  return blocks.filter(block => {
    if (block.type !== "system-content") return true;
    if (seenSystem.size) return false;
    seenSystem.add(block.id);
    return true;
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function cleanOptionalText(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function cleanIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{1,79}$/i.test(value) ? value : fallback;
}

function cleanIdentifierList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => typeof item === "string" && /^[a-z0-9][a-z0-9_-]{1,119}$/i.test(item) ? [item] : []))].slice(0, max);
}

function normaliseBlockExtension(value: unknown, fallback: ClientPortalPageBlock["extension"]): NonNullable<ClientPortalPageBlock["extension"]> {
  const input = objectValue(value);
  const base = fallback ?? createPortalBlock("custom-extension").extension!;
  const height = typeof input.minHeight === "number" && Number.isFinite(input.minHeight) ? input.minHeight : base.minHeight;
  return {
    enabled: true,
    placement: "after-content",
    title: cleanText(input.title, base.title, 100),
    scopedCss: "",
    html: cleanOptionalText(input.html, base.html, 40_000),
    css: cleanOptionalText(input.css, base.css, 30_000),
    javascript: cleanOptionalText(input.javascript, base.javascript, 40_000),
    minHeight: Math.min(1_200, Math.max(120, Math.round(height))),
  };
}

function normaliseResponsive(value: unknown, fallback: ClientPortalPageBlock["responsive"]): ClientPortalPageBlock["responsive"] {
  const input = objectValue(value);
  return {
    hideOnMobile: typeof input.hideOnMobile === "boolean" ? input.hideOnMobile : fallback.hideOnMobile,
    hideOnDesktop: typeof input.hideOnDesktop === "boolean" ? input.hideOnDesktop : fallback.hideOnDesktop,
    spacing: BLOCK_SPACING.has(input.spacing as ClientPortalBlockSpacing) ? input.spacing as ClientPortalBlockSpacing : fallback.spacing,
    alignment: BLOCK_ALIGNMENT.has(input.alignment as ClientPortalBlockAlignment) ? input.alignment as ClientPortalBlockAlignment : fallback.alignment,
  };
}

function normaliseBlockMedia(value: unknown, fallback: ClientPortalPageBlock["media"]): NonNullable<ClientPortalPageBlock["media"]> {
  const input = objectValue(value);
  const base = fallback ?? { url: "", alt: "", caption: "", aspect: "landscape", fit: "cover" };
  return {
    url: cleanOptionalText(input.url, base.url, 1_000),
    alt: cleanOptionalText(input.alt, base.alt, 240),
    caption: cleanOptionalText(input.caption, base.caption, 500),
    aspect: MEDIA_ASPECTS.has(input.aspect as ClientPortalMediaAspect) ? input.aspect as ClientPortalMediaAspect : base.aspect,
    fit: MEDIA_FITS.has(input.fit as ClientPortalMediaFit) ? input.fit as ClientPortalMediaFit : base.fit,
  };
}
