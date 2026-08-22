# `src/engines/editor/editing/pageNavigator.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** The navigator — how you reach a project's OTHER pages. Ed, on pointing the editor at a real website: *"if i put in a website id get stuck"*. The browser loaded exactly one address and there was nothing on screen that could take you anywhere else. A URL bar is not an answer: it asks the operator to already know the site's routes, which is the thing the editor is supposed to know for them. So this is a LIST YOU PICK FROM, and the one rule it lives by is that it must say WHO ANSWERED. There are three possible answerers and they know genuinely different things: • **This portal's own pages** — an Aqua-hosted portal document. Exact and complete: the document IS the list. Picking one changes the section the preview renders, not a URL. • **The repository's routes** — derived from the file tree the editor already reads (`app/…/page.tsx`, `pages/…`, plain `.html`). Exact about what EXISTS in the source, and silent about anything generated at runtime. A dynamic route (`[slug]`) is listed and NOT openable, because opening it without a real value is a 404 with the editor's name on it. • **The links the Aqua Tag can see** — what is actually reachable from the page in front of you, same-origin only. Exact about this one page and blind to everything nothing links to. Two of those can answer at once (a repo-backed project with a tag on its site), and when they do, the operator is told both — grouped, and counted. Never merged into one anonymous list: "12 pages" that is half source-derived and half link-scraped is a claim the editor cannot stand behind. Client-safe: no server imports, no Node built-ins, no `next/*`. The route derivation is pure so the same function answers in the browser and in a test, and so a repository's routes can be checked without GitHub.

## Exports (14)

- `type NavigatorSourceId`
- `interface NavigatorDestination (7 members)`
- `interface NavigatorGroup (3 members)`
- `interface NavigatorPlan (4 members)`
- `NAVIGATOR_ROUTE_LIMIT`
- `repositoryRoutes(paths: readonly string[]): NavigatorDestination[]`
- `interface PageLinkAnswer (2 members)`
- `pageLinkDestinations(links: readonly AquaTagPageLink[], allowedOrigin: string | null | undefined): PageLinkAnswer`
- `interface NavigatorPortalPages (2 members)`
- `portalPageDestinations(pages: NavigatorPortalPages): NavigatorDestination[]`
- `interface NavigatorInput (7 members)`
- `navigatorPlan(input: NavigatorInput): NavigatorPlan`
- `navigatorHref(currentUrl: string, destination: NavigatorDestination): string | null`
- `navigatorCurrentId(plan: NavigatorPlan, currentUrl: string): string`

## Depends on (1)

- [`src/engines/editor/editing/aquaTagBridge.ts`](./aquaTagBridge.md)

## Used by (4)

- [`scripts/smoke-editor-navigator.test.ts`](../../../../scripts/smoke-editor-navigator.test.md)
- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`src/components/editing/PageNavigator.tsx`](../../../components/editing/PageNavigator.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)

