import { isSafeBlockId, isSafeBlockType } from "@/engines/editor/elements/blockIdentity";
import {
  MAX_PUBLIC_MEDIA_BYTES,
  PublicMediaDataUrlError,
  parseDataUrl,
} from "@/lib/server/security/base64DataUrl";
import { publicUploadContentTypeAllowed } from "@/lib/shared/publicMediaLimits";
import type { Block } from "../types/block";

export const MAX_PAGE_BLOCK_DEPTH = 32;
export const MAX_PAGE_BLOCKS = 10_000;
export const MAX_PAGE_VALUE_NODES = 50_000;
export const MAX_PAGE_VALUE_DEPTH = 32;
export const MAX_PAGE_INLINE_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_PAGE_STRING_BYTES = 256 * 1024;
export const MAX_PAGE_TEXT_BYTES = 4 * 1024 * 1024;
export const MAX_PAGE_STYLE_BYTES = 256 * 1024;
const MAX_OBJECT_KEY_CHARS = 128;

export type PageBlockValidationReason =
  | "root-not-array"
  | "block-not-object"
  | "unsafe-block-id"
  | "duplicate-block-id"
  | "unsafe-block-type"
  | "props-not-object"
  | "children-not-array"
  | "unexpected-block-field"
  | "depth-limit"
  | "block-limit"
  | "node-limit"
  | "cycle-or-shared-reference"
  | "invalid-json-value"
  | "non-finite-number"
  | "object-key-limit"
  | "string-limit"
  | "text-limit"
  | "style-limit"
  | "invalid-data-url"
  | "inline-media-limit";

export class PageBlockValidationError extends Error {
  readonly code = "page_block_validation_refused";

  constructor(readonly reason: PageBlockValidationReason) {
    super(`Page block tree was refused (${reason}).`);
    this.name = "PageBlockValidationError";
  }
}

const BLOCK_FIELDS = new Set([
  "id", "type", "props", "styles", "children", "a11y", "seo",
  "themeStyles", "variantsByGroup", "binding", "visibility",
  // Block schema migration metadata retained by the canonical migration runner.
  "_v", "_migratedFrom",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

interface ValueWork {
  value: unknown;
  depth: number;
  style: boolean;
}

/**
 * Authoritative bounded validation for every server-owned page tree boundary.
 * The walker is iterative, so hostile depth is rejected without consuming the
 * JavaScript call stack. It also calculates decoded inline-media bytes rather
 * than trusting base64 character estimates.
 */
export function assertValidPageBlockTree(value: unknown): asserts value is Block[] {
  if (!Array.isArray(value)) throw new PageBlockValidationError("root-not-array");

  const seenObjects = new WeakSet<object>();
  seenObjects.add(value);
  const blockIds = new Set<string>();
  const blockStack: Array<{ value: unknown; depth: number }> = [];
  for (let index = value.length - 1; index >= 0; index -= 1) {
    blockStack.push({ value: value[index], depth: 1 });
  }

  let blockCount = 0;
  let valueNodes = 0;
  let inlineMediaBytes = 0;
  let textBytes = 0;
  let styleBytes = 0;
  const encoder = new TextEncoder();

  const valueStack: ValueWork[] = [];
  const queueValue = (nested: unknown, depth: number, style: boolean): void => {
    valueStack.push({ value: nested, depth, style });
  };

  const drainValues = (): void => {
    while (valueStack.length > 0) {
      const current = valueStack.pop()!;
      valueNodes += 1;
      if (valueNodes > MAX_PAGE_VALUE_NODES) throw new PageBlockValidationError("node-limit");
      if (current.depth > MAX_PAGE_VALUE_DEPTH) throw new PageBlockValidationError("depth-limit");

      const nested = current.value;
      if (typeof nested === "string") {
        const bytes = encoder.encode(nested).byteLength;
        if (current.style) {
          styleBytes += bytes;
          if (styleBytes > MAX_PAGE_STYLE_BYTES) throw new PageBlockValidationError("style-limit");
        }
        if (browserTreatsAsDataUrl(nested)) {
          let decoded;
          try {
            decoded = parseDataUrl(nested, MAX_PUBLIC_MEDIA_BYTES);
          } catch (error) {
            if (error instanceof PublicMediaDataUrlError) {
              throw new PageBlockValidationError(
                error.reason === "too-large" ? "inline-media-limit" : "invalid-data-url",
              );
            }
            throw error;
          }
          if (!decoded || decoded.dataUrl !== nested) {
            throw new PageBlockValidationError("invalid-data-url");
          }
          if (!publicUploadContentTypeAllowed(decoded.contentType)) {
            throw new PageBlockValidationError("invalid-data-url");
          }
          inlineMediaBytes += decoded.bytes.byteLength;
          if (inlineMediaBytes > MAX_PAGE_INLINE_MEDIA_BYTES) {
            throw new PageBlockValidationError("inline-media-limit");
          }
        } else {
          if (bytes > MAX_PAGE_STRING_BYTES) throw new PageBlockValidationError("string-limit");
          textBytes += bytes;
          if (textBytes > MAX_PAGE_TEXT_BYTES) throw new PageBlockValidationError("text-limit");
        }
        continue;
      }
      if (typeof nested === "number") {
        if (!Number.isFinite(nested)) throw new PageBlockValidationError("non-finite-number");
        continue;
      }
      if (typeof nested === "boolean" || nested === null) continue;
      if (typeof nested !== "object") throw new PageBlockValidationError("invalid-json-value");
      if (!Array.isArray(nested) && !isPlainRecord(nested)) {
        throw new PageBlockValidationError("invalid-json-value");
      }
      if (seenObjects.has(nested)) throw new PageBlockValidationError("cycle-or-shared-reference");
      seenObjects.add(nested);

      if (Array.isArray(nested)) {
        for (let index = nested.length - 1; index >= 0; index -= 1) {
          queueValue(nested[index], current.depth + 1, current.style);
        }
      } else {
        for (const [key, child] of Object.entries(nested)) {
          if (key.length > MAX_OBJECT_KEY_CHARS) throw new PageBlockValidationError("object-key-limit");
          const childStyle = current.style || /(?:css|style|background|color|font|border|shadow)$/i.test(key);
          queueValue(child, current.depth + 1, childStyle);
        }
      }
    }
  };

  while (blockStack.length > 0) {
    const current = blockStack.pop()!;
    if (current.depth > MAX_PAGE_BLOCK_DEPTH) throw new PageBlockValidationError("depth-limit");
    if (!isPlainRecord(current.value)) throw new PageBlockValidationError("block-not-object");
    if (seenObjects.has(current.value)) throw new PageBlockValidationError("cycle-or-shared-reference");
    seenObjects.add(current.value);
    blockCount += 1;
    if (blockCount > MAX_PAGE_BLOCKS) throw new PageBlockValidationError("block-limit");

    for (const key of Object.keys(current.value)) {
      if (!BLOCK_FIELDS.has(key)) throw new PageBlockValidationError("unexpected-block-field");
    }
    if (!isSafeBlockId(current.value.id)) throw new PageBlockValidationError("unsafe-block-id");
    if (blockIds.has(current.value.id)) throw new PageBlockValidationError("duplicate-block-id");
    blockIds.add(current.value.id);
    if (!isSafeBlockType(current.value.type)) throw new PageBlockValidationError("unsafe-block-type");
    if (!isPlainRecord(current.value.props)) throw new PageBlockValidationError("props-not-object");
    if (current.value.children !== undefined && !Array.isArray(current.value.children)) {
      throw new PageBlockValidationError("children-not-array");
    }

    queueValue(current.value.props, 0, false);
    for (const [field, style] of [
      ["styles", true], ["a11y", false], ["seo", false],
      ["themeStyles", true], ["variantsByGroup", false],
      ["binding", false], ["visibility", false],
      ["_v", false], ["_migratedFrom", false],
    ] as const) {
      if (current.value[field] !== undefined) queueValue(current.value[field], 0, style);
    }
    drainValues();

    const children = current.value.children as unknown[] | undefined;
    if (children) {
      // The children array itself participates in cycle/shared-reference checks.
      if (seenObjects.has(children)) throw new PageBlockValidationError("cycle-or-shared-reference");
      seenObjects.add(children);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        blockStack.push({ value: children[index], depth: current.depth + 1 });
      }
    }
  }
}
