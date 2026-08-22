# `scripts/dev-console-request-scope.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** A real Next request scope, for tests.  The Dev Console's gates are `requireRole([...AGENCY_ROLES])` followed by `devDocsAccessible(session)`, and `requireRole` reaches for `cookies()` from `next/headers`. Outside a request scope that throws, so every gated route handler and every `_Section` body in `src/app/portal/dev-team/` was untestable in-process — which is precisely why the audit found seven section bodies and a founder-gated write route with no behavioural coverage of the gate at all.  Rather than weaken a route to `getSessionFromRequest` (which would drop the Supabase identity cross-check `getSession` performs — a gate, not a formality), this enters Next's OWN async-local stores with a request-shaped store. `cookies()` and `headers()` then resolve exactly as they do in a live request, and the gate under test is the real one.  Scope: test support only. Nothing in src/ imports this.

## Exports (6)

- `async withRequestScope<T>(cookies: Record<string, string>, fn: () => Promise<T>, options: { route?: string; host?: string } = {}): Promise<T>`
- `async withSession<T>(token: string, fn: () => Promise<T>, options?: { route?: string; host?: string }): Promise<T>`
- `async withDevMode<T>(fn: () => Promise<T>): Promise<T>`
- `restoreEnv(key: string, value: string | undefined)`
- `isNextNotFound(error: unknown): boolean`
- `isNextRedirect(error: unknown): boolean`

## Used by (15)

- [`scripts/smoke-aqua-editor-ai-history.test.ts`](./smoke-aqua-editor-ai-history.test.md)
- [`scripts/smoke-aqua-editor-ai-reply.test.ts`](./smoke-aqua-editor-ai-reply.test.md)
- [`scripts/smoke-aqua-editor-ai-token.test.ts`](./smoke-aqua-editor-ai-token.test.md)
- [`scripts/smoke-dev-console-edges.test.ts`](./smoke-dev-console-edges.test.md)
- [`scripts/smoke-dev-editor-aqua-tag.test.ts`](./smoke-dev-editor-aqua-tag.test.md)
- [`scripts/smoke-dev-project-map.test.ts`](./smoke-dev-project-map.test.md)
- [`scripts/smoke-dev-project-nesting.test.ts`](./smoke-dev-project-nesting.test.md)
- [`scripts/smoke-dev-team-api-view.test.ts`](./smoke-dev-team-api-view.test.md)
- [`scripts/smoke-dev-team-editor.test.ts`](./smoke-dev-team-editor.test.md)
- [`scripts/smoke-dev-team-gates.test.ts`](./smoke-dev-team-gates.test.md)
- [`scripts/smoke-editor-words-publish.test.ts`](./smoke-editor-words-publish.test.md)
- [`scripts/smoke-element-insert.test.ts`](./smoke-element-insert.test.md)
- [`scripts/smoke-librarian.test.ts`](./smoke-librarian.test.md)
- [`scripts/smoke-repo-write.test.ts`](./smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](./smoke-work-lifecycle.test.md)

