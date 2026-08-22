# `scripts/smoke-editor-surface-modes.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** ─── PHASE 9 — SURFACE MODES: WEBSITE vs NORMAL, AND PER-PAGE SEO ────────────  Ed: "website mode im going to need a specialied thing to do the seo and tags and everything like that per page... dont need a portal mode and then normal mode can do portal and software or whatever as its just universal"  TWO surfaces. No portal mode. The surface answers WHAT you are working on; the mode (phase 5) answers HOW DEEP you go. They are orthogonal and they multiply, and this file pins that they stay that way — because the disease this editor keeps catching is two different questions collapsed into one flag (`portalTarget = projectKind !== "software"` gated the browser off every project Ed makes).  What is pinned here:  SURFACE     — the two, the tolerant resolver with its BY-NAME migrations, and the default DERIVED FROM WHAT IS CONNECTED (an Aqua Tag answering on a real address). Never from `projectKind`: a declared kind is a claim, a connected tag is evidence. ORTHOGONAL  — "seo" is on NO mode's ladder. It is offered at every depth and only on the Website surface, and changing depth never throws you off it. THE SEO     — the fields, what is wrong with them, and the ONE rule the source writer lives by: own a marked block, refuse everything else. A page that writes its own head is refused BY NAME rather than rewritten. ROUND TRIP  — read(emit(x)) === x, both mechanisms, and every byte outside the markers unchanged. Without this the panel would show something other than what the page says and invite a "fix". THE WRITE   — preview → confirm → the SAME `saveRepoFile` on the SAME draft branch as every other write. No SEO store, no second commit path. Driven against the stateful fake GitHub, so a commit that lost an edit would fail here.  The stateful fake GitHub below is the smoke-element-insert one (lineage: smoke-repo-write → smoke-editor-words-publish), unchanged in behaviour. Same rule as its ancestors: commits go through the REAL `publishEdits` with only the socket replaced.

_No exported symbols (side-effect / internal module)._

## Depends on (18)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../src/app/api/portal/dev/repo-write/route.md)
- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)
- [`src/engines/editor/editing/pageNavigator.ts`](../src/engines/editor/editing/pageNavigator.md)
- [`src/engines/editor/editing/pageSeo.ts`](../src/engines/editor/editing/pageSeo.md)
- [`src/engines/editor/editing/surfaces.ts`](../src/engines/editor/editing/surfaces.md)
- [`src/engines/editor/server/codeAdapter.ts`](../src/engines/editor/server/codeAdapter.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/githubSource.ts`](../src/engines/editor/server/githubSource.md)
- [`src/engines/editor/server/publish.ts`](../src/engines/editor/server/publish.md)
- [`src/engines/editor/server/repoWrite.ts`](../src/engines/editor/server/repoWrite.md)
- [`src/engines/editor/server/sourceEdit.ts`](../src/engines/editor/server/sourceEdit.md)
- [`src/lib/portal/clientPortalDesign.ts`](../src/lib/portal/clientPortalDesign.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

