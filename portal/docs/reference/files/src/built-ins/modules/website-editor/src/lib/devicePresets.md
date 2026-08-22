# `src/built-ins/modules/website-editor/src/lib/devicePresets.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Device preset library for the editor preview.  Mirrors Chrome DevTools' device toolbar — a curated set of common phones, tablets, laptops and desktops, plus a "Responsive" mode that lets the operator drag the canvas edges to any size. (For a long time that sentence described an intention: no consumer implemented the drag. Since 2026-08-22 one does — the browser BOX in the Dev Editor, `PreviewFrame` in `src/engines/editor/DevEditor.tsx`, grows handles on its right/bottom/corner in Responsive mode and writes the dragged size back as `customWidth`/`customHeight`.)  Dimensions are CSS-pixels (the viewport size at 1× DPR), portrait orientation. The DevicePreview component handles rotation by swapping width/height at render time.

## Exports (10)

- `type DeviceCategory`
- `interface DeviceSpec (8 members)`
- `DEVICE_PRESETS: DeviceSpec[]`
- `CATEGORY_LABELS: Record<DeviceCategory, string>`
- `getDevicePreset(id: string): DeviceSpec | undefined`
- `interface DeviceState (6 members)`
- `DEFAULT_DEVICE_STATE: DeviceState`
- `loadDeviceState(scope?: string): DeviceState`
- `saveDeviceState(state: DeviceState, scope?: string): void`
- `effectiveViewport(spec: DeviceSpec, state: DeviceState): { width: number; height: number }`

## Used by (5)

- [`src/app/portal/agency/development/projects/[projectId]/_FirstPartyProjectWorkspace.tsx`](../../../../../app/portal/agency/development/projects/[projectId]/_FirstPartyProjectWorkspace.md)
- [`src/built-ins/modules/website-editor/src/components/canvas/Canvas.tsx`](../components/canvas/Canvas.md)
- [`src/built-ins/modules/website-editor/src/components/devicePreview.tsx`](../components/devicePreview.md)
- [`src/built-ins/modules/website-editor/src/components/editor/EditorBlockStage.tsx`](../components/editor/EditorBlockStage.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)

