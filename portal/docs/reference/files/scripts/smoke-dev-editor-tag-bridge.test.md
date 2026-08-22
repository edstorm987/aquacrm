# `scripts/smoke-dev-editor-tag-bridge.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The editor finally listens to the tag.  Ed, repeatedly: "the aqua tag must be connected for browser to work … i get a browser and the right menu when i click on an item aqua tag knows the exact item since its mapped everything then i get the exact text i can change it on the right menu for just the words."  Both halves of that already existed and they spoke different languages. The tag posted `aqua-explorer:selected` carrying an element; `DevEditor.tsx` listened for `aqua:portal-block-select` carrying a portal block id, and threw away anything whose origin was not its own — which is every tagged site there will ever be. Two rejections for the same message.  What is pinned here: 1. The ROUTING rule — one click, three destinations — as a pure function, including the invariant that broke it before (a mode must never be sent to a tab that same mode does not offer). 2. The COMPOSITION — a real cross-origin tag message now survives the origin policy and lands on the right tab, where the old rule dropped it. 3. The GATE — the browser is the Aqua Tag's question, not `projectKind`'s. 4. Source-level contracts on the listener itself, because it is a handler inside a 2,000-line client component and the thing worth holding is that each part of it still exists.

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/engines/editor/editing/aquaTagBridge.ts`](../src/engines/editor/editing/aquaTagBridge.md)
- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)
- [`src/engines/editor/editing/selectionRouting.ts`](../src/engines/editor/editing/selectionRouting.md)
- [`src/engines/editor/elements/ids.ts`](../src/engines/editor/elements/ids.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

