# `src/built-ins/runtime/_pathMapping.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Resolve which plugin owns a `/portal/*` path. Used by the chrome to highlight the active nav item, and by route shells to find the right install record before mounting a plugin's page component.  04's path shape (vs 02's `/admin/*`): /portal/agency/<plugin-id>/...                  agency-scoped install /portal/clients/<clientId>/<plugin-id>/...      client-scoped install  Match rule: longest-prefix wins on the plugin's contributed nav hrefs.

## Exports (2)

- `interface PathMatch (3 members)`
- `pluginIdForPath(pathname: string): PathMatch | null`

## Depends on (1)

- [`src/built-ins/runtime/_registry.ts`](./_registry.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

