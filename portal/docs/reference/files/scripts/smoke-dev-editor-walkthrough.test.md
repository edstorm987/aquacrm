# `scripts/smoke-dev-editor-walkthrough.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** THE 2026-08-22 WALKTHROUGH DEFECTS — pinned so they cannot return.  Ed walked the editor in a live browser and hit four things at once (docs/development/plans/dev-editor-finish.md — phase 1 minus nesting, phase 8 partials, and the walkthrough defects):  1. The editor's Settings tab rendered the ENTIRE projects screen — cream `--dt-*` cards inside the dark editor, "Add a project" inside a project, and an "Open editor" button INSIDE the editor. 2. The project switcher was a `w-full` select over every project in the agency, rendered AFTER the mode switch, eating the header. 3. Every mode click white-flashed the browser pane for seconds. 4. The universal "+" existed only in the canvas header, not on the inspector rail where the eye already is.  These are source-level pins over the same components the defects lived in, plus the empirical finding behind (3): driving the REAL DevEditor in a browser (esbuild bundle, stubbed leaf panels, instrumented iframe) showed the iframe NEVER remounts on a mode click — one load event and one element identity across every switch. The white flash was the mode CUTSCENE: a full-screen `inset-0` wash plus a `backdrop-blur-md` card painted over the cross-origin iframe, which forces Chromium to re-raster the out-of-process frame — blanking it white for as long as the card is up. So what is pinned for (3) is the cutscene's shape, the iframe's stable key, and that a mode change touches no frame state.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

