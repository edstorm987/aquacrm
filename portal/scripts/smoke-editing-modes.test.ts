import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EDITING_MODES, editingMode, modeAllowsTab, tabForMode,
} from "../src/engines/editor/editing/modes.ts";

describe("choosing how deep to go", () => {
  it("shows somebody fixing a typo only the words", () => {
    // Six tabs in front of somebody who came to change one sentence is noise,
    // and they cannot accidentally rearrange the page.
    assert.deepEqual(editingMode("simple").tabs, ["content"]);
  });

  it("gives the visual mode everything except code", () => {
    const visual = editingMode("visual");
    assert.ok(visual.tabs.includes("builder"));
    assert.ok(visual.tabs.includes("brand"));
    assert.equal(visual.tabs.includes("code"), false);
    assert.equal(visual.tabs.includes("repository"), false);
  });

  it("gives the developer mode the custom code and the repository", () => {
    // Two different things: the sandboxed portal component, and the site's
    // actual source.
    const dev = editingMode("developer");
    assert.ok(dev.tabs.includes("code"));
    assert.ok(dev.tabs.includes("repository"));
  });

  it("defaults to the visual mode, not the deepest", () => {
    // A first-time opener should meet a designer's tool, not a developer's.
    assert.equal(editingMode(undefined).id, "visual");
    assert.equal(editingMode("nonsense").id, "visual");
  });

  it("describes each mode in the words of somebody choosing it", () => {
    for (const mode of EDITING_MODES) {
      assert.ok(mode.summary.trim(), `${mode.id} has no summary`);
      assert.ok(mode.tabs.length, `${mode.id} offers no tabs`);
    }
  });
});

describe("switching mode without landing nowhere", () => {
  it("keeps the current tab when the new mode still has it", () => {
    assert.equal(tabForMode("visual", "brand"), "brand");
  });

  it("moves to the mode's first tab when the current one is gone", () => {
    // Switching from Developer to "Just the words" while sitting on code must
    // land somewhere real rather than on a blank panel.
    assert.equal(tabForMode("simple", "code"), "content");
    assert.equal(tabForMode("visual", "repository"), "builder");
  });

  it("answers whether a tab is offered", () => {
    assert.equal(modeAllowsTab("simple", "builder"), false);
    assert.equal(modeAllowsTab("developer", "repository"), true);
  });
});

describe("a tenant with no brand kit still renders", () => {
  // A brand kit is decoration. Missing decoration must not take down a
  // client's portal — and it did: a client created without one crashed
  // ThemeInjector on `brand.primaryColor`, failing the whole page render
  // rather than the styling. An unbranded portal is cosmetic; a portal that
  // will not load is the client ringing up.
  it("falls back rather than throwing when there is no brand at all", async () => {
    const { brandToCss, brandToStyleString } = await import("../src/lib/chrome/brandKit.ts");
    for (const brand of [undefined, null, {} as never]) {
      const css = brandToCss(brand as never);
      assert.ok(css.vars["--brand-primary"], "a primary colour must always be emitted");
      assert.doesNotThrow(() => brandToStyleString(brand as never));
    }
  });

  it("still honours a brand when there is one", async () => {
    const { brandToCss } = await import("../src/lib/chrome/brandKit.ts");
    const css = brandToCss({ primaryColor: "#FF6B35", accentColor: "#123456" } as never);
    assert.equal(css.vars["--brand-primary"], "#FF6B35");
    assert.equal(css.vars["--brand-accent"], "#123456");
  });

  it("emits nothing for fields the brand does not set", async () => {
    // Consumers fall back to the bundled theme at the CSS layer, so
    // fabricating values here would override defaults nobody chose.
    const { brandToCss } = await import("../src/lib/chrome/brandKit.ts");
    const css = brandToCss({ primaryColor: "#FF6B35" } as never);
    assert.equal(css.vars["--brand-accent"], undefined);
    assert.equal(css.vars["--brand-radius"], undefined);
  });
});
