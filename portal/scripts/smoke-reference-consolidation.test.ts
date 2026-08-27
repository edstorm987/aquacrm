import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const referenceDir = join(root, "docs", "reference");
const volumes = [
  "app.md",
  "built-ins.md",
  "components.md",
  "engines.md",
  "lib.md",
  "server.md",
  "scripts.md",
  "misc.md",
];

describe("consolidated generated source reference", () => {
  it("keeps thousands of source entries in eight volumes instead of per-file stubs", () => {
    assert.equal(existsSync(join(referenceDir, "files")), false);
    const markdown = readdirSync(referenceDir).filter(name => name.endsWith(".md"));
    assert.ok(markdown.length <= 12, `reference directory expanded to ${markdown.length} Markdown files`);

    for (const volume of volumes) {
      const source = readFileSync(join(referenceDir, volume), "utf8");
      assert.match(source, /^# Consolidated source reference/m, `${volume} is not a consolidated volume`);
      assert.match(source, /\*\*Depends on(?: \(\d+\))?:\*\*/);
      assert.match(source, /\*\*Used by(?: \(\d+\))?:\*\*/);
    }
  });

  it("links every indexed source path to a stable volume anchor", () => {
    const index = readFileSync(join(referenceDir, "files-index.md"), "utf8");
    const rows = [...index.matchAll(/^- \[`([^`]+)`\]\(([^)]+)\)/gm)];
    assert.ok(rows.length >= 2_000, `only ${rows.length} source entries were indexed`);
    assert.doesNotMatch(index, /\.\/files\//);
    for (const [, sourcePath, target] of rows) {
      assert.match(target, /^(?:app|built-ins|components|engines|lib|server|scripts|misc)\.md#file-/,
        `${sourcePath} points outside the consolidated volumes`);
    }
  });

  it("keeps the old generator command as a compatibility entry point", () => {
    const compatibility = readFileSync(join(root, "scripts", "generate-file-docs.mjs"), "utf8");
    assert.match(compatibility, /generate-symbol-reference\.mjs/);
    assert.doesNotMatch(compatibility, /docs\/reference\/files\//);
  });
});
