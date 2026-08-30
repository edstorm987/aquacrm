// Custom CSS — the checks that make "let people style it" safe.
//
// Ed, 2026-08-29: *"I'd like to add a CSS injection into settings, so if users
// want to apply custom CSS styling for whatever reason we can allow for that,
// why not."*
//
// Why not is worth answering precisely, because CSS looks harmless and is not:
//
//   • `url(https://evil/?v=…)` on an attribute selector is a NETWORK REQUEST
//     carrying whatever the selector matched. That is data exfiltration with no
//     JavaScript involved, and it is the reason remote URLs are refused.
//   • `@import` fetches a stylesheet nobody reviewed, so today's safe theme is
//     tomorrow's payload.
//   • And a person can hide their own way out. The reset has to survive the CSS
//     that broke things.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  MAX_CUSTOM_CSS_LENGTH, checkCustomCss, customCssForInjection,
} from "../src/lib/chrome/customCss";

describe("what is allowed", () => {
  it("accepts ordinary styling", () => {
    assert.equal(checkCustomCss(".mm-sidebar-link { font-weight: 600; }").ok, true);
    assert.equal(checkCustomCss(":root { --nav-tone: #ff8800; }").ok, true);
  });

  it("accepts a data: URI, which cannot phone home", () => {
    assert.equal(checkCustomCss("body { background: url(data:image/gif;base64,R0lGOD); }").ok, true);
  });

  it("accepts empty", () => {
    assert.equal(checkCustomCss("").ok, true);
    assert.equal(customCssForInjection(""), "");
    assert.equal(customCssForInjection(undefined), "");
  });
});

describe("what is refused, and why", () => {
  it("refuses remote url() — the exfiltration route", () => {
    for (const css of [
      "a { background: url(https://evil.example/x.png); }",
      "a { background: url('http://evil.example/x.png'); }",
      "a { background: url(//evil.example/x.png); }",
      'a { background: url( "https://evil.example/x" ); }',
    ]) {
      const result = checkCustomCss(css);
      assert.equal(result.ok, false, `should refuse: ${css}`);
      assert.match(result.reason ?? "", /carry data off/);
    }
  });

  it("refuses @import", () => {
    const result = checkCustomCss('@import url(data:text/css,body{color:red});');
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /cannot see/);
  });

  it("refuses the legacy code-execution hooks", () => {
    for (const css of [
      "a { width: expression(alert(1)); }",
      "a { background: javascript:alert(1); }",
      "a { behavior: url(#default#time2); }",
    ]) {
      assert.equal(checkCustomCss(css).ok, false, `should refuse: ${css}`);
    }
  });

  it("refuses anything over the length cap", () => {
    const result = checkCustomCss("a{}".repeat(MAX_CUSTOM_CSS_LENGTH));
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Too long/);
  });
});

describe("a refused stylesheet is never partly applied", () => {
  it("returns nothing at all rather than the safe half", () => {
    // Half a theme is worse than none — it looks like a bug in the app rather
    // than a rejected setting.
    assert.equal(customCssForInjection("a { background: url(https://evil.example/x); } b { color: red; }"), "");
  });

  it("returns the CSS untouched when it passes", () => {
    const css = ".x { color: red; }";
    assert.equal(customCssForInjection(css), css);
  });
});

describe("the rules are written where they will be read", () => {
  const source = readFileSync("src/lib/chrome/customCss.ts", "utf8");

  it("says the stylesheet is per person, never per agency", () => {
    // One person breaking their own chrome is a preference. Breaking everyone's
    // is an outage that cannot be undone from inside the app.
    assert.match(source, /Per person, never per agency/);
  });

  it("names the escape hatch", () => {
    // Somebody can hide their own Settings link; the way out must not depend on
    // the CSS being sane.
    assert.match(source, /nocss=1/);
  });
});
