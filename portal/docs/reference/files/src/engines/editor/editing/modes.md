# `src/engines/editor/editing/modes.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** How deep somebody wants to go, kept separate from what they are editing. The Studio's tabs answer "what am I changing?" — content, layout, brand, code. That is a different question from "how much do I want to be shown?", and collapsing the two is why an editor feels intimidating to one person and restrictive to the next. Six tabs in front of somebody who came to fix a typo is noise; hiding the code from somebody who wants it is a dead end. So the mode is chosen once and gates the tabs. Same editor, three depths.

## Exports (6)

- `type EditingMode`
- `interface EditingModeDefinition (4 members)`
- `EDITING_MODES: EditingModeDefinition[]`
- `editingMode(id: string | null | undefined): EditingModeDefinition`
- `modeAllowsTab(mode: EditingMode, tab: string): boolean`
- `tabForMode(mode: EditingMode, currentTab: string): string`

## Used by (4)

- [`scripts/smoke-aqua-editor-ai.test.ts`](../../../../scripts/smoke-aqua-editor-ai.test.md)
- [`scripts/smoke-editing-modes.test.ts`](../../../../scripts/smoke-editing-modes.test.md)
- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../../../app/portal/agency/portals/editor/_ClientPortalStudio.md)
- [`src/components/editing/EditorModeSwitch.tsx`](../../../components/editing/EditorModeSwitch.md)

