# `src/built-ins/modules/bos-auth-gate/src/server/services.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** BOS auth-gate service.  Pure decision engine — no storage. Foundation middleware imports `evaluate` and routes accordingly. The `me` route reads via the optional FunnelMePort + the standard UserPort.

## Exports (3)

- `evaluate(ctx: AuthGateContext, opts: AuthGateOptions = {}): AuthGateDecision`
- `interface MeResolverDeps (5 members)`
- `class GateService`
    - `constructor(deps: MeResolverDeps)`
    - `async me(actor: UserId, role?: string): Promise<BosMePayload | null>`

## Depends on (3)

- [`src/built-ins/modules/bos-auth-gate/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/bos-auth-gate/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/bos-auth-gate/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/bos-auth-gate/src/server/index.ts`](./index.md)

