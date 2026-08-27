// PHASE 10 — REAL DEVICE SIZING: exact dimensions, and the draggable box.
//
// Ed: "make the browser responsive... custom dimensions preset for phones
// tablets laptops etc and it will make the browser to exactly that. it lives
// inside a box but the draggable thing is the box the browser sits in."
//
// Three defects this file exists to keep dead:
//
//   1. THE SQUASH. `PreviewFrame` rendered the pane with `maxWidth: "100%"`,
//      so a preset meant "as much of 393px as the pane allows" — a different
//      number on every screen, which is the opposite of a device preset.
//   2. THE LESSER CONTROL. The full device system (26 presets with width AND
//      height, rotation, zoom, custom W×H, persistence) sat unmounted in the
//      website-editor module while the editor used `BreakpointControl`, a
//      width-only subset. The disease from the plan's "Why now": built, never
//      mounted.
//   3. THE LYING COMMENT. `devicePresets.ts` claimed Responsive mode "lets
//      the operator drag the canvas edges to any size" and no consumer
//      implemented it. The editor's browser BOX implements it now — handles
//      on the right edge, bottom edge and corner, pointer-captured, clamped,
//      written back as the custom dimensions.
//
// What is pinned: the maths is IMPORTED from `devicePresets.ts` (one
// `effectiveViewport`, never a fork), the iframe lays out at true device
// pixels and scrolls rather than squashes, zoom is a compositor transform
// with the true size still stated, the drag handles exist with their clamps
// and their pointer-capture, the choice persists PER PROJECT, and a resize
// never changes the iframe's identity (the walkthrough's no-remount rule,
// extended to sizing).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DEVICE_STATE,
  DEVICE_MAX_SIZE,
  DEVICE_MIN_HEIGHT,
  DEVICE_MIN_WIDTH,
  DEVICE_PRESETS,
  clampDeviceSize,
  deviceLabel,
  effectiveViewport,
  getDevicePreset,
  loadDeviceState,
  saveDeviceState,
  type DeviceState,
} from "../src/components/editing/DeviceControl.tsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const editor = read("src", "engines", "editor", "DevEditor.tsx");
const control = read("src", "components", "editing", "DeviceControl.tsx");
const presets = read("src", "built-ins", "modules", "website-editor", "src", "lib", "devicePresets.ts");

/** Source with comments stripped, so prose about a defect never reads as the defect. */
const code = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

/**
 * Run with a fake window + localStorage, restored afterwards.
 *
 * `loadDeviceState`/`saveDeviceState` are honest about SSR (`typeof window`),
 * so exercising the persistence from node needs both globals stood up. Maps,
 * not spies — the test wants the round trip, not the call.
 */
function withLocalStorage<T>(run: (store: Map<string, string>) => T): T {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  };
  const hadWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const hadStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  try {
    return run(store);
  } finally {
    if (hadWindow) Object.defineProperty(globalThis, "window", hadWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (hadStorage) Object.defineProperty(globalThis, "localStorage", hadStorage);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

// ─── 1. The real system, mounted — and the lesser one gone ──────────────────

describe("the editor mounts the REAL device system", () => {
  it("BreakpointControl is gone — control and file", () => {
    assert.equal(existsSync(join(ROOT, "src", "components", "editing", "BreakpointControl.tsx")), false,
      "the width-only control was superseded, not kept as a second door");
    assert.equal(/BreakpointControl/.test(code(editor)), false);
    assert.match(editor, /<DeviceControl value=\{deviceState\} onChange=\{setDeviceState\} \/>/);
  });

  it("the maths is imported, never forked", () => {
    // ONE `effectiveViewport`, in the module that owns the presets. The
    // control re-exports it; the editor consumes it through that single door
    // (so `DevEditor.tsx` itself still carries zero built-ins imports — the
    // bundle-split rule smoke-editor-element-palette pins).
    assert.match(control, /from "@built-ins\/modules\/website-editor\/src\/lib\/devicePresets"/);
    assert.equal(/const DEVICE_PRESETS/.test(code(control)), false, "the preset table must not be retyped");
    assert.equal(/function effectiveViewport/.test(code(control)), false, "the viewport maths must not be retyped");
    assert.match(editor, /from "@\/components\/editing\/DeviceControl"/);
    assert.equal(/from "@\/built-ins\/modules\/website-editor/.test(editor), false);
    assert.match(editor, /const viewport = effectiveViewport\(spec, device\)/);
  });

  it("26 presets, all with width AND height — the library the plan counted", () => {
    assert.equal(DEVICE_PRESETS.length, 26);
    const byCategory = (category: string) => DEVICE_PRESETS.filter(preset => preset.category === category).length;
    assert.equal(byCategory("responsive"), 1);
    assert.equal(byCategory("phone"), 10);
    assert.equal(byCategory("tablet"), 6);
    assert.equal(byCategory("laptop"), 4);
    assert.equal(byCategory("desktop"), 5);
    for (const preset of DEVICE_PRESETS) {
      assert.ok(preset.width > 0 && preset.height > 0, `${preset.id} is missing a dimension`);
    }
  });

  it("offers the whole system in the toolbar: categories, custom W×H, rotate, zoom", () => {
    assert.match(control, /<optgroup key=\{category\} label=\{CATEGORY_LABELS\[category\]\}/);
    assert.match(control, /aria-label="Rotate"/);
    assert.match(control, /aria-label="Zoom"/);
    assert.match(control, /Custom width in pixels/);
    assert.match(control, /Custom height in pixels/);
    // The quick row leads with Responsive — the draggable box is the feature,
    // not a hidden mode.
    assert.match(control, /\{ id: "responsive", label: "Responsive — drag the box to any size", icon: Scan \}/);
  });
});

// ─── 2. EXACT means exact ────────────────────────────────────────────────────

describe("a chosen device is EXACTLY that size", () => {
  it("effectiveViewport answers in true device pixels", () => {
    const iphone = getDevicePreset("iphone-14-pro")!;
    assert.deepEqual(effectiveViewport(iphone, { ...DEFAULT_DEVICE_STATE, deviceId: "iphone-14-pro" }),
      { width: 393, height: 852 });
    // Rotation swaps, never scales.
    assert.deepEqual(effectiveViewport(iphone, { ...DEFAULT_DEVICE_STATE, deviceId: "iphone-14-pro", rotated: true }),
      { width: 852, height: 393 });
    // Responsive mode is the custom dimensions — the numbers the drag writes.
    const responsive = getDevicePreset("responsive")!;
    assert.deepEqual(effectiveViewport(responsive, { ...DEFAULT_DEVICE_STATE, customWidth: 999, customHeight: 777 }),
      { width: 999, height: 777 });
  });

  it("the squash is dead — no maxWidth anywhere in the editor", () => {
    // The defect, verbatim: `style={{ width: Math.min(…, 1440), maxWidth: "100%" }}`.
    // A preset squashed to the pane is not that device; it is a lie wearing
    // the device's name.
    assert.equal(/maxWidth/.test(code(editor)), false, "the pane must never squash the device");
    assert.equal(/Math\.min\([^)]*1440/.test(code(editor)), false, "no silent 1440 cap either");
  });

  it("the iframe LAYS OUT at device pixels; zoom is only a transform over them", () => {
    // Layout size is what the page sees (media queries, vw, layout); the
    // transform is only what the operator sees. Two different numbers, kept
    // apart on the same element.
    assert.match(editor, /style=\{\{ width: viewport\.width, height: viewport\.height, transform: `scale\(\$\{zoom\}\)`, transformOrigin: "top left" \}\}/);
    // …inside a footprint sized to the SCALED box, so the pane's scrollbars
    // and centring see the visual size, not the layout size.
    assert.match(editor, /style=\{\{ width: scaled\.width, height: scaled\.height \}\}/);
  });

  it("a device bigger than the pane SCROLLS at 1:1 — auto-zoom would lie", () => {
    // The choice, stated: scroll keeps text at the size the device would
    // really render, so "does this headline fit an iPhone" is answered
    // honestly. Auto-zoom shrinks the view to fit and quietly changes that
    // answer. Zoom exists — in the toolbar, as the operator's own choice.
    assert.match(editor, /min-h-0 min-w-0 overflow-auto p-3 sm:p-4 xl:p-6/, "the pane is the scroll container");
    assert.match(editor, /--editor-preview-width[\s\S]*splitRatio \* 100/);
    assert.match(editor, /xl:w-\[var\(--editor-preview-width\)\] xl:flex-none/,
      "only a wide desktop applies the split width; compact screens get the full pane");
  });

  it("the size label states TRUE device pixels, zoom beside them", () => {
    assert.equal(deviceLabel({ ...DEFAULT_DEVICE_STATE, deviceId: "iphone-14-pro" }), "iPhone 14 Pro · 393 × 852");
    assert.equal(deviceLabel({ ...DEFAULT_DEVICE_STATE, deviceId: "iphone-14-pro", zoom: 0.5 }),
      "iPhone 14 Pro · 393 × 852 · 50%", "zoom is stated, never multiplied into the pixels");
    assert.equal(deviceLabel({ ...DEFAULT_DEVICE_STATE, deviceId: "iphone-14-pro", rotated: true }), "iPhone 14 Pro · 852 × 393");
    assert.equal(deviceLabel(DEFAULT_DEVICE_STATE), "Responsive · 1280 × 800");
    assert.match(editor, /deviceLabel\(deviceState\)/);
  });
});

// ─── 3. The draggable box ────────────────────────────────────────────────────

describe("in Responsive mode, the BOX the browser sits in is the draggable thing", () => {
  it("grows a handle per edge and one on the corner, in Responsive mode only", () => {
    assert.match(editor, /const draggable = spec\.category === "responsive" && Boolean\(onDeviceResize\)/);
    assert.match(editor, /\{\.\.\.grip\("x"\)\}/);
    assert.match(editor, /\{\.\.\.grip\("y"\)\}/);
    assert.match(editor, /\{\.\.\.grip\("both"\)\}/);
    for (const cursor of ["cursor-ew-resize", "cursor-ns-resize", "cursor-nwse-resize"]) {
      assert.match(editor, new RegExp(cursor), `${cursor} handle is missing`);
    }
  });

  it("captures the pointer and silences the iframe, or the drag dies mid-pull", () => {
    // Two halves of the same physical problem: the pointer outruns a 6px
    // handle instantly, and a cross-origin iframe swallows every pointermove
    // that crosses it. Capture keeps the stream; pointer-events none keeps
    // the frame from eating it.
    assert.match(editor, /setPointerCapture\(event\.pointerId\)/);
    assert.match(editor, /style=\{resizeAxis \? \{ pointerEvents: "none" \} : undefined\}/);
    // Touch too — a handle that scrolls the pane instead of dragging is dead.
    assert.match(editor, /touchAction: "none"/);
  });

  it("the dragged size becomes the custom dimensions, through the ONE clamp", () => {
    assert.match(editor, /function resizeDevice\(width: number, height: number\) \{\n    const size = clampDeviceSize\(width, height\);\n    setDeviceState\(current => \(\{ \.\.\.current, customWidth: size\.width, customHeight: size\.height \}\)\)/);
    // The clamp itself, as maths: floors, ceilings, integers.
    assert.deepEqual(clampDeviceSize(10, 10), { width: DEVICE_MIN_WIDTH, height: DEVICE_MIN_HEIGHT });
    assert.deepEqual(clampDeviceSize(99_999, 99_999), { width: DEVICE_MAX_SIZE, height: DEVICE_MAX_SIZE });
    assert.deepEqual(clampDeviceSize(393.7, 852.2), { width: 394, height: 852 }, "CSS pixels are integers here");
  });

  it("divides drag deltas by zoom, so the handle stays glued at 50%", () => {
    assert.match(editor, /\(event\.clientX - drag\.x\) \/ zoom/);
    assert.match(editor, /\(event\.clientY - drag\.y\) \/ zoom/);
  });

  it("shows a live W×H readout while dragging", () => {
    assert.match(editor, /\{resizeAxis \? \([\s\S]{0,400}?\{viewport\.width\} × \{viewport\.height\}/);
  });

  it("the handles are keyboard-real: focusable separators, arrow-key nudges", () => {
    assert.match(editor, /aria-label="Drag to set the width"/);
    assert.match(editor, /aria-label="Drag to set the height"/);
    assert.match(editor, /aria-label="Drag to set the size"/);
    assert.match(editor, /event\.key === "ArrowLeft" && axis !== "y"/);
    assert.match(editor, /const step = event\.shiftKey \? 1 : 16/);
  });

  it("devicePresets.ts's drag claim stopped being a lie today", () => {
    // The comment promised "drag the canvas edges to any size" with no
    // consumer implementing it. Now it NAMES its consumer — and this file
    // holds the consumer to it (everything above).
    assert.match(presets, /PreviewFrame` in `src\/engines\/editor\/DevEditor\.tsx/);
  });
});

// ─── 4. Identity and persistence ─────────────────────────────────────────────

describe("resizing never reloads, and the device is remembered per project", () => {
  it("a preset switch, rotate, zoom or drag changes style values — never the iframe's key", () => {
    // The walkthrough pass proved the frame survives mode clicks by pinning
    // its key to `${frameKey}:${url}`. Sizing rides the same rule: no device
    // state may enter the key, or every preset switch re-runs the page and
    // the tag handshake with it.
    assert.match(editor, /key=\{`\$\{frameKey\}:\$\{url\}`\}/);
    assert.equal(/key=\{[^}]*(device|viewport|zoom)/.test(editor), false, "device state reached the iframe key");
  });

  it("persists per project — two projects, two devices, no bleed", () => {
    withLocalStorage(store => {
      const phone: DeviceState = { ...DEFAULT_DEVICE_STATE, deviceId: "iphone-14-pro", zoom: 0.75 };
      const wide: DeviceState = { ...DEFAULT_DEVICE_STATE, deviceId: "ultrawide" };
      saveDeviceState(phone, "proj_a");
      saveDeviceState(wide, "proj_b");
      saveDeviceState({ ...DEFAULT_DEVICE_STATE, deviceId: "ipad-air" }); // the module's own unscoped key
      assert.deepEqual(loadDeviceState("proj_a"), phone);
      assert.deepEqual(loadDeviceState("proj_b"), wide);
      assert.equal(loadDeviceState().deviceId, "ipad-air", "the unscoped key survives for EditorPage");
      assert.deepEqual(loadDeviceState("proj_never_seen"), DEFAULT_DEVICE_STATE);
      // The keys are namespaced, not merged.
      assert.deepEqual([...store.keys()].sort(),
        ["lk_editor_device_v1", "lk_editor_device_v1:proj_a", "lk_editor_device_v1:proj_b"]);
    });
  });

  it("a corrupt stored blob falls back to the default rather than throwing", () => {
    withLocalStorage(store => {
      store.set("lk_editor_device_v1:proj_bad", "{not json");
      assert.deepEqual(loadDeviceState("proj_bad"), DEFAULT_DEVICE_STATE);
    });
  });

  it("the editor scopes to the project it is in, and the portals door to :portal", () => {
    assert.match(editor, /const deviceScope = projectId \|\| "portal"/);
    assert.match(editor, /setDeviceState\(loadDeviceState\(deviceScope\)\)/);
    assert.match(editor, /saveDeviceState\(deviceState, deviceScope\)/);
  });

  it("never saves a scope it has not loaded — the Strict Mode overwrite trap", () => {
    // Load in one effect, save in another, and the save gated on the LOADED
    // scope matching the CURRENT scope. Without the gate, the mount's save
    // effect writes the default over the stored device before the load's
    // setState commits (React 19 Strict Mode runs both twice), and a project
    // switch would briefly save project A's device under project B's key.
    assert.match(editor, /setDeviceScopeReady\(deviceScope\)/);
    assert.match(editor, /if \(deviceScopeReady === deviceScope\) saveDeviceState\(deviceState, deviceScope\)/);
    assert.equal(/useState<DeviceState>\(\(\) => loadDeviceState/.test(editor), false,
      "reading localStorage in the initializer would desync the hydration");
  });
});
