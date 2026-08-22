# `scripts/smoke-editor-navigator.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The navigator — dev-editor-finish phase 8. Ed, pointing the editor at a real website: *"if i put in a website id get stuck"*. The browser loaded ONE address and there was nothing on screen that could reach the site's other pages. The old header carried a portal-only "Portal page" select, so a repository-backed project or a tagged website had no page list at all. What is pinned here, and why each one: 1. The DERIVATION. A repository's routes come from paths alone — App Router, Pages Router, plain HTML — with route groups dropped, private and parallel folders refused, and dynamic routes listed but NOT openable. Pure, so it can be checked without GitHub. 2. The SOURCE LINE. Every plan says who answered and how many they found, and every way of failing to answer has its own sentence. A page list with no provenance is the thing this control exists not to be. 3. The WIRING. One navigator for every target, replacing the portal-only select; picking a portal page changes the section, picking anything else repoints the browser — which is what makes the tag re-handshake. 4. The two switchers Ed asked for both still being there, sized as they were, plus the `+` on the inspector rail. The protocol half — the tag's link message and the drift guard that holds both sides together — is pinned in `smoke-aqua-tag-bridge.test.ts`, where every other message lives.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/engines/editor/editing/pageNavigator.ts`](../src/engines/editor/editing/pageNavigator.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

