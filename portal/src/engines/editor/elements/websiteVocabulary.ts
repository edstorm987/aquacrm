// The split point for the website element library. Nothing else.
//
// ─── Why this file exists at all ──────────────────────────────────────────
//
// Registration into the shared registry is an import SIDE EFFECT:
// `.../website-editor/src/components/blockRegistry.ts` calls
// `registerElementDefinitions(BLOCK_REGISTRY)` at module scope. So the website
// vocabulary exists in a bundle if and only if something in that bundle
// imported it. The Dev Editor imported `CLIENT_PORTAL_BLOCK_REGISTRY` and
// nothing else, which is why `listElementDefinitions("website")` was empty
// there and the block palette looked "lost".
//
// The fix is one import. It lives in its own module rather than at the top of
// `DevEditor.tsx` so the import can be a DYNAMIC one — see
// `./websiteElements.ts` — which puts the vocabulary in its own webpack chunk
// instead of the editor's first paint.
//
// ─── What it costs ────────────────────────────────────────────────────────
//
// Only the metadata. The 78 block COMPONENTS are already behind
// `lazyBlock(() => import("./blocks/X"))` (see `lazyBlock.tsx`), so each of
// them is its own chunk fetched the first time that block actually renders.
// What this module pulls is the definition table — type, label, icon,
// category, defaultProps, fields — plus `lazyBlock` itself. That is exactly
// what a palette needs and no more.
//
// ─── Why the indirection is load-bearing, not stylistic ───────────────────
//
// `src/built-ins/modules/website-editor/package.json` declares
// `"type": "module"`, while `portal/package.json` does not. Under `tsx` that
// makes the plugin's files ESM and the portal's files CommonJS, and a direct
// `await import("@/built-ins/.../blockRegistry")` therefore crosses from
// node's ESM loader into a CJS instance of `elements/registry` — which fails
// at instantiation with "does not provide an export named
// 'getElementDefinition'" before a single test can run. Importing THIS file
// instead keeps the dynamic hop inside portal (CJS) space, so the whole chain
// resolves through the one loader and the same code path is reachable from the
// smoke suite and from the browser. Do not "simplify" this away.

import "@/built-ins/modules/website-editor/src/components/blockRegistry";

/**
 * Proof the side effect ran, for a caller that wants to await something
 * meaningful rather than trust an empty module namespace.
 */
export const WEBSITE_VOCABULARY_LOADED = true;
