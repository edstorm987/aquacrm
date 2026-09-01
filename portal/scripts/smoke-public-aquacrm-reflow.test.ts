import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const styles = readFileSync(join(process.cwd(), "public/aquacrm-site/styles.css"), "utf8");

test("the project-library CTA can wrap at the 200% mobile zoom viewport", () => {
  const narrowViewportStart = styles.indexOf("@media (max-width: 420px)");
  const narrowViewportRules = styles.slice(
    narrowViewportStart,
    styles.indexOf(".cookie-reopen", narrowViewportStart),
  );

  assert.match(narrowViewportRules, /\.project-invite \.primary\s*\{\s*white-space:\s*normal;\s*\}/);
});
