// Default styling must be a floor, not a ceiling.
//
// ── What was measured on 2026-08-28 ──────────────────────────────────────
//
// `globals.css` styles portal and plugin controls with plain, unlayered rules.
// Tailwind v4 emits its utilities inside `@layer utilities`, and **unlayered CSS
// beats any layered rule regardless of specificity**. So three defaults were
// silently overriding every author who wrote a utility:
//
//   • `.mm-portal-root :is(input, select, textarea)…` → `min-height: 2.5rem`,
//     applying to the WHOLE portal. The app writes `min-h-11` (44px) on form
//     controls in 146 places and **every one of them on an input, select or
//     textarea was served 40px**.
//   • `.plugin-page-shell… button` and `.plugin-page-shell… input, select,
//     textarea` → the same, plus radius, padding and font-size, so a plugin
//     page's `rounded-lg` (8px) rendered as 6px.
//
// Measured in the browser on the journey board: `min-h-11` computed to 40px
// there and 44px on a bare probe elsewhere on the same page. After the fix,
// zero controls on that page are under 44px, and the authored `rounded-lg`
// survives at 8px.
//
// ── Why the values did not all change ────────────────────────────────────
//
// The portal-wide default is still 2.5rem ON PURPOSE. Only its LAYER moved, so
// nothing that never asked for a height shifts by a pixel — a control that says
// `min-h-11` simply gets what it asked for now. Raising that default across
// every form in the app is a separate visual decision.
//
// The two plugin-scoped rules DID go to 2.75rem, because plugin pages that ship
// no styling of their own have no other way to reach the 44x44 target the
// browser-acceptance checklist asks for.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const CSS = readFileSync("src/app/globals.css", "utf8");

/**
 * Is this selector's block inside an `@layer` at-rule?
 *
 * Scans from the top of the file tracking open blocks, skipping comments and
 * quoted strings — a stylesheet this size has braces inside both, and a scanner
 * that counts them lands on the wrong answer with total confidence. The first
 * version of this helper did exactly that.
 */
function layerContaining(needle: string): string | null {
  const index = CSS.indexOf(needle);
  assert.notEqual(index, -1, `expected to find ${needle} in globals.css`);

  const stack: Array<string | null> = [];
  let headStart = 0;      // where the current block header began
  let i = 0;
  while (i < index) {
    const two = CSS.slice(i, i + 2);
    if (two === "/*") {                       // comment
      const close = CSS.indexOf("*/", i + 2);
      i = close === -1 ? CSS.length : close + 2;
      continue;
    }
    const char = CSS[i];
    if (char === '"' || char === "'") {        // string
      let j = i + 1;
      while (j < CSS.length && CSS[j] !== char) j += (CSS[j] === "\\" ? 2 : 1);
      i = j + 1;
      continue;
    }
    if (char === "{") {
      const head = CSS.slice(headStart, i);
      const at = /@layer\s+([A-Za-z0-9_-]*)\s*$/.exec(head.trim());
      stack.push(at ? (at[1] || "(anonymous)") : null);
      headStart = i + 1;
    } else if (char === "}") {
      stack.pop();
      headStart = i + 1;
    } else if (char === ";") {
      headStart = i + 1;
    }
    i += 1;
  }
  const layered = stack.filter((frame): frame is string => frame !== null);
  return layered.length > 0 ? layered[layered.length - 1]! : null;
}

describe("control defaults do not override the utilities that ask for a size", () => {
  it("the portal-wide form-control height is layered", () => {
    const layer = layerContaining('.mm-portal-root :is(input, select, textarea):not([type="checkbox"])');
    assert.equal(
      layer,
      "components",
      "This rule sets a min-height for every input, select and textarea in the portal. Unlayered, it "
      + "beats Tailwind's `@layer utilities` no matter the specificity, so all 146 `min-h-11` usages "
      + "on form controls silently render at 40px instead of 44px.",
    );
  });

  it("…and its value is deliberately unchanged, so nothing else moved", () => {
    const index = CSS.indexOf('.mm-portal-root :is(input, select, textarea):not([type="checkbox"])');
    const block = CSS.slice(index, CSS.indexOf("}", index));
    assert.match(block, /min-height:\s*2\.5rem/,
      "only the LAYER was meant to change here — raising this default is an app-wide visual decision "
      + "that has not been taken. If it is taken deliberately, update this test and say so.");
  });

  it("plugin-page buttons are layered and clear 44px", () => {
    const needle = '.plugin-page-shell:not([data-plugin-id="website-editor"]) button';
    assert.equal(layerContaining(needle), "components", "a default must not override a plugin author");
    const block = CSS.slice(CSS.indexOf(needle), CSS.indexOf("}", CSS.indexOf(needle)));
    assert.match(block, /min-height:\s*2\.75rem/,
      "plugin pages that ship no styling still have to reach the 44x44 target");
  });

  it("plugin-page form controls are layered and clear 44px", () => {
    const needle = '.plugin-page-shell:not([data-plugin-id="website-editor"]) input,';
    assert.equal(layerContaining(needle), "components");
    const block = CSS.slice(CSS.indexOf(needle), CSS.indexOf("}", CSS.indexOf(needle)));
    assert.match(block, /min-height:\s*2\.75rem/);
  });

  it("the layer helper actually distinguishes layered from unlayered", () => {
    // Guards the guard. Without this, a helper that always returned
    // "components" would pass every assertion above.
    assert.equal(layerContaining("@import"), null, "top-level content must read as unlayered");
  });
});
