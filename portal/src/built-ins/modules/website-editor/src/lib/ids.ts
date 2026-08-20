// Lightweight id generator. Mirrors T2's pattern; avoids a runtime dep on
// `nanoid` so the plugin keeps its `dependencies` empty.
//
// `makeId`/`slugify` moved to `src/lib/elements/ids.ts` in P1 — the migration
// runner needs them and no longer lives in this plugin. Re-exported here so
// every call site is unchanged; the domain-specific helpers below stay put.

export { makeId, slugify } from "@/lib/elements/ids";

import { makeId } from "@/lib/elements/ids";

export const blockId = (type: string) => makeId(`blk-${type}`, 8);
export const pageId = () => makeId("page", 10);
export const siteId = () => makeId("site", 10);
export const themeId = () => makeId("theme", 10);
export const variantId = () => makeId("variant", 10);
export const assetId = () => makeId("asset", 10);
