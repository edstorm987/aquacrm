import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeSource, repoRelativePath } from "../src/lib/editing/elementSource.ts";

describe("turning a compiler path into a repository path", () => {
  it("finds the repository root inside an absolute path", () => {
    assert.equal(
      repoRelativePath("/Users/eds/Projects/site/src/app/page.tsx"),
      "src/app/page.tsx",
    );
  });

  it("matches from the right, so a project inside a folder of the same name still resolves", () => {
    // A hard-coded prefix breaks the moment the project moves or somebody
    // else runs it; the path a build records depends on where it was built.
    assert.equal(
      repoRelativePath("/home/ci/src/checkout/src/components/Hero.tsx"),
      "src/components/Hero.tsx",
    );
  });

  it("handles a path that is already relative", () => {
    assert.equal(repoRelativePath("src/app/page.tsx"), "src/app/page.tsx");
  });

  it("copes with Windows separators", () => {
    assert.equal(repoRelativePath("C:\\work\\site\\src\\app\\page.tsx"), "src/app/page.tsx");
  });

  it("returns nothing rather than guessing when no root is recognisable", () => {
    assert.equal(repoRelativePath("/tmp/scratch/thing.tsx"), null);
  });
});

describe("describing where an element came from", () => {
  it("reads as a file and line", () => {
    assert.equal(
      describeSource({ fileName: "/x/src/app/page.tsx", lineNumber: 42, columnNumber: 6 }),
      "src/app/page.tsx:42",
    );
  });

  it("says so plainly when React recorded nothing", () => {
    // Production strips the debug source. Saying so beats guessing — a wrong
    // file is worse than no file.
    assert.match(describeSource(null), /No source recorded/);
  });
});

describe("reading a React 19 debug stack", () => {
  // React 19 removed `_debugSource`; the location now lives in `_debugStack`,
  // an Error captured at the JSX call site.
  it("recovers the file and line from a Next dev stack", async () => {
    const { sourceFromDebugStack } = await import("../src/lib/editing/elementSource.ts");
    const stack = [
      "Error: react-stack-top-frame",
      "    at fakeJSXCallSite (webpack-internal:///(app-pages-browser)/./node_modules/next/dist/compiled/react-dom/x.js:3519:19)",
      "    at PageIntro (about://React/Server/webpack-internal:///(rsc)/./src/app/portal/customer/_CustomerPortalViews.tsx?97:189:96)",
    ].join("\n");
    assert.deepEqual(sourceFromDebugStack(stack), {
      fileName: "src/app/portal/customer/_CustomerPortalViews.tsx",
      lineNumber: 189,
      columnNumber: 96,
    });
  });

  it("skips frames into node_modules — machinery, not the component", async () => {
    const { sourceFromDebugStack } = await import("../src/lib/editing/elementSource.ts");
    const stack = "    at x (webpack-internal:///./node_modules/react/index.js:10:5)";
    assert.equal(sourceFromDebugStack(stack), null);
  });

  it("returns nothing for an empty or unrecognisable stack", async () => {
    const { sourceFromDebugStack } = await import("../src/lib/editing/elementSource.ts");
    assert.equal(sourceFromDebugStack(undefined), null);
    assert.equal(sourceFromDebugStack("Error\n    at <anonymous>"), null);
  });
});
