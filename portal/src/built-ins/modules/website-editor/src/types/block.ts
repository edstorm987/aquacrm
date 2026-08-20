// Block — leaf unit of an EditorPage tree.
//
// THE DECLARATION MOVED. Everything below is re-exported verbatim from
// `src/engines/editor/elements/block.ts`, which is now the single home of the element
// vocabulary shared by the website, the client portal and product lifecycle
// stages (element engine, P1). This path is kept because ~380 import sites use
// it and none of them needed to change.
//
// Add a field to an element by editing `src/engines/editor/elements/block.ts`, not here.
//
// Historical note, still true of the shape: `type` remains an open string so
// other plugins (ecommerce, blog, etc.) can extend the registry. The
// website-editor plugin contributes the canonical block types; their values
// are aliased in `BlockType` for in-tree references.

export type {
  Block,
  BlockA11y,
  BlockSeo,
  BlockStyles,
  BlockTreeJSON,
  BlockType,
  BlockVariant,
  SplitTestGroup,
  SplitTestResult,
  SplitTestStatus,
  // P2 additions — the portal side-channels. Optional everywhere, so no
  // website block reads them.
  ElementBinding,
  ElementContext,
  ElementProductMatch,
  ElementVisibility,
} from "@/engines/editor/elements/block";
