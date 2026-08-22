# `src/engines/editor/editing/selectionRouting.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** ONE selection mechanism, THREE destinations. Ed, many times over: "the way it works is just the words i get a browser and the right menu when i click on an item aqua tag knows the exact item since its mapped everything then i get the exact text i can change it on the right menu for just the words. for the ai i just need broswer aqua tagged so the element section works and then you just differ it to the ai simples browser + ai combo now for dev its all of them + the vs way" The click is the same click at every depth. The Aqua Tag has mapped the page, so one click resolves to one exact element and reports it. What the MODE decides is only where that element is SENT — and the depths are cumulative, not three separate editors. ── "Just the words" is a rung no more — merged into Visual, 2026-08-22 ───── The quote above names a text-only depth whose whole offer was the exact words, editable. Ed's later call: "id want to actually just combine it into visual mode as its the same you select element change type it add it in" — and he is right: it was the same selection landing on the same element panel, minus the styling. So nothing behavioural was lost. Off a portal the visual depth routes to the element panel with the words editable, styling beside them. What was deleted is the rung, not the words. This lives in its own module, with no React and no DOM, because the routing rule is the part most worth pinning: it is the answer to "why did clicking the page do nothing / take me to the wrong panel", which is the bug this whole piece of work exists to fix. A rule buried inside a 2,000-line component cannot be tested; this one can be, and is.

## Exports (4)

- `type SelectionDestination`
- `interface SelectionRoute (5 members)`
- `routeTagSelection(mode: EditingMode, options: { portalTarget: boolean }): SelectionRoute`
- `modeSelectsThroughTag(mode: EditingMode): boolean`

## Depends on (1)

- [`src/engines/editor/editing/modes.ts`](./modes.md)

## Used by (2)

- [`scripts/smoke-dev-editor-tag-bridge.test.ts`](../../../../scripts/smoke-dev-editor-tag-bridge.test.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)

