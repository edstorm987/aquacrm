# `src/built-ins/modules/fulfillment/src/server/starterVariant.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Starter portal variant — T3 integration shim.  **TODO** — once T3 ships `@aqua/plugin-website-editor`, the foundation will register T3's concrete `PortalVariantPort` and the call below will drive a real block-tree apply. Until then this falls back to logging the intent so phase-engine commits don't break.  The contract (per `04-architecture.md §7` + the chief commander's brokering): each phase carries a `portalVariantId` (string). The variant content (block tree) lives in T3's editor store. Applying a starter variant copies the named template into the active client variant for the given role (typically `client-owner`).

## Exports (4)

- `interface ApplyVariantArgs (5 members)`
- `interface ApplyVariantResult (4 members)`
- `class StarterVariantService`
    - `constructor(private port: PortalVariantPort)`
    - `async apply(args: ApplyVariantArgs): Promise<ApplyVariantResult | { ok: false; error: string }>`
- `NOOP_PORTAL_VARIANT_PORT: PortalVariantPort`

## Depends on (2)

- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/fulfillment/src/server/clients.ts`](./clients.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/fulfillment/src/server/transitions.ts`](./transitions.md)

