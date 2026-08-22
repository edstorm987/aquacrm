# `src/built-ins/modules/agency-hr/index.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Manifest export — `@aqua/plugin-agency-hr`.  Default-exports a single `AquaPlugin` that the foundation registers in `_registry.ts`. Mirrors the fulfillment + ecommerce shape so the foundation's wire-up is a one-line addition.  Scope policy: `"agency"` — every install belongs to one agency, never a single client. Core: `false` — agency owners opt in via the agency-side marketplace; this is not auto-installed.

## Exports (1)

- `default manifest`

## Depends on (3)

- [`src/built-ins/modules/agency-hr/src/api/routes.ts`](./src/api/routes.md)
- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](./src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](./src/server/foundationAdapter.md)

## Used by (2)

- [`scripts/smoke-nav-audit.test.ts`](../../../../scripts/smoke-nav-audit.test.md)
- [`scripts/smoke-tools-directory.test.ts`](../../../../scripts/smoke-tools-directory.test.md)

