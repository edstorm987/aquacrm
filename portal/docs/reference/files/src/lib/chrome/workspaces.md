# `src/lib/chrome/workspaces.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Workspaces — Ed's "custom sidebar" concept. Each workspace is a mode the operator switches into: the sidebar narrows to the panels that belong to that workspace, the theme tints to match, and a Back row sits at the top of the sidebar. Persists in localStorage under `mm-active-workspace`. The active value is mirrored as a `data-workspace="<id>"` attribute on the sidebar <aside>, which CSS rules in globals.css consume to hide non-matching panels and override `--brand-primary`.

## Exports (4)

- `WORKSPACE_STORAGE_KEY`
- `interface WorkspaceConfig (7 members)`
- `WORKSPACES: WorkspaceConfig[]`
- `findWorkspace(id: string | null | undefined): WorkspaceConfig | null`

## Used by (1)

- [`src/components/chrome/Sidebar.tsx`](../../components/chrome/Sidebar.md)

