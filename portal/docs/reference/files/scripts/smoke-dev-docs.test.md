# `scripts/smoke-dev-docs.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Docs smoke — the owner + Dev-Mode-only in-app docs browser (Phase 1).  Behavioural, and hermetic by construction: the sidebar item is gated on an INJECTED `devModeAvailable` flag (buildSidebar never reads env), so the visibility contract needs no env mutation at all. Only the positive gate path (`canUseDevMode()` true) briefly satisfies the Dev Mode env guards via the same restore-in-finally shape as smoke-dev-mode.test.ts.  Proves: 1. the "Dev Docs" nav item appears ONLY for a founder in Dev Mode, and is absent for a normal owner, a non-founder, in production-like env, and in client scope — the #1 safety contract; 2. `devDocsAccessible()` combines Dev Mode AND founder (both required); 3. the doc index reads live off disk: every dev *.md, newest-edited first, categorised, with a known plan present; 4. `relativeAge` formats the last-edited stamp.

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`src/lib/chrome/sidebarLayout.ts`](../src/lib/chrome/sidebarLayout.md)
- [`src/lib/server/dev/devDocs.ts`](../src/lib/server/dev/devDocs.md)
- [`src/lib/shared/formatDateTime.ts`](../src/lib/shared/formatDateTime.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

