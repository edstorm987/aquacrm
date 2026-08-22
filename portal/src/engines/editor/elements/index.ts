// The element vocabulary — one shape, three surfaces.
//
// Website pages, client portal pages and product lifecycle stages are all
// trees of the same thing. This directory is where that thing is declared.
// Before P1 it lived inside the website-editor plugin, which meant the portal
// and the stage builder each grew their own near-copy: two block registries
// with 14 of 16 types duplicated, three `BlockStyles`→CSS mappers, two
// prop-schema vocabularies. Lifting the vocabulary out is what lets the next
// phases delete those copies instead of adding a fourth.
//
// Naming: `Element*` is the forward-looking spelling and `Block*` is the same
// type under its shipped name. They are aliases, never two shapes.
//
// ─── Layering rules, which matter more than they look ────────────────────
//
//  1. NOTHING here may `import "server-only"`. These modules are imported by
//     client components and by the smoke suite under
//     `--conditions react-server`.
//  2. NOTHING here may import a plugin. The 70 website element definitions
//     stay in `.../website-editor/src/components/blockRegistry.ts` and push
//     themselves into `./registry` on import; this side never reaches back.
//  3. `lazyBlock` deliberately did NOT move. It is a hand-rolled `React.lazy`
//     because `next/dynamic` reaches `React.createContext`, which the
//     react-server build of React does not export — a single top-level
//     `import dynamic from "next/dynamic"` would throw before a test could
//     run. It lives next to the registry that uses it and stays there.

export type {
  Block,
  BlockA11y,
  BlockSeo,
  BlockStyles,
  BlockTreeJSON,
  BlockType,
  BlockVariant,
  Element,
  ElementBinding,
  ElementContext,
  ElementProductMatch,
  ElementStyles,
  ElementTreeJSON,
  ElementType,
  ElementVisibility,
  SplitTestGroup,
  SplitTestResult,
  SplitTestStatus,
} from "./block";

export type {
  BlockComponentType,
  BlockDefinition,
  BlockRenderProps,
  ElementCategory,
  ElementComponentType,
  ElementDefinition,
  ElementPropField,
  ElementRenderProps,
  ElementSurface,
  PropField,
  PropFieldType,
} from "./definition";
export { DEFAULT_ELEMENT_SURFACES, elementSurfaces, servesSurface } from "./definition";

export type { ElementPropProblem, ElementPropSchema, ElementSchema } from "./schema";
export {
  assertDefinitionConsistent,
  buildElementSchema,
  elementSchema,
  validateElementProps,
} from "./schema";

export {
  getElementDefinition,
  getElementRenderer,
  listElementDefinitions,
  listElementRendererIds,
  listElementTypes,
  registerElementDefinitions,
  registerElementRenderers,
} from "./registry";

export { STYLE_FIELD_GROUPS, blockStylesToCss, overridesToCssText } from "./blockStyles";

// The palette — "what can I add here", answered once, for every surface.
// NOTE what is deliberately NOT re-exported: `./websiteVocabulary`. That module
// exists to be the one plugin import, and putting it in this barrel would drag
// the whole website metadata table into every consumer of `elements`.
export type { ElementPaletteItem } from "./palette";
export {
  PORTAL_CATEGORY_LABELS,
  WEBSITE_CATEGORY_LABELS,
  WEBSITE_CATEGORY_ORDER,
  elementLibrarySentence,
  elementPalette,
  elementPaletteGroups,
  elementSurfaceFor,
} from "./palette";
export { ensureWebsiteElements, websiteElementsReady } from "./websiteElements";

export type { BlockLocation } from "./blockTreeOps";
export {
  appendChild,
  cloneBlock,
  createBlock,
  duplicateBlock,
  findBlock,
  insertSibling,
  isDescendant,
  makeBlockId,
  moveBlock,
  removeBlock,
  updateBlock,
} from "./blockTreeOps";

export type { BlockMigrationStep } from "./blockSchemaMigrations";
export {
  BLOCK_SCHEMA_VERSION,
  MIGRATIONS,
  blockVersion,
  loadBlockTreeMigrated,
  migrateTree,
  treeNeedsMigration,
} from "./blockSchemaMigrations";

export { makeId, slugify } from "./ids";
