// Smoke — the wifi throttle control (SOURCE-SHAPE pins).
// Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server'
// npx tsx --test scripts/*.test.ts
//
// § `NetworkThrottleControl` is a client component, and this suite runs under
// `--conditions react-server`, so the pins here are against the source text —
// the same approach as smoke-aqua-editor-ai-ui.test.ts. The BEHAVIOUR (real
// latency, pacing, offline, restore) is proved by executing the tag itself in
// scripts/smoke-aqua-tag-throttle.test.ts; this file pins what the control
// SAYS and how it is allowed to say it:
//   • the honesty sentence — script requests only, page loads are DevTools' job
//   • the DevTools-shaped preset numbers Ed asked for
//   • protocol discipline — the builder, never a retyped message literal
//   • truth rendering — amber comes from the tag's ack, never from our request
//   • the editor's vocabulary — dark, border-white/10, focus-visible, no --dt-*

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(__dirname, "..");
const SOURCE = readFileSync(join(ROOT, "src/components/editing/NetworkThrottleControl.tsx"), "utf8");
/** The source with comments stripped, for pins that must match CODE, not prose. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the honesty sentence is present, complete, and not negotiable", () => {
  // The exported constant, so the modal and this pin can never drift apart.
  assert.match(SOURCE, /export const THROTTLE_SCOPE_NOTE/);
  // What it throttles…
  assert.match(SOURCE, /Throttles what this page's scripts request/);
  assert.match(SOURCE, /fetch and XHR get real latency, paced responses and offline failures/);
  // …and what it can never throttle, said out loud.
  assert.match(SOURCE, /The page load itself \(document, stylesheets, images\) still arrives at full speed/);
  assert.match(SOURCE, /only browser DevTools can slow those/);
  // The note is rendered in the panel, not stashed behind a tooltip.
  assert.match(SOURCE, /\{THROTTLE_SCOPE_NOTE\}/);
});

test("nothing here fakes a slow page load", () => {
  // The control talks to the tag; it must never reach for the preview frame
  // or dress the pane up to look slow.
  assert.ok(!CODE.includes("iframe"), "the control must not touch the preview iframe");
  assert.ok(!CODE.includes("animate-"), "no fake loading animation");
  assert.ok(!CODE.includes("transition-delay"), "no CSS-faked slowness");
});

test("the presets are the DevTools-shaped speeds Ed asked for", () => {
  const presets = [
    { id: "offline", offline: true },
    { id: "slow-3g", latencyMs: 2000, downKbps: 400 },
    { id: "fast-3g", latencyMs: 560, downKbps: 1500 },
    { id: "4g", latencyMs: 170, downKbps: 9000 },
  ];
  for (const preset of presets) {
    assert.match(SOURCE, new RegExp(`id: "${preset.id}"`), `the ${preset.id} preset exists`);
  }
  assert.match(SOURCE, /latencyMs: 2000, downKbps: 400, offline: false/, "Slow 3G is 2000ms · 400kbps");
  assert.match(SOURCE, /latencyMs: 560, downKbps: 1500, offline: false/, "Fast 3G is 560ms · 1500kbps");
  assert.match(SOURCE, /latencyMs: 170, downKbps: 9000, offline: false/, "4G is 170ms · 9000kbps");
  assert.match(SOURCE, /latencyMs: 0, downKbps: 0, offline: true/, "Offline is a real refusal, not a very slow speed");
  // Custom inputs exist alongside the presets, and "back to normal" is a
  // control of its own, not the absence of a choice.
  assert.match(SOURCE, /Latency in milliseconds/);
  assert.match(SOURCE, /Download speed in kilobits per second/);
  assert.match(SOURCE, /Back to normal/);
});

test("protocol discipline — the builder and the shared validator, never a retyped literal", () => {
  assert.match(CODE, /aquaTagThrottle\(/, "messages are built by the bridge's builder");
  assert.match(CODE, /parseAquaTagThrottleProfile\(/, "custom input goes through the same gate the parser uses");
  assert.match(CODE, /from "@\/engines\/editor\/editing\/aquaTagBridge"/);
  assert.ok(
    !CODE.includes('"aqua-explorer:'),
    "a message name retyped as a literal is exactly how the last protocol drift happened",
  );
});

test("amber is the tag's word, not ours", () => {
  // The icon state derives from the `active` prop — the profile the tag
  // CONFIRMED — and the component has no way to invent one locally.
  assert.match(CODE, /const throttled = active !== null;/);
  assert.ok(!CODE.includes("setActive"), "the component must not manufacture its own confirmation");
  // A request nobody answers becomes words, not an eternal spinner.
  assert.match(SOURCE, /older cached build/);
  assert.match(CODE, /CONFIRM_TIMEOUT_MS/);
  // Wifi when normal, WifiOff for a confirmed offline profile.
  assert.match(CODE, /import \{ Wifi, WifiOff, X \} from "lucide-react";/);
  assert.match(CODE, /active\?\.offline \? WifiOff : Wifi/);
});

test("the control wears the editor's vocabulary", () => {
  assert.match(CODE, /"use client";/);
  assert.match(CODE, /border-white\/10/);
  assert.match(CODE, /bg-\[#171a17\]/, "the panel sits on the editor's dark ground, same as AddMenu");
  assert.match(CODE, /size-8/, "the icon matches its cluster siblings");
  assert.ok(CODE.includes("focus-visible:"), "keyboard focus is visible");
  assert.ok(!CODE.includes("--dt-"), "no design-token variables from the other skin");
  // Every interactive element carries a focus-visible treatment.
  const controls = (CODE.match(/<(?:button|input)\b/g) ?? []).length;
  const focused = (CODE.match(/focus-visible:|focus-within:/g) ?? []).length;
  assert.ok(
    focused >= controls,
    `${controls} interactive controls but only ${focused} focus treatments — a keyboard user loses their place`,
  );
});

test("the mount contract DevEditor needs is exported", () => {
  // The exact three props the brief shaped, so the held-back DevEditor mount
  // can wire `sendToTag` + confirmed state + wanted state straight in.
  assert.match(SOURCE, /send: \(payload: object\) => boolean;/);
  assert.match(SOURCE, /active: AquaTagThrottleProfile \| null;/);
  assert.match(SOURCE, /onChange: \(wanted: AquaTagThrottleProfile \| null\) => void;/);
  assert.match(SOURCE, /export function NetworkThrottleControl\(/);
  assert.match(SOURCE, /export function throttleProfileLabel\(/);
  assert.match(SOURCE, /export const THROTTLE_PRESETS/);
});
