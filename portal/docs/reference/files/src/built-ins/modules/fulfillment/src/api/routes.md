# `src/built-ins/modules/fulfillment/src/api/routes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** API route manifest. Mounted by the foundation under `/api/portal/fulfillment/<path>`.  Routes are kept short + verb-oriented so URL alone tells you what they do. Path conventions:  GET  /clients                     list clients for the agency POST /clients                     create a client (with phase preset) POST /phase/advance               advance a client to next phase GET  /checklist                   ?clientId=&phaseId= → view POST /checklist/tick              tick / untick a checklist item GET  /phases                      list phase definitions for the agency POST /phases                      upsert a phase definition DELETE /phases                    ?id= delete a phase GET  /presets                     list seeded phase presets (wizard tooltip) GET  /marketplace                 ?clientId= → cards POST /marketplace/install         install a plugin for a client POST /marketplace/enable          enable / disable an install POST /marketplace/uninstall       uninstall a plugin for a client GET  /activity                    ?clientId= optional, recent entries

## Exports (1)

- `apiRoutes: readonly PluginApiRoute[]`

## Depends on (2)

- [`src/built-ins/modules/fulfillment/src/api/handlers.ts`](./handlers.md)
- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by (1)

- [`src/built-ins/modules/fulfillment/index.ts`](../../index.md)

