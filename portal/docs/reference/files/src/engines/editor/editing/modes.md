# `src/engines/editor/editing/modes.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** How deep somebody wants to go, kept separate from what they are editing. The Studio's tabs answer "what am I changing?" — content, layout, brand, code. That is a different question from "how much do I want to be shown?", and collapsing the two is why an editor feels intimidating to one person and restrictive to the next. Six tabs in front of somebody who came to fix a typo is noise; hiding the code from somebody who wants it is a dead end. So the mode is chosen once and gates the tabs. Same editor, three depths. A SECOND axis joined this one in phase 9: the SURFACE (`editing/surfaces.ts`) — Website or Normal — which answers "what am I working on?" rather than "how deep do I want to go?". The two are orthogonal and multiply; `inspectorTabsFor` below is the one place they meet, and the only place either may gate a tab.

## Exports (11)

- `type EditingMode`
- `interface EditingModeDefinition (4 members)`
- `EDITING_MODES: EditingModeDefinition[]`
- `INSPECTOR_TABS`
- `type InspectorTab`
- `inspectorTabsFor(mode: EditingMode, target: { portalTarget: boolean; tagMapped: boolean; surface: EditorSurface }): InspectorTab[]`
- `editingMode(id: string | null | undefined): EditingModeDefinition`
- `modeAllowsTab(mode: EditingMode, tab: string): boolean`
- `tabForMode(mode: EditingMode, currentTab: string): string`
- `SURFACE_TABS`
- `tabForSurface(surface: EditorSurface, mode: EditingMode, currentTab: string): string`

## Depends on (1)

- [`src/engines/editor/editing/surfaces.ts`](./surfaces.md)

## Used by (11)

- [`scripts/smoke-aqua-editor-ai.test.ts`](../../../../scripts/smoke-aqua-editor-ai.test.md)
- [`scripts/smoke-dev-editor-tag-bridge.test.ts`](../../../../scripts/smoke-dev-editor-tag-bridge.test.md)
- [`scripts/smoke-editing-modes.test.ts`](../../../../scripts/smoke-editing-modes.test.md)
- [`scripts/smoke-editor-element-palette.test.ts`](../../../../scripts/smoke-editor-element-palette.test.md)
- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`scripts/smoke-editor-target-aware.test.ts`](../../../../scripts/smoke-editor-target-aware.test.md)
- [`scripts/smoke-librarian.test.ts`](../../../../scripts/smoke-librarian.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/components/editing/EditorModeSwitch.tsx`](../../../components/editing/EditorModeSwitch.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/editing/selectionRouting.ts`](./selectionRouting.md)

