// Public media promotion — the publish-time walker.
//
// On publish (see `publishPage`), approved website media that the editor
// stored inline as `data:` URIs is pushed to the public CDN bucket and the
// block tree is rewritten to reference the durable public URL instead. This
// is the "auto-public on publish" gate: draft blocks keep their inline data
// URLs (nothing public by default); only the published copy is promoted.
//
// Pure + injectable: the caller supplies a `promote(dataUrl) => publicUrl`
// function (backed by the `publicMedia` foundation port). Identical data URLs
// promote once (dedup). Every failure propagates and stops publication. A
// provider outage must never switch the page to an inline-media bypass path.

import type { Block } from "../types/block";

export type MediaPromoter = (dataUrl: string) => Promise<string>;

export interface PromotionResult {
  blocks: Block[];
  /** Count of distinct data URLs successfully promoted to public URLs. */
  promoted: number;
}

const MAX_PROP_DEPTH = 32;
const MAX_PROP_NODES = 10_000;
const MAX_PUBLIC_MEDIA_DATA_URL_CHARS = Math.ceil(8 * 1024 * 1024 * 4 / 3) + 1_024;
const MAX_STYLE_INSPECTION_CHARS = 256 * 1024;

export class PublicMediaPromotionTraversalError extends Error {
  readonly code = "public_media_promotion_traversal_refused";

  constructor(readonly reason: "cyclic-props" | "depth-limit" | "node-limit") {
    super(`Public media inspection could not safely traverse block props (${reason}).`);
    this.name = "PublicMediaPromotionTraversalError";
  }
}

export class PublicMediaPortUnavailableError extends Error {
  readonly code = "public_media_provider_unavailable";

  constructor() {
    super("Public media cannot be published because its inspected storage provider is unavailable.");
    this.name = "PublicMediaPortUnavailableError";
  }
}

export class PublicMediaPromotionPolicyError extends Error {
  readonly code = "public_media_promotion_policy_refused";

  constructor(readonly reason: "unsupported-data-url" | "encoded-size-limit" | "inline-data-in-style" | "style-size-limit") {
    super(`Public media publication refused (${reason}).`);
    this.name = "PublicMediaPromotionPolicyError";
  }
}

/**
 * CSS can spell a URL scheme with comments, C0 whitespace or identifier
 * escapes (`d\\61 ta:`). We do not rewrite style text without a real CSS
 * parser. Decode only enough of the CSS token grammar to detect a data scheme,
 * then fail publication closed so inline bytes cannot bypass the media port.
 */
function styleContainsDataUrl(value: string): boolean {
  const decoded = value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\(?:\r\n|[\n\r\f])/g, "")
    .replace(/\\([0-9a-f]{1,6})(?:[ \t\r\n\f])?/gi, (_match, hex: string) => {
      const point = Number.parseInt(hex, 16);
      return point === 0 || point > 0x10ffff
        ? "\ufffd"
        : String.fromCodePoint(point);
    })
    .replace(/\\([^\n\r\f0-9a-f])/gi, "$1")
    .replace(/[\u0000-\u0020]+/g, "")
    .toLowerCase();
  return decoded.includes("data:");
}

/**
 * Inspect a complete stored style surface, not only each leaf value. Browsers
 * parse the final serialised declaration text, so comment delimiters split
 * across two stored fields can change the meaning after the fields are joined.
 * The bounded canonical representation below preserves those boundaries for
 * inspection and fails closed before any public-media provider is called.
 */
export function assertPublicStyleSurfaceSafe(value: unknown): void {
  let traversedNodes = 0;
  let serialisedChars = 0;
  const ancestry = new WeakSet<object>();
  const parts: string[] = [];

  const append = (part: string): void => {
    serialisedChars += part.length;
    if (serialisedChars > MAX_STYLE_INSPECTION_CHARS) {
      throw new PublicMediaPromotionPolicyError("style-size-limit");
    }
    parts.push(part);
  };

  const visit = (entry: unknown, depth: number): void => {
    traversedNodes += 1;
    if (traversedNodes > MAX_PROP_NODES) {
      throw new PublicMediaPromotionTraversalError("node-limit");
    }
    if (depth > MAX_PROP_DEPTH) {
      throw new PublicMediaPromotionTraversalError("depth-limit");
    }
    if (typeof entry === "string") {
      append(entry);
      if (styleContainsDataUrl(entry)) {
        throw new PublicMediaPromotionPolicyError("inline-data-in-style");
      }
      return;
    }
    if (typeof entry === "number" || typeof entry === "boolean") {
      append(String(entry));
      return;
    }
    if (!Array.isArray(entry) && !isPlainRecord(entry)) return;
    if (ancestry.has(entry)) {
      throw new PublicMediaPromotionTraversalError("cyclic-props");
    }
    ancestry.add(entry);
    try {
      for (const [key, nested] of Object.entries(entry)) {
        append(key);
        append(":");
        visit(nested, depth + 1);
        append(";");
      }
    } finally {
      ancestry.delete(entry);
    }
  };

  visit(value, 0);
  if (styleContainsDataUrl(parts.join(""))) {
    throw new PublicMediaPromotionPolicyError("inline-data-in-style");
  }
}

function browserTreatsAsDataUrl(value: string): boolean {
  let offset = 0;
  while (offset < value.length && value.charCodeAt(offset) <= 0x20) offset += 1;
  let probe = "";
  while (offset < value.length && probe.length < 11) {
    const code = value.charCodeAt(offset);
    if (code !== 0x09 && code !== 0x0a && code !== 0x0d) probe += value[offset];
    offset += 1;
  }
  return /^data:/i.test(probe);
}

/**
 * Match the browser's URL preprocessing closely enough that leading C0
 * controls/space, or embedded tab/newline characters, cannot hide a data URL
 * from the publish gate. Return the canonical spelling that is inspected and
 * stored; ordinary text remains untouched.
 */
function promotableDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!browserTreatsAsDataUrl(value)) return null;
  if (value.length > MAX_PUBLIC_MEDIA_DATA_URL_CHARS) {
    throw new PublicMediaPromotionPolicyError("encoded-size-limit");
  }
  const canonical = value
    .replace(/^[\u0000-\u0020]+/, "")
    .replace(/[\u0009\u000a\u000d]/g, "");
  if (!/^data:(?:image|video)\//i.test(canonical)) {
    throw new PublicMediaPromotionPolicyError("unsupported-data-url");
  }
  return canonical;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export async function promoteBlockTreeMedia(
  blocks: Block[],
  promote: MediaPromoter,
): Promise<PromotionResult> {
  const cache = new Map<string, string>();
  let promoted = 0;
  let traversedNodes = 0;
  const ancestry = new WeakSet<object>();

  const resolve = async (dataUrl: string): Promise<string> => {
    const cached = cache.get(dataUrl);
    if (cached !== undefined) return cached;
    const url = await promote(dataUrl);
    promoted += 1;
    cache.set(dataUrl, url);
    return url;
  };

  /**
   * Props contain nested media collections (gallery photos, logos, testimonial
   * avatars, social-proof avatars). Walk JSON-like arrays/records rather than
   * only direct strings. Limits fail closed so a hostile cyclic/deep/huge prop
   * graph cannot bypass inspection or consume unbounded work during publish.
   */
  const promoteValue = async (value: unknown, depth: number): Promise<unknown> => {
    traversedNodes += 1;
    if (traversedNodes > MAX_PROP_NODES) {
      throw new PublicMediaPromotionTraversalError("node-limit");
    }
    if (depth > MAX_PROP_DEPTH) {
      throw new PublicMediaPromotionTraversalError("depth-limit");
    }
    const dataUrl = promotableDataUrl(value);
    if (dataUrl) return resolve(dataUrl);
    if (!Array.isArray(value) && !isPlainRecord(value)) return value;

    if (ancestry.has(value)) {
      throw new PublicMediaPromotionTraversalError("cyclic-props");
    }
    ancestry.add(value);
    try {
      if (Array.isArray(value)) {
        let next = value;
        for (let index = 0; index < value.length; index += 1) {
          const current = value[index];
          const promotedValue = await promoteValue(current, depth + 1);
          if (promotedValue !== current) {
            if (next === value) next = [...value];
            next[index] = promotedValue;
          }
        }
        return next;
      }

      let next: Record<string, unknown> = value;
      for (const [key, current] of Object.entries(value)) {
        const promotedValue = await promoteValue(current, depth + 1);
        if (promotedValue !== current) {
          if (next === value) next = { ...value };
          next[key] = promotedValue;
        }
      }
      return next;
    } finally {
      ancestry.delete(value);
    }
  };

  // Returns the same object reference when nothing changed, allowing callers
  // to skip unnecessary tree rebuilds.
  const promoteProps = async (
    props: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    return await promoteValue(props, 0) as Record<string, unknown>;
  };

  const promoteBlock = async (block: Block): Promise<Block> => {
    // These surfaces flow into inline CSS independently of props. A `data:` URL
    // here must not survive merely because the media promoter walks prop values.
    assertPublicStyleSurfaceSafe(block.styles);
    assertPublicStyleSurfaceSafe(block.themeStyles);
    const origProps = block.props ?? {};
    const props = await promoteProps(origProps);

    let variantsByGroup = block.variantsByGroup;
    if (block.variantsByGroup) {
      const nextGroups: NonNullable<Block["variantsByGroup"]> = {};
      let changed = false;
      for (const [group, variants] of Object.entries(block.variantsByGroup)) {
        const nextVariants = [];
        for (const variant of variants) {
          assertPublicStyleSurfaceSafe(variant.styles);
          if (variant.props) {
            const vp = await promoteProps(variant.props);
            if (vp !== variant.props) {
              changed = true;
              nextVariants.push({ ...variant, props: vp });
              continue;
            }
          }
          nextVariants.push(variant);
        }
        nextGroups[group] = nextVariants;
      }
      if (changed) variantsByGroup = nextGroups;
    }

    let children = block.children;
    if (block.children && block.children.length > 0) {
      const nextChildren: Block[] = [];
      let changed = false;
      for (const child of block.children) {
        const promotedChild = await promoteBlock(child);
        if (promotedChild !== child) changed = true;
        nextChildren.push(promotedChild);
      }
      if (changed) children = nextChildren;
    }

    if (props === origProps
      && variantsByGroup === block.variantsByGroup
      && children === block.children) {
      return block;
    }
    return { ...block, props, variantsByGroup, children };
  };

  let changed = false;
  const out: Block[] = [];
  for (const block of blocks) {
    const next = await promoteBlock(block);
    if (next !== block) changed = true;
    out.push(next);
  }
  return { blocks: changed ? out : blocks, promoted };
}
