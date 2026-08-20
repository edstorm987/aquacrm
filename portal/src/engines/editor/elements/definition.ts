// What an element *is*, as far as an editor and a renderer are concerned.
//
// Lifted in P1 from
// `src/built-ins/modules/website-editor/src/components/blockRegistry.ts`, which
// still declares the 70 website element definitions but no longer owns the
// shape of one. The plugin re-exports every name below from its old path, so
// no import site changed.
//
// Dependency rule, same as `./block`: type-only imports and React types.
// Nothing server-side, nothing that breaks under `--conditions react-server`.

import type { ComponentType, ReactNode } from "react";
import type { Block, BlockType, ElementContext } from "./block";
import type { ElementSchema } from "./schema";

/**
 * Palette grouping. This is the single declaration; the website-editor
 * plugin's `BlockCategory` is an alias of it, so adding a category here adds
 * it there.
 */
export type ElementCategory =
  | "layout"
  | "content"
  | "media"
  | "commerce"
  | "auth"
  | "advanced";

/**
 * Which surfaces an element may be placed on.
 *
 * The whole reason this exists is palette filtering (design §3.5): an operator
 * editing a client portal must not be offered `checkout-summary`, and an
 * operator editing a public marketing site must not be offered
 * `approval-panel`. One registry, filtered — never a second registry.
 */
export type ElementSurface = "website" | "portal" | "stage";

/** What every element defaults to when a definition says nothing. */
export const DEFAULT_ELEMENT_SURFACES: readonly ElementSurface[] = ["website"];

// ─── The renderer ABI ─────────────────────────────────────────────────────

export interface BlockRenderProps {
  block: Block;
  editorMode?: boolean;
  renderChildren?: (children: Block[] | undefined) => ReactNode;
  /**
   * P2 — the live data channel. Optional, so all 78 shipped components compile
   * and behave exactly as before; the ones that need records read it in P3.
   *
   * See the note on `ElementContext` for why this had to land in the same
   * phase as the shared type rather than after it.
   */
  context?: ElementContext;
}

export type BlockComponentType = ComponentType<BlockRenderProps>;
export type ElementRenderProps = BlockRenderProps;
export type ElementComponentType = BlockComponentType;

// ─── Prop schema ──────────────────────────────────────────────────────────
//
// ONE prop-schema vocabulary. `PropField` was a form-widget descriptor for the
// editor's properties panel; `FieldShape` in
// `src/lib/server/editing/appConfigAdapter.ts` was a second, unrelated one for
// the Dev Team editor. They now share this declaration — the app-config
// catalogue is `PropField`s with a narrowed `type` (see that file).
//
// The members below the divider are the validation-grade half. They are all
// optional, so every existing `fields: [...]` literal in the registry still
// type-checks unchanged, and `buildElementSchema()` reads them to produce the
// machine-checkable `ElementSchema` an assistant can plan against.

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

  // ── validation-grade, all optional ──────────────────────────────────────
  /** Refuse an empty / missing value. Absent means the field may be omitted. */
  required?: boolean;
  /** Numeric bounds. `number` fields only. */
  min?: number;
  max?: number;
  /** String length bounds. */
  minLength?: number;
  maxLength?: number;
  /** Source string for a `RegExp` the value must match. Strings only. */
  pattern?: string;
  /** Grouping label for editors that section their form. */
  group?: string;
  /**
   * Applied BEFORE validation, so what an operator confirms in a diff is the
   * value that actually gets stored rather than their raw keystrokes.
   * Must never throw — bad input is `validate`'s job.
   */
  normalise?: (value: string) => string;
  /** `null` when acceptable, otherwise the message a human reads. */
  validate?: (value: string) => string | null;
}

export type ElementPropField = PropField;

// ─── The definition ───────────────────────────────────────────────────────

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  iconNode?: ReactNode;
  category: ElementCategory;
  isContainer: boolean;
  Component: BlockComponentType;
  defaultProps: Record<string, unknown>;
  defaultChildren?: Block[];
  fields: PropField[];
  requiresPlugin?: string;
  requiresFeature?: string;
  /**
   * P2 — which surfaces may offer this element. Optional on the literal;
   * `elementSurfaces()` reads it with the `["website"]` default so the 70
   * existing website definitions did not have to be touched.
   */
  surfaces?: readonly ElementSurface[];
  /**
   * P2 — the machine-checkable contract, GENERATED from `fields` by
   * `buildElementSchema`. Never hand-written: a second declaration is exactly
   * the drift this phase exists to remove.
   *
   * Do not read this directly off a literal — call `elementSchema(def)`, which
   * derives and memoises it.
   */
  schema?: ElementSchema;
}

export type ElementDefinition = BlockDefinition;

/** Surfaces this definition is offered on, with the website-only default. */
export function elementSurfaces(def: Pick<BlockDefinition, "surfaces">): readonly ElementSurface[] {
  return def.surfaces ?? DEFAULT_ELEMENT_SURFACES;
}

export function servesSurface(def: Pick<BlockDefinition, "surfaces">, surface: ElementSurface): boolean {
  return elementSurfaces(def).includes(surface);
}
