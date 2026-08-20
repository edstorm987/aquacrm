# `src/lib/server/env.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Typed env reader (T1 R029 — chapter `04-env-secrets-policy.md`).  Two helpers + an allowlist + a startup self-check:  - `requireEnv(name, opts?)` — throws in production when missing. In dev/test, returns `undefined`. Use for hard requirements. - `optionalEnv(name, fallback)` — always returns a string. Falls back to `fallback` when unset. Use for tunables. - `ENV_ALLOWLIST` — typo guard. The startup self-check warns when `process.env` carries a `*PORTAL_*`/`*FOUNDER_*` key not on the list (likely typo). - `runStartupEnvCheck()` — fail-closed boot: validates required vars are set + meet minimum lengths + don't match dev sentinels. Throws in production; warns + returns issues in dev.  No `server-only` shim so the smoke can drive every branch under tsx --test.

## Exports (6)

- `interface EnvIssue (3 members)`
- `ENV_ALLOWLIST: readonly string[]`
- `requireEnv(name: string, opts: RequireOpts = {}): string | undefined`
- `optionalEnv<T extends string>(name: string, fallback: T): string`
- `inspectEnv(env: NodeJS.ProcessEnv = process.env): EnvIssue[]`
- `runStartupEnvCheck(env: NodeJS.ProcessEnv = process.env): EnvIssue[]`

## Used by (3)

- [`scripts/smoke-env-secrets.test.ts`](../../../scripts/smoke-env-secrets.test.md)
- [`scripts/smoke-google-oauth.test.ts`](../../../scripts/smoke-google-oauth.test.md)
- [`src/lib/server/secrets.ts`](./secrets.md)

