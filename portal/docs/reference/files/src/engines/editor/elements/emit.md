# `src/engines/editor/elements/emit.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** A block definition, said as source code.  ─── Phase 7: inserting an element WRITES REAL CODE ────────────────────────  Ed: "adding in a section or something will actually add the correct code it all gets put in right". On an Aqua-hosted portal, adding an element mutates the portal document — correct there, unchanged. On a repository-backed website there is no block document: the page IS the source, so adding an element means emitting the element as source and committing it (the draft branch, `repoWrite.ts`).  This module is ONLY the emission: definition in, lines of JSX or HTML out. It is deliberately not a templating system. Everything it writes is derived from what the registry already declares — `defaultProps`, the `fields` list and their `PropFieldType`s — by a handful of fixed rules:  • text-ish fields (`text`/`textarea`/`richtext`) become text elements — a heading element when the field is recognisably the block's title, a paragraph otherwise; • a `url` field pairs with its label field (`ctaHref` + `ctaLabel`, `href` + `label`) and the pair becomes one anchor; • an `image` field with a value becomes an <img>; • styling knobs (`select`, `boolean`, `number`, `color`) are settings on a block DOCUMENT, not content — they emit nothing, because inventing a styling framework for somebody else's repository would be a guess; • arrays and objects in `defaultProps` (testimonial items and the like) are skipped for the same reason — there is no honest generic markup for them, and a thin block the operator fills in beats a wrong one. (`defaultChildren` would be skipped too; no shipped definition declares one.)  The output is plain, structural markup — no imports, no identifiers, no framework assumptions — so it compiles in ANY .tsx/.jsx/.mdx file and is valid in any .html/.md file. That is the honest first slice: the block's shape and words land in the file; making it beautiful is the operator's (or the editor AI's) next edit. `data-aqua-element` names what it is, so a human reading the diff — and the Aqua Tag reading the page — can tell.  Same layering rules as the rest of `src/engines/editor/elements`: type-only imports, no server-only, no plugin import — the definition arrives as an argument. WHERE the emitted lines may land is not this module's question; that is `server/sourceInsert.ts`, which refuses rather than guesses.

## Exports (4)

- `type EmitKind`
- `emitKindForFile(path: string): EmitKind | null`
- `emitElementSource(def: Pick<BlockDefinition, "type" | "label" | "isContainer" | "defaultProps" | "fields">, kind: EmitKind): string[]`
- `emitElementCode(def: Pick<BlockDefinition, "type" | "label" | "isContainer" | "defaultProps" | "fields">, kind: EmitKind): string`

## Depends on (1)

- [`src/engines/editor/elements/definition.ts`](./definition.md)

## Used by (2)

- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`src/components/editing/ElementInsertPanel.tsx`](../../../components/editing/ElementInsertPanel.md)

