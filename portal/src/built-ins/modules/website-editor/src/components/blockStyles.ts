// Maps an element's typed `styles` field onto inline React style props.
//
// THE IMPLEMENTATION MOVED to `src/engines/editor/elements/blockStyles.ts` in P1 of the
// element engine, so the portal and stage surfaces can share the one mapper
// rather than growing a third copy (there are already two more: `styleString`
// in `server/staticExport.ts` is the other live one). This path re-exports it
// verbatim — every block component still imports `../blockStyles`.

// Through the NAMESPACE, not by name — see `lib/menuKeys.ts` for the full
// reasoning. This plugin is ESM ("type": "module") and `portal/src/engines/**`
// is CommonJS to the smoke runner's loader, so a named re-export throws "does
// not provide an export named 'STYLE_FIELD_GROUPS'" at instantiation and takes
// every smoke that touches a block component with it.
import * as sharedBlockStyles from "@/engines/editor/elements/blockStyles";

type Namespace = typeof sharedBlockStyles & { default?: typeof sharedBlockStyles };
const ns = sharedBlockStyles as Namespace;
export const STYLE_FIELD_GROUPS = ns.STYLE_FIELD_GROUPS ?? ns.default!.STYLE_FIELD_GROUPS;
export const blockStylesToCss = ns.blockStylesToCss ?? ns.default!.blockStylesToCss;
export const overridesToCssText = ns.overridesToCssText ?? ns.default!.overridesToCssText;
