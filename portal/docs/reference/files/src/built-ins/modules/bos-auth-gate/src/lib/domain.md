# `src/built-ins/modules/bos-auth-gate/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** BOS auth-gate domain.

## Exports (12)

- `BOS_PATH_PREFIXES: readonly string[]`
- `BOS_SOFT_ALLOW_SUFFIXES: readonly string[]`
- `matchesBosPath(pathname: string): boolean`
- `isBosAsset(pathname: string): boolean`
- `type AuthGateOutcome`
- `interface AuthGateContext (4 members)`
- `interface AuthGateOptions (1 members)`
- `interface AuthGateDecision (3 members)`
- `DEFAULT_LOGIN_PATH`
- `buildLoginRedirect(opts: { loginPath?: string; nextPath: string }): string`
- `interface BosMeUser (4 members)`
- `interface BosMePayload (4 members)`

## Depends on (1)

- [`src/built-ins/modules/bos-auth-gate/src/lib/tenancy.ts`](./tenancy.md)

## Used by (2)

- [`src/built-ins/modules/bos-auth-gate/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/bos-auth-gate/src/server/services.ts`](../server/services.md)

