# `src/lib/elements/portalElements.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** The client portal's 16 block types, expressed in the shared vocabulary.  ELEMENT ENGINE P3. Before this file there were two block registries: `BLOCK_REGISTRY` in the website-editor plugin (70 entries) and `CLIENT_PORTAL_BLOCK_REGISTRY` in `src/lib/portal/clientPortalBuilder.ts` (16). Of those 16, FOURTEEN were the same element under a different name — a hero is a hero, a portal `callout` is a website `banner`, a portal `rich-text` is a website `text`. The only things the portal had that the website did not were `approval-panel` and `file-upload`.  What actually distinguishes a portal block from a website block is DATA BINDING, not shape. So the merge is not "copy 14 definitions across". It is:  • 14 portal names become ALIASES of an element that already exists. The shared definition gains `"portal"` in its `surfaces`; no second entry is created, so there is exactly one `hero` in the registry and one `banner`. • 2 genuinely new concepts get real definitions with `surfaces: ["portal"]`. • The per-type authoring defaults — which used to be an if-ladder in `createPortalBlock` plus two more ladders in `blockTitle`/`blockBody` — become one declaration per type, right here, next to the alias.  ── What this file is NOT ─────────────────────────────────────────────────  It is not a renderer. Live client portals render through `src/app/portal/customer/_PortalPageComposition.tsx` and the interaction components beside it, and P3 deliberately did not touch them: a merge that changes one character of what a signed-in client sees is a failure even with a green suite. `scripts/smoke-portal-element-parity.test.ts` renders every portal block type to real HTML and requires it byte-identical to the pre-merge capture. That harness is the reason this file could be written at all, and it is what must stay green.  The two portal-only definitions therefore register a NULL renderer, on purpose — see the note on `portalHostElement` below. Writing a second implementation of the approval panel here so the registry "looks complete" would recreate the exact duplication this phase exists to delete.  ── Layering ──────────────────────────────────────────────────────────────  Same rules as the rest of `src/lib/elements`: no `server-only`, no plugin import, nothing that breaks under `--conditions react-server`. In particular this module must NOT import the website-editor plugin to reach the 70 definitions it aliases — the alias is resolved through the shared registry at call time, and `portalVocabularyProblems()` is how a missing one is caught loudly instead of silently.

## Exports (12)

- `type PortalElementCategory`
- `interface PortalElementDefaults (13 members)`
- `interface PortalElementPairing (7 members)`
- `PORTAL_ELEMENT_PAIRINGS`
- `PORTAL_ELEMENT_BY_TYPE: Record<ClientPortalBlockType, PortalElementPairing>`
- `portalElementPairing(type: ClientPortalBlockType): PortalElementPairing`
- `portalElementDefinition(type: ClientPortalBlockType): BlockDefinition | undefined`
- `interface PortalVocabularyProblem (2 members)`
- `portalVocabularyProblems(): PortalVocabularyProblem[]`
- `toElement(block: ClientPortalPageBlock): Block`
- `fromElement(element: Block): ClientPortalPageBlock`
- `createPortalBlockRecord(type: ClientPortalBlockType, id: string, makeItemId: () => string = () => "item"): ClientPortalPageBlock`

## Depends on (4)

- [`src/lib/elements/block.ts`](./block.md)
- [`src/lib/elements/definition.ts`](./definition.md)
- [`src/lib/elements/registry.ts`](./registry.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (2)

- [`scripts/smoke-portal-elements.test.ts`](../../../scripts/smoke-portal-elements.test.md)
- [`src/lib/portal/clientPortalBuilder.ts`](../portal/clientPortalBuilder.md)

