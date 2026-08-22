# `src/components/editing/codeTheme.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** ─── DEV EDITOR — file colours and syntax colours ────────────────────────────  Two jobs, both about reading a repository quickly: • FILE COLOUR — the tint of a file's icon in the tree and tabs, so a .tsx reads differently from a .json at a glance, the way VS Code's Seti/Material icon themes work. SYNTAX colouring is NOT here: that is CodeMirror's job, with the real VS Code Dark+ theme — see CodeSurface.tsx. This file is only the icon tints, which are a navigation aid rather than a grammar. The icon tint for a path — Seti-ish, and consistent across tree and tabs.

## Exports (1)

- `fileColour(path: string): string`

## Used by (1)

- [`src/components/editing/EditorCodeCanvas.tsx`](./EditorCodeCanvas.md)

