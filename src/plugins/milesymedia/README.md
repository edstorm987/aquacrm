# Milesy Media — plugin pack

The agency's own bundle of sidebar items, workspace dashboards and
operating surfaces. Treats Milesy Media as the first **portal plugin
tenant** under the foundation's plugin model.

## Contents (today)

- **Aqua HQ workspace** — Dashboard, Clients, Pipelines, Inbox, SOPs,
  Finance (currently hard-coded in `src/lib/chrome/sidebarLayout.ts`
  `defaultMainItems()`; will migrate here once the plugin contract
  supports workspace-aware items).
- **Finance workspace dashboard** — `src/app/portal/agency/workspaces/finance/`.
- **Marketing workspace dashboard** — `src/app/portal/agency/workspaces/marketing/`.
- **Operations workspace dashboard** — `src/app/portal/agency/workspaces/ops/`.
- **Workspace config** — `src/lib/chrome/workspaces.ts` (declares Aqua HQ /
  Finance / Marketing / Operations with colors, panels, hrefs).

## Migration roadmap

1. Define `MilesymediaPluginManifest` — a typed object listing the
   workspaces + nav items the agency contributes.
2. Register it via the foundation plugin registry
   (`src/plugins/_registry.ts`).
3. Extract the hard-coded items in `sidebarLayout.ts` into this manifest.
4. Move the workspace dashboard pages (`src/app/portal/agency/workspaces/*`)
   into this folder once the foundation supports plugin-served routes.

See `01 development/files.md` for the wider repo reorg.
