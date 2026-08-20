// The interactive-SOP composer's palette + block factory.
//
// This is the SIMPLE side of the SOP Engine: it lets an agency assemble an
// interactive SOP out of a small set of the element-engine block types that
// already ship — no website-editor plugin, no drag canvas, no nested
// containers. It deliberately reuses the element engine for everything that
// matters:
//
//   • `createBlock(type)` seeds a block with the element's own `defaultProps`,
//     so a freshly-added block is already a valid element (its required props,
//     if any, are satisfied by the definition's defaults).
//   • The editable fields below are a hand-picked SUBSET of each element's real
//     `fields`, keyed by the same prop keys, so what the composer writes is what
//     the definition understands. Everything not listed keeps its default.
//
// Because both the composed tree and the library's `BlockRenderer` resolve the
// same registered definitions, what you compose here renders identically in the
// library viewer and validates against `validateSopBlockTree` (the element
// engine's own schema check) on save.
//
// Runtime-dependency-free by design: this module is imported by the client
// composer AND by the smoke suite, so it must not reach for `server-only`, the
// DOM, or a plugin. The one requirement is that a caller has loaded the element
// registry (the website block registry side-effect import) before calling
// `createComposerBlock` — the client component and the test both do.

import type { Block, BlockType } from "@/lib/elements";
import { createBlock } from "@/lib/elements";

/** The control a composer field draws — a thin, self-contained subset. */
export type ComposerFieldControl = "text" | "textarea" | "url" | "select" | "level";

export interface ComposerField {
  /** The element prop key this field writes — must match the definition. */
  key: string;
  label: string;
  control: ComposerFieldControl;
  placeholder?: string;
  /** For `control: "select"` — the closed option set (mirrors the element's). */
  options?: { value: string; label: string }[];
}

export interface ComposerBlockType {
  /** The element-engine block type. Must be a registered definition. */
  type: BlockType;
  label: string;
  /** One-line hint shown under the palette button. */
  hint: string;
  /** The editable fields — a subset of the element's real fields. */
  fields: ComposerField[];
}

/**
 * The composer palette. Five common content blocks the element engine already
 * supports, each mapped to the element type it renders as:
 *   heading → `heading`, paragraph → `text` (rich text),
 *   image → `image`, video → `video-embed`, callout → `banner`.
 * The prop keys below are exactly those the definitions declare, so editing
 * them keeps the block valid against the element schema.
 */
export const COMPOSER_BLOCK_TYPES: readonly ComposerBlockType[] = [
  {
    type: "heading",
    label: "Heading",
    hint: "A section title.",
    fields: [
      { key: "text", label: "Heading text", control: "text", placeholder: "Section heading" },
      { key: "level", label: "Level", control: "level" },
    ],
  },
  {
    type: "text",
    label: "Paragraph",
    hint: "Rich text / body copy.",
    fields: [
      { key: "text", label: "Text", control: "textarea", placeholder: "Write the step or explanation…" },
    ],
  },
  {
    type: "image",
    label: "Image",
    hint: "An illustrative image.",
    fields: [
      { key: "src", label: "Image URL", control: "url", placeholder: "https://…" },
      { key: "alt", label: "Alt text", control: "text", placeholder: "Describe the image" },
    ],
  },
  {
    type: "video-embed",
    label: "Video",
    hint: "Embed Vimeo / YouTube / Loom.",
    fields: [
      { key: "url", label: "Video URL", control: "url", placeholder: "https://…" },
      { key: "caption", label: "Caption", control: "text", placeholder: "Optional caption" },
    ],
  },
  {
    type: "banner",
    label: "Callout",
    hint: "A highlighted note.",
    fields: [
      { key: "text", label: "Text", control: "text", placeholder: "Something worth highlighting" },
      {
        key: "tone",
        label: "Tone",
        control: "select",
        options: [
          { value: "info", label: "Info" },
          { value: "promo", label: "Promo" },
          { value: "alert", label: "Alert" },
        ],
      },
    ],
  },
] as const;

/** Lookup the palette entry for a type, if it is one the composer offers. */
export function composerBlockType(type: string): ComposerBlockType | undefined {
  return COMPOSER_BLOCK_TYPES.find(entry => entry.type === type);
}

/**
 * Build a fresh block for the composer. Reuses the element engine's
 * `createBlock`, so the block carries the definition's real `defaultProps` and
 * is valid the instant it is added.
 */
export function createComposerBlock(type: BlockType): Block {
  return createBlock(type);
}

/** Whether a stored block is one the composer knows how to edit inline. */
export function isComposerEditable(block: Block): boolean {
  return COMPOSER_BLOCK_TYPES.some(entry => entry.type === block.type);
}
