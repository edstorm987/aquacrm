// The element lookup — one registry, filtered by surface.
//
// P1 lifted the *vocabulary* out of the website-editor plugin. The 70 website
// element definitions themselves stay where they are, in
// `.../website-editor/src/components/blockRegistry.ts`, because that is where
// the 78 lazy component loaders live and where `lazyBlock` has to keep being a
// hand-rolled `React.lazy` (see the header of `components/lazyBlock.tsx` —
// `next/dynamic` throws under `--conditions react-server`).
//
// What moved here is the *lookup*. The renderer and the tree operations are
// now shared code in `src/lib/elements`, so they cannot import a plugin. They
// ask this module instead, and the plugin fills it on import:
//
//     blockRegistry.ts  ──registerElementDefinitions()──▶  this module
//                                                              ▲
//     BlockRenderer / blockTreeOps ──getElementRenderer()───────┘
//
// Every existing import site still reaches the plugin path first (its modules
// are thin re-export shims that import `blockRegistry` for exactly this
// side-effect), so the population guarantee is identical to the direct import
// it replaced.
//
// Registration is idempotent and last-write-wins per type, which reproduces the
// object-spread semantics of the `RENDERER_REGISTRATIONS` literal it replaced:
// natives register first, external-plugin renderers register after and win.

import type { BlockComponentType, BlockDefinition, ElementSurface } from "./definition";
import { servesSurface } from "./definition";
import { buildElementSchema } from "./schema";

const DEFINITIONS = new Map<string, BlockDefinition>();
const RENDERERS = new Map<string, BlockComponentType>();

export function registerElementDefinitions(defs: Record<string, BlockDefinition>): void {
  for (const [type, def] of Object.entries(defs)) {
    // Generate the schema here rather than asking every library to declare one.
    // `??=` so a definition that arrived with a schema keeps it, and so
    // re-registering the same object does not rebuild it.
    def.schema ??= buildElementSchema(def);
    DEFINITIONS.set(type, def);
    RENDERERS.set(type, def.Component);
  }
}

export function registerElementRenderers(renderers: Record<string, BlockComponentType>): void {
  for (const [type, Component] of Object.entries(renderers)) {
    RENDERERS.set(type, Component);
  }
}

export function getElementDefinition(type: string): BlockDefinition | undefined {
  return DEFINITIONS.get(type);
}

export function getElementRenderer(type: string): BlockComponentType | undefined {
  return RENDERERS.get(type);
}

/**
 * Every registered definition, in registration order.
 *
 * Pass a `surface` to get the palette for one editor. That filter is the whole
 * reason `surfaces` exists (design §3.5): an operator editing a client portal
 * must not be offered `checkout-summary`, and an operator editing a public site
 * must not be offered `approval-panel`. Called with no argument it returns
 * everything, which is what the website palette did before surfaces existed.
 */
export function listElementDefinitions(surface?: ElementSurface): BlockDefinition[] {
  const all = [...DEFINITIONS.values()];
  return surface ? all.filter(def => servesSurface(def, surface)) : all;
}

export function listElementTypes(surface?: ElementSurface): string[] {
  return listElementDefinitions(surface).map(def => def.type);
}

/** Registered renderer ids, including external-plugin ones with no definition. */
export function listElementRendererIds(): string[] {
  return [...RENDERERS.keys()];
}
