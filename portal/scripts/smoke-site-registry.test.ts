import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatSourceStamp, parseSourceStamp } from "../src/lib/server/siteEditor/sourceStamp.ts";
import {
  classifyText, hashLine, isMappableFile, isStale, mapFile, reportResolution, resolve,
  type SiteRegistry,
} from "../src/lib/server/siteEditor/registry.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("reading a source stamp", () => {
  it("reads a file, line and column", () => {
    assert.deepEqual(parseSourceStamp("app/(site)/page.tsx:42:6"),
      { file: "app/(site)/page.tsx", line: 42, column: 6 });
  });

  it("takes line and column from the end, so a path with a colon still reads", () => {
    // A naive split on ":" would mangle a Windows path or a drive letter and
    // point the editor at a file that does not exist.
    assert.deepEqual(parseSourceStamp("C:/site/app/page.tsx:10:2"),
      { file: "C:/site/app/page.tsx", line: 10, column: 2 });
  });

  it("refuses anything it cannot read exactly", () => {
    // A stamp that has to be repaired is a stamp pointing somewhere unknown,
    // and writing to a guessed line is worse than refusing.
    for (const bad of ["app/page.tsx", "app/page.tsx:0:1", "app/page.tsx:x:1", "", null, undefined]) {
      assert.equal(parseSourceStamp(bad as string), null, `accepted "${bad}"`);
    }
  });

  it("refuses a path trying to climb out of the repo", () => {
    assert.equal(parseSourceStamp("../../etc/passwd:1:0"), null);
  });

  it("round-trips", () => {
    const location = { file: "app/page.tsx", line: 3, column: 1 };
    assert.deepEqual(parseSourceStamp(formatSourceStamp(location)), location);
  });
});

describe("deciding what can be edited in place", () => {
  // Getting this wrong optimistically is the expensive direction: an inline
  // edit on a value that comes from a database appears to work, commits, and
  // reverts on the next render with no error anywhere.
  it("treats text written in the source as editable", () => {
    assert.deepEqual(classifyText("  <h1>We build things</h1>"),
      { kind: "literal", text: "<h1>We build things</h1>" });
  });

  it("treats anything interpolated as dynamic", () => {
    for (const line of ["<h1>{title}</h1>", "<p>{props.name}</p>", "`${count} items`", "items.map(item => (" ]) {
      assert.equal(classifyText(line).kind, "dynamic", `${line} was offered as editable text`);
    }
  });

  it("treats a blank line as dynamic rather than editable", () => {
    assert.equal(classifyText("   ").kind, "dynamic");
  });
});

describe("choosing which files to map", () => {
  it("maps the files a page is built from", () => {
    for (const file of ["app/page.tsx", "components/Hero.jsx", "index.html", "content/about.mdx"]) {
      assert.ok(isMappableFile(file), `${file} should be mapped`);
    }
  });

  it("skips generated and vendored trees", () => {
    for (const file of ["node_modules/react/index.js", ".next/server/page.tsx", "dist/index.html"]) {
      assert.ok(!isMappableFile(file), `${file} should not be mapped`);
    }
  });
});

describe("mapping real source", () => {
  // Mapped against this repository's own files, which are the same shape a
  // client site is.
  const file = "src/components/attention/TaskChecklist.tsx";
  const contents = readFileSync(join(ROOT, file), "utf-8");
  const nodes = mapFile(file, contents);

  it("produces one node per line", () => {
    assert.equal(nodes.length, contents.split(/\r?\n/).length);
  });

  it("keys every node the way the DOM stamp will arrive", () => {
    assert.ok(nodes.every(node => parseSourceStamp(node.key)?.file === file));
  });

  it("records the indentation as the column", () => {
    const indented = nodes.find(node => node.text?.startsWith("<section"));
    assert.ok(indented && indented.column > 0, "indentation was not recorded");
  });

  it("hashes each line so a stale patch can be rejected", () => {
    const first = nodes.find(node => node.text);
    assert.ok(first?.hash);
    assert.notEqual(first?.hash, hashLine("something else"));
  });

  it("finds real editable text in a real component", () => {
    const literals = nodes.filter(node => node.kind === "literal");
    assert.ok(literals.length > 20, `only ${literals.length} literal lines found`);
  });
});

describe("resolving a stamped element", () => {
  const registry: SiteRegistry = {
    repository: "milesymedia/site", ref: "main", commitSha: "abc123", mappedAt: 0,
    files: ["app/page.tsx"],
    nodes: Object.fromEntries(mapFile("app/page.tsx", "<main>\n  <h1>We build things</h1>\n</main>")
      .map(node => [node.key, node])),
    skipped: [],
  };

  it("resolves an element to its line", () => {
    const node = resolve(registry, { file: "app/page.tsx", line: 2, column: 2 });
    assert.equal(node?.text, "<h1>We build things</h1>");
  });

  it("resolves when the stamp's column differs from the line's indent", () => {
    // The stamp records where the element began; the registry records where
    // the line's content began. Requiring both to agree would fail to resolve
    // most of a real page.
    const node = resolve(registry, { file: "app/page.tsx", line: 2, column: 6 });
    assert.equal(node?.line, 2);
  });

  it("returns nothing for a file it never mapped", () => {
    assert.equal(resolve(registry, { file: "app/other.tsx", line: 1, column: 0 }), null);
  });

  it("knows when it no longer describes the repository", () => {
    // The commit is part of the registry, not metadata about it — this is what
    // stops the editor writing over somebody else's change.
    assert.equal(isStale(registry, "abc123"), false);
    assert.equal(isStale(registry, "def456"), true);
  });

  it("reports how much of a page it can account for", () => {
    const report = reportResolution(registry, [
      { file: "app/page.tsx", line: 2, column: 2 },
      { file: "app/page.tsx", line: 9, column: 0 },
    ]);
    assert.equal(report.resolved, 1);
    assert.deepEqual(report.unresolved, ["app/page.tsx:9:0"]);
  });
});
