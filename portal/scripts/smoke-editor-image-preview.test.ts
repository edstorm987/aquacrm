import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { before, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type FileTree = typeof import("../src/engines/editor/server/fileTree");
type GitHubSource = typeof import("../src/engines/editor/server/githubSource");

let fileTree: FileTree;
let githubSource: GitHubSource;

before(async () => {
  fileTree = await import("../src/engines/editor/server/fileTree");
  githubSource = await import("../src/engines/editor/server/githubSource");
});

describe("editor image previews", () => {
  it("classifies previewable images while keeping SVG editable as text", () => {
    for (const path of ["logo.png", "photo.JPG", "a/b/pic.jpeg", "anim.gif", "modern.webp", "icon.ico", "shot.avif"]) {
      const described = fileTree.describeFile(path, 1_000);
      assert.equal(described.kind, "image", `${path} should be shown as an image`);
      assert.equal(described.readable, true);
      assert.equal(described.editable, false);
    }
    assert.equal(fileTree.describeFile("diagram.svg", 1_000).kind, "text");
    assert.equal(fileTree.describeFile("diagram.svg", 1_000).editable, true);
    assert.equal(fileTree.imageContentType("photo.JPEG"), "image/jpeg");
    assert.equal(fileTree.imageContentType("icon.ico"), "image/x-icon");

    const oversized = fileTree.describeFile("huge.png", fileTree.MAX_IMAGE_PREVIEW_BYTES + 1);
    assert.equal(oversized.readable, false);
    assert.match(oversized.reason ?? "", /too large to preview/i);
  });

  it("turns GitHub base64 into the same bounded data-URL contract as local files", async () => {
    const bytes = Buffer.from("preview bytes");
    const fetchImpl = (async () => new Response(JSON.stringify({
      content: bytes.toString("base64"),
      encoding: "base64",
      size: bytes.length,
    }), { status: 200 })) as typeof fetch;

    const file = await githubSource.readRepoFile(
      { repository: "owner/site", ref: "main", token: "token", fetchImpl },
      "assets/logo.png",
    );
    assert.equal(file.kind, "image");
    assert.equal(file.readable, true);
    assert.equal(file.editable, false);
    assert.equal(file.dataUrl, `data:image/png;base64,${bytes.toString("base64")}`);
    assert.equal(file.contents, undefined);
  });

  it("does not embed an oversized GitHub image", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      content: "aaaa",
      encoding: "base64",
      size: fileTree.MAX_IMAGE_PREVIEW_BYTES + 1,
    }), { status: 200 })) as typeof fetch;

    const file = await githubSource.readRepoFile(
      { repository: "owner/site", ref: "main", token: "token", fetchImpl },
      "assets/huge.png",
    );
    assert.equal(file.kind, "image");
    assert.equal(file.readable, false);
    assert.equal(file.dataUrl, undefined);
    assert.match(file.reason ?? "", /too large to preview/i);
  });

  it("carries image data through the route into the existing canvas renderer", () => {
    const root = process.cwd();
    const route = readFileSync(join(root, "src/app/api/portal/site-editor/files/route.ts"), "utf8");
    const canvas = readFileSync(join(root, "src/components/editing/EditorCodeCanvas.tsx"), "utf8");
    assert.match(route, /imageContentType\(requested\)/);
    assert.match(route, /dataUrl:/);
    assert.match(canvas, /file\?\.kind === "image" && file\.dataUrl/);
    assert.match(canvas, /<img src=\{file\.dataUrl\}/);
  });
});
