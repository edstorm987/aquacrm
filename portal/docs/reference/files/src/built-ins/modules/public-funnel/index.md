# `src/built-ins/modules/public-funnel/index.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `@aqua/plugin-public-funnel` — wires the Health Check (and future Resources tools) completion to a `lead` user creation + auto-signin + drop into Business OS. The critical link in the public funnel. `core: true` so it auto-installs on bootstrap.  Scope policy note: the round 021 prompt suggests `"global"` (leads are agency-less), but until that scope-policy value lands we ship as `"agency"` and gate via the master "Milesy Media" agency. The plugin does the right thing under either scope — captures live in the install's storage and emit `agencyId` in events for whichever agency hosts the install.

## Exports (1)

- `default manifest`

## Depends on (3)

- [`src/built-ins/modules/public-funnel/src/api/routes.ts`](./src/api/routes.md)
- [`src/built-ins/modules/public-funnel/src/lib/aquaPluginTypes.ts`](./src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/public-funnel/src/server/foundationAdapter.ts`](./src/server/foundationAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

