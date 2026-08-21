# `src/components/editing/EditorModeSwitch.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

_No file-level doc-comment. Purpose inferred from its path (Components — src/components/) and its exports below._

## Exports (4)

- `interface ModeSkin (6 members)`
- `MODE_SKINS: Record<EditingMode, ModeSkin>`
- `modeSkin(mode: EditingMode): ModeSkin`
- `EditorModeSwitch({ mode, onChange, available, }: { mode: EditingMode; onChange: (next: EditingMode) => void; /** Modes worth offering here — a repository has no "Design it". */ available?: EditingMode[]; })`

## Depends on (2)

- [`src/engines/editor/editing/modes.ts`](../../engines/editor/editing/modes.md)
- [`src/lib/chrome/cinematicMode.ts`](../../lib/chrome/cinematicMode.md)

## Used by (1)

- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../../app/portal/agency/portals/editor/_ClientPortalStudio.md)

