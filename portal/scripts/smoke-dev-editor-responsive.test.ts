import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transform } from "lightningcss";

import {
  RESPONSIVE_CANVAS_PANE_CSS,
  responsiveCanvasPaneAttributes,
} from "../src/engines/editor/editing/responsiveCanvasPanes";

const editor = readFileSync(new URL("../src/engines/editor/DevEditor.tsx", import.meta.url), "utf8");
const previewControl = readFileSync(new URL("../src/components/editing/RepositoryPreviewControl.tsx", import.meta.url), "utf8");

test("phone and tablet Dev mode expose one complete canvas at a time", () => {
  assert.match(editor, /compactCanvasPane, setCompactCanvasPane/);
  assert.match(editor, /aria-label="Canvas pane"[\s\S]{0,160}?xl:hidden/);
  assert.match(editor, /onClick=\{\(\) => setCompactCanvasPane\("preview"\)\}/);
  assert.match(editor, /onClick=\{\(\) => setCompactCanvasPane\("code"\)\}/);

  // The two canvases stay mounted, preserving iframe and code-buffer state.
  // Literal state attributes, rather than competing Tailwind display classes,
  // expose only the selected one until the real desktop breakpoint.
  assert.match(editor, /responsiveCanvasPaneAttributes\(compactCanvasPane, "preview", compactCanvasSwitching\)/);
  assert.match(editor, /responsiveCanvasPaneAttributes\(compactCanvasPane, "code", compactCanvasSwitching\)/);
  assert.match(editor, /<style>\{RESPONSIVE_CANVAS_PANE_CSS\}<\/style>/);
  assert.doesNotMatch(editor, /compactCanvasPane !== "(?:preview|code)" \? "hidden xl:/);
  assert.match(editor, /hidden w-1\.5 shrink-0 cursor-col-resize[\s\S]{0,160}?xl:block/);
  assert.doesNotMatch(editor, /style=\{codePane \|\| splitBrowsers \? \{ width:/);
});

test("compact canvas state produces mutually exclusive browser-visible pane attributes", () => {
  assert.deepEqual(
    responsiveCanvasPaneAttributes("preview", "preview", true),
    { "data-editor-canvas-pane": "preview", "data-compact-visible": "true" },
  );
  assert.deepEqual(
    responsiveCanvasPaneAttributes("preview", "code", true),
    { "data-editor-canvas-pane": "code", "data-compact-visible": "false" },
  );

  // This is the real regression: changing the pressed Code button must also
  // swap the pane attributes consumed by the compact media rule.
  assert.deepEqual(
    responsiveCanvasPaneAttributes("code", "preview", true),
    { "data-editor-canvas-pane": "preview", "data-compact-visible": "false" },
  );
  assert.deepEqual(
    responsiveCanvasPaneAttributes("code", "code", true),
    { "data-editor-canvas-pane": "code", "data-compact-visible": "true" },
  );

  // With only one canvas mounted, no stale compact selection may hide it.
  assert.equal(
    responsiveCanvasPaneAttributes("preview", "code", false)["data-compact-visible"],
    "true",
  );
});

test("compact pane CSS survives compilation and force-hides only the inactive pane", () => {
  const compiled = transform({
    code: Buffer.from(RESPONSIVE_CANVAS_PANE_CSS),
    minify: true,
  }).code.toString();

  assert.match(compiled, /@media ?\((?:max-width:1279px|width<=1279px)\)/);
  assert.match(compiled, /\[data-editor-canvas-pane\]\[data-compact-visible=false\]/);
  assert.match(compiled, /display:none!important/);
  assert.doesNotMatch(compiled, /data-compact-visible=true[^}]*display:none/);
});

test("compact editor controls wrap or scroll inside their own available width", () => {
  assert.match(editor, /row-start-2 flex min-w-0 flex-wrap items-center/);
  assert.match(editor, /row-start-3 grid min-w-0 grid-cols-1/);
  assert.match(editor, /sm:grid-cols-2[\s\S]{0,180}?xl:flex/);
  assert.match(editor, /col-span-full flex min-w-0 items-center justify-start/);

  // URL, Load and handshake status use two bounded grid rows, rather than a
  // flex line whose right-hand actions disappear inside a half-width pane.
  assert.match(editor, /grid grid-cols-\[auto_minmax\(0,1fr\)_auto\] items-center gap-1\.5/);
  assert.match(editor, /col-span-2 col-start-2 flex min-w-0[\s\S]{0,100}?TagBridgeBadge/);
});

test("the compact inspector remains navigable however many tools are allowed", () => {
  assert.match(editor, /flex min-w-0 flex-1 overflow-x-auto/);
  assert.match(editor, /min-h-14 w-16 shrink-0 flex-col/);
  assert.match(editor, /grid min-h-14 w-11 shrink-0 place-items-center border-l/);
  assert.match(editor, /setCompactCanvasPane\("code"\);\n    setMobileInspectorOpen\(false\);/,
    "opening a file reveals the code canvas and dismisses the compact inspector sheet");
});

test("repository preview logs are collapsible and height-bounded by breakpoint", () => {
  assert.match(previewControl, /\{logsOpen \? "Hide logs" : "Logs"\}/);
  assert.match(previewControl, /max-h-28 overflow-auto overscroll-contain/);
  assert.match(previewControl, /sm:max-h-40/);
  assert.match(previewControl, /xl:max-h-52/);
});
