# `src/built-ins/modules/website-editor/src/lib/pagePrivacy.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R026 — Per-page privacy + storefront access check.  Pure module — uses Node `crypto.subtle` (Web Crypto) for password hashing so it runs in both Node 20+ and edge runtimes without extra dependencies. Hash format: `sha256:<hex>` (R+1 candidate: upgrade to scrypt/argon2 with a real salt; v1 is sha256 with the page id baked in as the salt — adequate for site-gate semantics where the threat model is casual lookup, not credential theft).

## Exports (9)

- `async hashPagePassword(pageId: string, password: string): Promise<string>`
- `async verifyPagePassword(pageId: string, password: string, storedHash: string): Promise<boolean>`
- `interface PageAccessInput (2 members)`
- `interface PageAccessContext (2 members)`
- `interface PageAccessResult (3 members)`
- `async makeUnlockToken(pageId: string, passwordHash: string): Promise<string>`
- `async verifyUnlockToken(pageId: string, passwordHash: string, token: string): Promise<boolean>`
- `async evaluatePageAccess(page: PageAccessInput & { id?: string }, ctx: PageAccessContext = {}): Promise<PageAccessResult>`
- `pagesVisibleInSitemap<T extends PageAccessInput>(pages: T[]): T[]`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r026-page-privacy.test.ts`](../__smoke__/r026-page-privacy.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pagePrivacy.ts`](../api/handlers/pagePrivacy.md)

