# `src/engines/editor/editing/pageSeo.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Per-page SEO — the specialist work the Website surface adds. Ed: *"website mode im going to need a specialied thing to do the seo and tags and everything like that per page"*. PER PAGE is the load-bearing part: a site-wide title is not SEO, it is a brand. Which page this is talking about comes from the navigator (phase 8), and the navigator now carries the FILE each repository route was derived from so this module has something to write into. ─── WHERE THE VALUES LIVE, and the rule that decides ─────────────────────── A repository-backed page keeps them IN SOURCE — the page's own head — and they reach the repository down the SAME path as every other write the editor makes: preview → confirm → a commit on `aqua-editor/<projectId>` → the pull request. There is no second write mechanism and no SEO store. If the editor kept a page's title in a database beside a repository that also declares one, the two would disagree within a week and the deployed site would win. A portal page keeps them in the portal document, which is that target's equivalent of source, and rides its existing draft → publish path. ─── WHAT THIS MODULE IS AND IS NOT ───────────────────────────────────────── Pure. It decides WHAT the head should say and WHERE in a file it goes; it never reads a network, a token or a repository. `planPageSeoEdit` is to SEO what `server/sourceInsert.ts`'s `planSourceInsert` is to elements — the safety check, testable exhaustively without GitHub. It is a separate planner because it is a genuinely different edit (a head, not a JSX sibling), not a second write mechanism: both hand their new contents to the same `saveRepoFile`. ─── THE RULE IT LIVES BY: OWN A BLOCK, REFUSE EVERYTHING ELSE ────────────── The editor writes into a MARKED region and touches nothing outside it. A page that already declares its own metadata in code is refused, by name, with the reason — because rewriting somebody's hand-written `<head>` or `export const metadata` is how an editor earns the reputation of eating your work. Refuse rather than guess is the same rule `sourceMatch.ts` and `sourceInsert.ts` already hold. Client-safe: no server imports, no Node built-ins, no `next/*`. The escape authority for a `<script type="application/ld+json">` body — `</script`, `<!--`, `-->`, U+2028/U+2029. REUSED rather than reimplemented: this is exactly the escaping the website-editor module's storefront already does, and two copies of an escape list is how one of them ends up missing a case. (Its sibling `validateJsonLd` is deliberately NOT reused — it only accepts the five @types that module's own builders emit and would reject a perfectly valid `LocalBusiness` an operator pasted. Validating somebody else's JSON-LD against our generator's whitelist would be a refusal we cannot justify.)

## Exports (38)

- `type TwitterCard`
- `interface PageSeo (10 members)`
- `EMPTY_PAGE_SEO: PageSeo`
- `type PageSeoField`
- `PAGE_SEO_FIELDS: PageSeoField[]`
- `normalisePageSeo(value: unknown): PageSeo`
- `pageSeoIsEmpty(seo: PageSeo): boolean`
- `storedPageSeo(value: unknown): PageSeo | undefined`
- `pageSeoEquals(left: PageSeo, right: PageSeo): boolean`
- `pageSeoFieldInert(seo: PageSeo, field: PageSeoField): string | null`
- `effectivePageSeo(seo: PageSeo): PageSeo`
- `pageSeoWriteEquals(left: PageSeo, right: PageSeo): boolean`
- `interface PageSeoProblem (3 members)`
- `SEO_TITLE_ADVISORY_LIMIT`
- `SEO_DESCRIPTION_ADVISORY_LIMIT`
- `pageSeoProblems(seo: PageSeo): PageSeoProblem[]`
- `pageSeoBlocked(seo: PageSeo): PageSeoProblem[]`
- `type StructuredDataParse`
- `parseStructuredData(raw: string): StructuredDataParse`
- `structuredDataScriptBody(value: unknown): string`
- `type SeoMechanism`
- `interface SeoMechanismAnswer (2 members)`
- `seoMechanismFor(path: string): SeoMechanismAnswer`
- `governingLayout(pageFile: string, files: readonly string[]): string | null`
- `mechanismRefusesField(mechanism: SeoMechanism, field: PageSeoField): string | null`
- `mechanismFields(mechanism: SeoMechanism): PageSeoField[]`
- `HTML_SEO_OPEN`
- `HTML_SEO_CLOSE`
- `TS_SEO_OPEN`
- `TS_SEO_CLOSE`
- `emitHtmlSeoBlock(seo: PageSeo, indent = " "): string[]`
- `nextMetadataObject(seo: PageSeo): Record<string, unknown>`
- `emitNextMetadataBlock(seo: PageSeo): string[]`
- `interface PageSeoRead (3 members)`
- `readPageSeo(input: { contents: string; file: string }): PageSeoRead`
- `type PageSeoRefusalReason`
- `type PageSeoPlan`
- `planPageSeoEdit(input: { contents: string; file: string; seo: PageSeo }): PageSeoPlan`

## Used by (8)

- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../../../app/api/portal/dev/repo-write/route.md)
- [`src/components/editing/PageSeoPanel.tsx`](../../../components/editing/PageSeoPanel.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/server/repoWrite.ts`](../server/repoWrite.md)
- [`src/lib/portal/clientPortalBuilder.ts`](../../../lib/portal/clientPortalBuilder.md)
- [`src/lib/portal/clientPortalDesign.ts`](../../../lib/portal/clientPortalDesign.md)
- [`src/server/types.ts`](../../../server/types.md)

