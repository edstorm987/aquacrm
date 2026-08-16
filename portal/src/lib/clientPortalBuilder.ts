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

export const CLIENT_PORTAL_BLOCK_REGISTRY: Array<{
  type: ClientPortalBlockType;
  label: string;
  description: string;
  category: "content" | "live-data" | "layout";
}> = [
  { type: "hero", label: "Feature hero", description: "A strong introduction with an optional action.", category: "content" },
  { type: "rich-text", label: "Text section", description: "Long-form guidance, context, or a client note.", category: "content" },
  { type: "callout", label: "Callout", description: "A focused message with an optional destination.", category: "content" },
  { type: "image", label: "Image", description: "A responsive image with accessible alternative text and caption.", category: "content" },
  { type: "video", label: "Video", description: "A direct video, YouTube or Vimeo embed with a controlled frame.", category: "content" },
  { type: "metrics", label: "Live metrics", description: "A read-only summary bound to current portal records.", category: "live-data" },
  { type: "service-grid", label: "Service grid", description: "The products and service systems assigned to this client.", category: "live-data" },
  { type: "product-hub", label: "Product hub", description: "A responsive launchpad into every assigned product's bespoke workspace.", category: "live-data" },
  { type: "file-list", label: "Latest files", description: "The newest files already shared with the client.", category: "live-data" },
  { type: "activity", label: "Activity stream", description: "Recent client-visible portal updates.", category: "live-data" },
  { type: "request-form", label: "Client request", description: "A real request form connected to the client's support and activity records.", category: "live-data" },
  { type: "approval-panel", label: "Decision panel", description: "Live design or launch approvals the signed-in client can answer.", category: "live-data" },
  { type: "file-upload", label: "File drop", description: "A secure upload surface connected to the client's project files.", category: "live-data" },
  { type: "link-list", label: "Link collection", description: "A curated set of destinations or resources.", category: "content" },
  { type: "custom-extension", label: "Custom extension", description: "A sandboxed HTML, CSS and JavaScript component placed inside this page.", category: "content" },
  { type: "divider", label: "Divider", description: "A restrained visual break between sections.", category: "layout" },
];

const BLOCK_TYPES = new Set<ClientPortalBlockType>([
  "system-content",
  ...CLIENT_PORTAL_BLOCK_REGISTRY.map(item => item.type),
]);
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

export function createPortalBlock(type: ClientPortalBlockType, id = portalBuilderId("block")): ClientPortalPageBlock {
  const base: ClientPortalPageBlock = {
    id,
    type,
    visible: true,
    visibilityRule: "always",
    productIds: [],
    productMatch: "any",
    responsive: { hideOnMobile: false, hideOnDesktop: false, spacing: "comfortable", alignment: "left" },
    width: "full",
    tone: type === "hero" ? "dark" : "surface",
    eyebrow: "Private workspace",
    title: blockTitle(type),
    body: blockBody(type),
    actionLabel: "",
    actionHref: "",
    items: type === "link-list"
      ? [{ id: portalBuilderId("item"), label: "Useful link", detail: "Add a short explanation", href: "https://" }]
      : [],
  };
  if (type === "metrics") base.dataSource = "portal-summary";
  if (type === "request-form") {
    base.eyebrow = "Send a request";
    base.title = "Tell us what you need";
    base.body = "Share the context once and it will join your live project record.";
    base.actionLabel = "Send request";
    base.requestType = "choose";
  }
  if (type === "approval-panel") {
    base.eyebrow = "Decisions";
    base.title = "Your approvals";
    base.body = "Review each decision and keep the work moving with a clear response.";
    base.approvalType = "all";
  }
  if (type === "file-upload") {
    base.eyebrow = "Project files";
    base.title = "Share a file";
    base.body = "Upload the context, inspiration, or recording the team needs.";
    base.actionLabel = "Upload file";
    base.uploadCategory = "brief";
  }
  if (type === "image" || type === "video") {
    base.eyebrow = "";
    base.title = type === "image" ? "Image" : "Video";
    base.body = "";
    base.media = { url: "", alt: "", caption: "", aspect: "landscape", fit: "cover" };
  }
  if (type === "custom-extension") {
    base.eyebrow = "";
    base.title = "Custom portal component";
    base.body = "";
    base.extension = {
      enabled: true,
      placement: "after-content",
      title: "Custom portal component",
      scopedCss: "",
      html: '<section class="portal-component"><h2>Your custom workspace</h2><p id="portal-client"></p></section>',
      css: ".portal-component { padding: 24px; border: 1px solid #d7d1c7; background: #fff; }",
      javascript: 'document.querySelector("#portal-client").textContent = `Prepared for ${window.AQUA_PORTAL.clientName}`;',
      minHeight: 240,
    };
  }
  if (type === "system-content") {
    base.eyebrow = "";
    base.title = "Live portal workspace";
    base.body = "The secure, data-backed portal page is rendered here.";
    base.tone = "quiet";
  }
  return base;
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

function blockTitle(type: ClientPortalBlockType): string {
  if (type === "hero") return "A space shaped around your work.";
  if (type === "callout") return "The next important thing";
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  if (type === "metrics") return "At a glance";
  if (type === "service-grid") return "Your connected services";
  if (type === "product-hub") return "Your service workspaces";
  if (type === "file-list") return "Latest shared files";
  if (type === "activity") return "Recent progress";
  if (type === "request-form") return "Tell us what you need";
  if (type === "approval-panel") return "Your approvals";
  if (type === "file-upload") return "Share a file";
  if (type === "link-list") return "Useful destinations";
  if (type === "custom-extension") return "Custom portal component";
  if (type === "divider") return "Section break";
  if (type === "system-content") return "Live portal workspace";
  return "A note for your journey";
}

function blockBody(type: ClientPortalBlockType): string {
  if (type === "hero") return "Bring the right context, decisions, and next steps together in one calm client experience.";
  if (type === "callout") return "Use this panel to draw attention to a decision, deadline, or next move.";
  if (type === "rich-text") return "Add the context your client needs here. Tokens such as {firstName} and {providerName} remain dynamic.";
  return "";
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
