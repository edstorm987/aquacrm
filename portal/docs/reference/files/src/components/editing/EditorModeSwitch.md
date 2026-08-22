# `src/components/editing/EditorModeSwitch.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

_No file-level doc-comment. Purpose inferred from its path (Components — src/components/) and its exports below._

## Exports (4)

- `interface ModeSkin (6 members)`
- `MODE_SKINS: Record<EditingMode, ModeSkin>`
- `modeSkin(mode: EditingMode): ModeSkin`
- `EditorModeSwitch({ mode, onChange, available, }: { mode: EditingMode; onChange: (next: EditingMode) => void; /** * Optional narrowing. Deliberately unused by the editor: it is a UNIVERSAL * editor, and hiding modes based on what we guess y…`

## Depends on (2)

- [`src/engines/editor/editing/modes.ts`](../../engines/editor/editing/modes.md)
- [`src/lib/chrome/cinematicMode.ts`](../../lib/chrome/cinematicMode.md)

## Used by (1)

- [`src/engines/editor/DevEditor.tsx`](../../engines/editor/DevEditor.md)

