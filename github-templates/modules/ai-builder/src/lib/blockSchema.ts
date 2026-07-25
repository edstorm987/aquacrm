// Block-library schema rendering — used to compose the system prompt
// + validate model output. Round-7.
//
// The plugin doesn't read the website-editor's BLOCK_REGISTRY at
// runtime — that creates a cross-plugin source coupling we don't
// want. Instead, the foundation injects a `BlockSchemaPort` at boot
// (when website-editor is installed) which exposes the registered
// block ids + their field schemas in a JSON-serialisable shape. The
// plugin builds the system prompt from that.
//
// When the port isn't injected (dev mode, website-editor not
// installed), the plugin falls back to a baked-in catalogue of the
// most common block ids so smoke + standalone dev still work.

import type { BlockTreeNode } from "./domain";

// ─── Schema shape (what the port returns / the prompt encodes) ──────────────

export interface BlockFieldSchema {
  key: string;
  label: string;
  type: "text" | "textarea" | "url" | "color" | "select" | "number" | "boolean" | "image" | "richtext";
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

export interface BlockSchemaEntry {
  type: string;             // block id (e.g. "heading", "product-grid")
  label: string;
  category: string;         // "layout" | "content" | "media" | "commerce" | "auth" | "advanced" | string
  isContainer: boolean;     // can have children?
  defaultProps: Record<string, unknown>;
  fields: BlockFieldSchema[];
  // Cross-plugin metadata.
  requiresPlugin?: string;
}

export interface BlockSchemaPort {
  list(): BlockSchemaEntry[];
  has(blockType: string): boolean;
  // Optional — when implemented the validator runs the same Round-3
  // descriptor checks the website-editor uses (icon, label, etc.).
  describe?(blockType: string): BlockSchemaEntry | null;
}

// ─── Foundation injection ────────────────────────────────────────────────

let port: BlockSchemaPort | null = null;

export function setBlockSchemaPort(impl: BlockSchemaPort | null): void {
  port = impl;
}

export function getBlockSchemaPort(): BlockSchemaPort | null {
  return port;
}

// ─── Fallback catalogue (used when the port isn't injected) ─────────────────

const FALLBACK_CATALOGUE: BlockSchemaEntry[] = [
  // Layout
  { type: "section",   label: "Section",   category: "layout",  isContainer: true,  defaultProps: { fullWidth: false }, fields: [{ key: "fullWidth", label: "Full-bleed background", type: "boolean", default: false }] },
  { type: "row",       label: "Row",       category: "layout",  isContainer: true,  defaultProps: { gap: "16px" }, fields: [{ key: "gap", label: "Gap", type: "text", default: "16px" }] },
  { type: "column",    label: "Column",    category: "layout",  isContainer: true,  defaultProps: { gap: "12px" }, fields: [{ key: "gap", label: "Gap", type: "text", default: "12px" }] },
  { type: "grid",      label: "Grid",      category: "layout",  isContainer: true,  defaultProps: { columns: 3, gap: "24px" }, fields: [{ key: "columns", label: "Columns", type: "number", default: 3 }, { key: "gap", label: "Gap", type: "text", default: "24px" }] },
  { type: "spacer",    label: "Spacer",    category: "layout",  isContainer: false, defaultProps: { height: "32px" }, fields: [{ key: "height", label: "Height", type: "text", default: "32px" }] },
  { type: "divider",   label: "Divider",   category: "layout",  isContainer: false, defaultProps: { color: "rgba(255,255,255,0.1)" }, fields: [{ key: "color", label: "Colour", type: "color" }] },

  // Content
  { type: "heading",   label: "Heading",   category: "content", isContainer: false, defaultProps: { text: "Your headline", level: 2 }, fields: [{ key: "text", label: "Text", type: "text" }, { key: "level", label: "Level", type: "select", options: [{ value: "1", label: "H1" }, { value: "2", label: "H2" }, { value: "3", label: "H3" }] }] },
  { type: "text",      label: "Text",      category: "content", isContainer: false, defaultProps: { text: "Add your copy here." }, fields: [{ key: "text", label: "Text", type: "richtext" }] },
  { type: "button",    label: "Button",    category: "content", isContainer: false, defaultProps: { label: "Click me", href: "#", variant: "primary" }, fields: [{ key: "label", label: "Label", type: "text" }, { key: "href", label: "URL", type: "url" }] },
  { type: "hero",      label: "Hero",      category: "content", isContainer: false, defaultProps: { headline: "Build something beautiful" }, fields: [{ key: "headline", label: "Headline", type: "text" }, { key: "subhead", label: "Sub-headline", type: "textarea" }, { key: "ctaLabel", label: "CTA label", type: "text" }, { key: "ctaHref", label: "CTA URL", type: "url" }] },
  { type: "cta",       label: "Call to action", category: "content", isContainer: false, defaultProps: { headline: "Ready to start?" }, fields: [{ key: "headline", label: "Headline", type: "text" }, { key: "ctaLabel", label: "CTA label", type: "text" }, { key: "ctaHref", label: "CTA URL", type: "url" }] },
  { type: "feature-grid", label: "Feature grid", category: "content", isContainer: false, defaultProps: { heading: "What's included", columns: 3 }, fields: [{ key: "heading", label: "Heading", type: "text" }, { key: "columns", label: "Columns", type: "number" }] },
  { type: "testimonials", label: "Testimonials", category: "content", isContainer: false, defaultProps: { title: "Loved by founders" }, fields: [{ key: "title", label: "Title", type: "text" }] },
  { type: "faq",       label: "FAQ",       category: "content", isContainer: false, defaultProps: { heading: "Frequently asked" }, fields: [{ key: "heading", label: "Heading", type: "text" }] },

  // Media
  { type: "image",     label: "Image",     category: "media",   isContainer: false, defaultProps: { src: "", alt: "", width: "100%" }, fields: [{ key: "src", label: "Image URL", type: "image" }, { key: "alt", label: "Alt text", type: "text" }] },
  { type: "video",     label: "Video",     category: "media",   isContainer: false, defaultProps: { src: "", controls: true }, fields: [{ key: "src", label: "Video URL", type: "url" }] },

  // Commerce (cross-plugin — requires ecommerce)
  { type: "product-card", label: "Product card", category: "commerce", isContainer: false, defaultProps: { productHandle: "" }, fields: [{ key: "productHandle", label: "Product handle", type: "text" }], requiresPlugin: "ecommerce" },
  { type: "product-grid", label: "Product grid", category: "commerce", isContainer: false, defaultProps: { collectionHandle: "all", columns: 3, limit: 9 }, fields: [{ key: "collectionHandle", label: "Collection handle", type: "text" }, { key: "columns", label: "Columns", type: "number" }, { key: "limit", label: "Max items", type: "number" }], requiresPlugin: "ecommerce" },
];

export function listBlockSchemas(): BlockSchemaEntry[] {
  if (port) return port.list();
  return FALLBACK_CATALOGUE;
}

export function hasBlockType(type: string): boolean {
  if (port) return port.has(type);
  return FALLBACK_CATALOGUE.some(e => e.type === type);
}

// ─── Validator ───────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

// Validate a block tree against the registered block types. Walks
// recursively. Caps tree depth at 8 levels to stop the model from
// generating runaway trees.
export function validateBlockTree(
  tree: BlockTreeNode[],
  opts: { maxDepth?: number; allowUnknown?: boolean } = {},
): { ok: boolean; errors: ValidationError[] } {
  const maxDepth = opts.maxDepth ?? 8;
  const errors: ValidationError[] = [];
  walk(tree, "$", 0);
  return { ok: errors.length === 0, errors };

  function walk(nodes: BlockTreeNode[], path: string, depth: number): void {
    if (depth > maxDepth) {
      errors.push({ path, message: `Tree exceeds max depth ${maxDepth}.` });
      return;
    }
    if (!Array.isArray(nodes)) {
      errors.push({ path, message: "Expected an array of blocks." });
      return;
    }
    nodes.forEach((node, i) => {
      const localPath = `${path}[${i}]`;
      if (!node || typeof node !== "object") {
        errors.push({ path: localPath, message: "Block must be an object." });
        return;
      }
      if (typeof node.id !== "string" || node.id.length === 0) {
        errors.push({ path: `${localPath}.id`, message: "Missing or empty block id." });
      }
      if (typeof node.type !== "string") {
        errors.push({ path: `${localPath}.type`, message: "Missing block type." });
        return;
      }
      if (!opts.allowUnknown && !hasBlockType(node.type)) {
        errors.push({ path: `${localPath}.type`, message: `Unknown block type "${node.type}".` });
      }
      if (node.children !== undefined) {
        if (!Array.isArray(node.children)) {
          errors.push({ path: `${localPath}.children`, message: "children must be an array." });
        } else {
          walk(node.children, `${localPath}.children`, depth + 1);
        }
      }
    });
  }
}
