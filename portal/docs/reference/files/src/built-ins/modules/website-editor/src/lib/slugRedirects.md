# `src/built-ins/modules/website-editor/src/lib/slugRedirects.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R041 — Slug redirect helper.  When an operator renames a page slug, the editor should add the old slug to the new page's `redirectSourceSlugs[]` so the runtime 301s the legacy URL to the new one (instead of 404'ing). This module is the pure map-builder + resolver. The host wires `resolveRedirect` into its catch-all route handler.  NOT a general-purpose redirects module — that's R025 territory (cross-domain / regex / external rules). Slug redirects are strictly intra-site, slug-shaped, page-scoped.

## Exports (10)

- `interface SlugRedirectPage (3 members)`
- `interface BuildOpts (1 members)`
- `normalizeSlug(s: string): string`
- `interface RedirectMap (2 members)`
- `type RedirectIssueCode`
- `interface RedirectIssue (4 members)`
- `buildRedirectMap<T extends SlugRedirectPage>(pages: readonly T[], opts: BuildOpts = {}): RedirectMap`
- `interface ResolveResult (2 members)`
- `resolveRedirect(slug: string, map: RedirectMap | Record<string, string>): ResolveResult | null`
- `withSlugRename(page: SlugRedirectPage, newSlug: string): { slug: string; redirectSourceSlugs: string[] }`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r041-published-redirect.test.ts`](../__smoke__/r041-published-redirect.test.md)

