// The shared element registry, reachable from inside this plugin.
//
// Same one-file indirection as `menuKeys.ts` and `countdownDeadline.ts`, for
// the same loader reason: this plugin is its own ESM package
// (`"type": "module"`) while `portal/src/engines/**` is CommonJS to the smoke
// runner's loader, so
//
//   import { getElementDefinition } from "@/engines/editor/elements/registry"
//
// links under the bundler and throws "does not provide an export named
// 'getElementDefinition'" under `tsx` — the exact symptom
// `docs/workspace/hazards-and-duplication.md` records for the OTHER direction
// (portal reaching into the plugin, solved by `websiteVocabulary.ts`). It kept
// `blockRegistry.ts` — and therefore every smoke that touches a page template —
// unimportable.
//
// Reading through the namespace works in both worlds. There is still exactly
// one registry, in `src/engines/editor/elements/registry.ts`; this file adds no
// state of its own, so a definition registered through it is visible to every
// other caller.

import * as sharedRegistry from "@/engines/editor/elements/registry";

type Namespace = typeof sharedRegistry & { default?: typeof sharedRegistry };
const shared = sharedRegistry as Namespace;
export const getElementDefinition = shared.getElementDefinition ?? shared.default!.getElementDefinition;
export const getElementRenderer = shared.getElementRenderer ?? shared.default!.getElementRenderer;
export const listElementDefinitions = shared.listElementDefinitions ?? shared.default!.listElementDefinitions;
export const registerElementDefinitions = shared.registerElementDefinitions ?? shared.default!.registerElementDefinitions;
export const registerElementRenderers = shared.registerElementRenderers ?? shared.default!.registerElementRenderers;
