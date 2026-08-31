// Lightweight id generator. Mirrors T2's pattern; avoids a runtime dep on
// `nanoid` so the plugin keeps its `dependencies` empty.
//
// `makeId`/`slugify` moved to `src/engines/editor/elements/ids.ts` in P1 — the migration
// runner needs them and no longer lives in this plugin. Re-exported here so
// every call site is unchanged; the domain-specific helpers below stay put.

// Read through the NAMESPACE, not by name — the same boundary `menuKeys.ts`
// documents. This plugin is its own ESM package (`"type": "module"`) while
// `portal/src/engines/**` is CommonJS to the smoke runner's loader, so
// `export { makeId } from "@/engines/editor/elements/ids"` links under the
// bundler and throws "does not provide an export named 'makeId'" under `tsx`
// before a single assertion runs. That is what had 26 of the 49 website-editor
// smoke files failing at import time. A namespace import never throws: node
// hands back `{ default: module.exports, … }`, so resolving through `default`
// when the named binding is absent works in both worlds — with still exactly
// one implementation, in `src/engines/editor/elements/ids.ts`.

import * as sharedIds from "@/engines/editor/elements/ids";

type Namespace = typeof sharedIds & { default?: typeof sharedIds };
const shared = sharedIds as Namespace;

export const makeId = shared.makeId ?? shared.default!.makeId;
export const slugify = shared.slugify ?? shared.default!.slugify;

export const blockId = (type: string) => makeId(`blk-${type}`, 8);
export const pageId = () => makeId("page", 10);
export const siteId = () => makeId("site", 10);
export const themeId = () => makeId("theme", 10);
export const variantId = () => makeId("variant", 10);
export const assetId = () => makeId("asset", 10);
