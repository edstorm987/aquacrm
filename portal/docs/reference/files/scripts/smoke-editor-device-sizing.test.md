# `scripts/smoke-editor-device-sizing.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** PHASE 10 — REAL DEVICE SIZING: exact dimensions, and the draggable box.  Ed: "make the browser responsive... custom dimensions preset for phones tablets laptops etc and it will make the browser to exactly that. it lives inside a box but the draggable thing is the box the browser sits in."  Three defects this file exists to keep dead:  1. THE SQUASH. `PreviewFrame` rendered the pane with `maxWidth: "100%"`, so a preset meant "as much of 393px as the pane allows" — a different number on every screen, which is the opposite of a device preset. 2. THE LESSER CONTROL. The full device system (26 presets with width AND height, rotation, zoom, custom W×H, persistence) sat unmounted in the website-editor module while the editor used `BreakpointControl`, a width-only subset. The disease from the plan's "Why now": built, never mounted. 3. THE LYING COMMENT. `devicePresets.ts` claimed Responsive mode "lets the operator drag the canvas edges to any size" and no consumer implemented it. The editor's browser BOX implements it now — handles on the right edge, bottom edge and corner, pointer-captured, clamped, written back as the custom dimensions.  What is pinned: the maths is IMPORTED from `devicePresets.ts` (one `effectiveViewport`, never a fork), the iframe lays out at true device pixels and scrolls rather than squashes, zoom is a compositor transform with the true size still stated, the drag handles exist with their clamps and their pointer-capture, the choice persists PER PROJECT, and a resize never changes the iframe's identity (the walkthrough's no-remount rule, extended to sizing).

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/components/editing/DeviceControl.tsx`](../src/components/editing/DeviceControl.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

