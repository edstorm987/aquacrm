# `src/lib/shared/devProjectGrouping.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Dev projects, grouped into Ed's two levels for DISPLAY.  The RULES live in the store (`saveDevProject` / `deleteDevProject` in src/engines/editor/server/devProjects.ts): exactly two levels, a child can never be a parent, a parent with children can never be deleted. This module only arranges an already-legal flat list for a screen — parents in the order the server sent them (updatedAt, newest first), each with its children gathered underneath — and it is shared rather than inlined so the Projects workspace and any future consumer group the same way, and so the grouping is testable without mounting a screen.  Pure and client-safe on purpose: no `server-only`, no imports beyond the structural type below, because the projects list reaches the browser whole through the projects GET and the grouping happens where it renders.

## Exports (4)

- `interface DevProjectGroupable (2 members)`
- `interface DevProjectGroup (2 members)`
- `groupDevProjects<T extends DevProjectGroupable>(projects: T[]): DevProjectGroup<T>[]`
- `devProjectDoorFamily<T extends DevProjectGroupable>(projects: T[], doorProjectId: string): T[]`

## Used by (3)

- [`scripts/smoke-dev-project-nesting.test.ts`](../../../scripts/smoke-dev-project-nesting.test.md)
- [`src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx`](../../app/portal/dev-team/editor/setup/_DevEditorSetup.md)
- [`src/engines/editor/DevEditor.tsx`](../../engines/editor/DevEditor.md)

