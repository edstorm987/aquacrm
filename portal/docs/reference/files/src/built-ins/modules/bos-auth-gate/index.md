# `src/built-ins/modules/bos-auth-gate/index.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `@aqua/plugin-bos-auth-gate` — gates `/business-os/*` on a real session and surfaces lead user state (HC slot, captures) for BOS personalisation. The plugin ships as a pure decision engine (`evaluate(ctx, opts)`) plus a `/api/portal/business-os/me` endpoint; foundation calls `evaluate` from `middleware.ts` to translate the decision into a 302 or pass-through response. HARD BOUNDARY: this plugin does NOT edit `public/business-os/` (T4 territory) and does NOT edit `milesymedia-website/` source (T1 territory) — wire-up is documented as foundation-pending.

## Exports (1)

- `default manifest`

## Depends on (3)

- [`src/built-ins/modules/bos-auth-gate/src/api/routes.ts`](./src/api/routes.md)
- [`src/built-ins/modules/bos-auth-gate/src/lib/aquaPluginTypes.ts`](./src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/bos-auth-gate/src/server/foundationAdapter.ts`](./src/server/foundationAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

