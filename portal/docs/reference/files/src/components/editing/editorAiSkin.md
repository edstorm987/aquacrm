# `src/components/editing/editorAiSkin.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** ─── AQUA EDITOR AI — the editor's clothes, not the dev workspace's ──────────  Ed's complaint, and the reason this file exists: panels dropped into the Dev Editor kept arriving wearing the dev workspace's `--dt-*` tokens — light cards, hairlines, a different type scale — inside a dark, translucent, full-screen editor. Two design systems on one screen reads as a bug even when every pixel is deliberate.  So: the editor's vocabulary, written down once.  • dark and translucent — `border-white/10`, `bg-black/30`, `bg-white/[0.05]` • ONE accent, `--mode-accent`, which the editor root repaints on every mode change (see `DevEditor.tsx` and `EditorModeSwitch.tsx`) • NO `--dt-*` tokens. Not one. They belong to `/portal/dev-team/**`.  ── Why the accent is re-declared as `--aqua-ai-accent` ──────────────────────  `var(--mode-accent, #67e8f9)` inside a Tailwind arbitrary value would carry a comma through the class scanner. The panel root sets ONE token from it instead, so every class below can reference a single, comma-free name and the fallback still applies on a surface that is not the editor.

## Exports (15)

- `ACCENT_VAR`
- `accentStyle`
- `ACCENT_TEXT`
- `ACCENT_BG`
- `ACCENT_BORDER`
- `FOCUS_RING`
- `MUTED`
- `BODY`
- `STRONG`
- `PANEL`
- `FIELD`
- `ICON_BUTTON`
- `CHIP_BUTTON`
- `PRIMARY_BUTTON`
- `DANGER_BUTTON`

## Used by (6)

- [`src/components/editing/AquaEditorAI.tsx`](./AquaEditorAI.md)
- [`src/components/editing/AquaEditorAIKey.tsx`](./AquaEditorAIKey.md)
- [`src/components/editing/AquaEditorAIThread.tsx`](./AquaEditorAIThread.md)
- [`src/components/editing/LibrarianPanel.tsx`](./LibrarianPanel.md)
- [`src/components/editing/PageSeoPanel.tsx`](./PageSeoPanel.md)
- [`src/components/editing/WorkLifecyclePanel.tsx`](./WorkLifecyclePanel.md)

