// Maps an element's typed `styles` field onto inline React style props.
//
// THE IMPLEMENTATION MOVED to `src/lib/elements/blockStyles.ts` in P1 of the
// element engine, so the portal and stage surfaces can share the one mapper
// rather than growing a third copy (there are already two more: `styleString`
// in `server/staticExport.ts` is the other live one). This path re-exports it
// verbatim — every block component still imports `../blockStyles`.

export { STYLE_FIELD_GROUPS, blockStylesToCss, overridesToCssText } from "@/lib/elements/blockStyles";
