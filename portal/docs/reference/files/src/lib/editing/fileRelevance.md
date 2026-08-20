# `src/lib/editing/fileRelevance.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Which files matter for the thing being edited right now. A repository browser that always shows all 1,700 files is only useful to somebody who already knows the codebase. Editing a client portal and being shown the marketing site, the API routes and the test suite is not "more power", it is the answer buried in noise. So the tree is filtered to what renders the thing on screen, with a toggle back to everything — because the filter will sometimes be wrong, and an editor that cannot be argued with is worse than one that guesses.

## Exports (6)

- `interface RelevanceScope (2 members)`
- `PORTAL_SCOPE: RelevanceScope`
- `WEBSITE_SCOPE: RelevanceScope`
- `scopeForSection(base: RelevanceScope, section?: string): RelevanceScope`
- `isRelevant(path: string, scope: RelevanceScope): boolean`
- `relevantFiles<T extends { path: string }>(files: T[], scope: RelevanceScope, alwaysKeep: string[] = []): T[]`

## Used by (3)

- [`scripts/smoke-file-relevance.test.ts`](../../../scripts/smoke-file-relevance.test.md)
- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../../app/portal/agency/portals/editor/_ClientPortalStudio.md)
- [`src/components/editing/RepositoryPanel.tsx`](../../components/editing/RepositoryPanel.md)

