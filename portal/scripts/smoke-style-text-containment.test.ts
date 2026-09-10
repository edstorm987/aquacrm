import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const STYLE_TEXT_SINKS = [
  "src/components/chrome/ThemeInjector.tsx",
  "src/components/chrome/UserCssInjector.tsx",
  "src/engines/editor/elements/BlockRenderer.tsx",
  "src/built-ins/modules/website-editor/src/components/storefront/EditorThemeInjector.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/NavbarBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/MarqueeBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/ButtonBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/FooterBlock.tsx",
] as const;

test("every live portal style-text sink avoids raw HTML insertion", () => {
  for (const relativePath of STYLE_TEXT_SINKS) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /<style\b[^>]*dangerouslySetInnerHTML/,
      `${relativePath} must use React style text children`,
    );
  }
});
