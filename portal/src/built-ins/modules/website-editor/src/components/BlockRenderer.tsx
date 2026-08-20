"use client";

// The directive stays on this re-export shim, not only on the
// implementation: this path carried it before the move (the renderer is a client component),
// and dropping it would move what this module pulls in from the client
// graph to whichever graph the importer happens to be in.

// Recursive element renderer, used by both the editor canvas and the host-side
// PortalPageRenderer.
//
// THE IMPLEMENTATION MOVED to `src/engines/editor/elements/BlockRenderer.tsx` in P1 of the
// element engine. This path re-exports it verbatim so every import site — the
// canvas, the storefront renderer, the preview panes — is unchanged.
//
// The bare `import "./blockRegistry"` is load-bearing, not tidy-up: the lifted
// renderer resolves components through the shared `src/engines/editor/elements/registry`
// lookup, and this plugin's registry is what fills it. Importing it here
// reproduces exactly the population guarantee the old direct
// `import { getBlockDefinition } from "./blockRegistry"` gave.
import "./blockRegistry";

export { BlockRenderer, BlockTreeRenderer, default } from "@/engines/editor/elements/BlockRenderer";
export type { BlockRendererProps } from "@/engines/editor/elements/BlockRenderer";
