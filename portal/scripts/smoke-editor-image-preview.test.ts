// DEV EDITOR ENGINE — images preview instead of dead-ending.
//
// A binary file used to be a hard stop: "This is not a text file." Pictures
// are binary but perfectly showable, so the read path now returns a `data:`
// preview for images (size-capped, both sources) and the pane renders it.
// What this pins:
//
//  1. Image detection and the MIME map — and that `.svg` stays TEXT (it is
//     editable source, not an opaque blob).
//  2. `readRepoFile` builds a preview from GitHub's base64 for an image,
//     returns none for an oversized one, and never marks an image editable.
//  3. The files route and CodeWorkspace carry the preview through — the FS
//     branch answers with the same shape as the GitHub branch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it, test } from "node:test";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

type FileTree = typeof import("../src/engines/editor/server/fileTree");
type GitHubSource = typeof import("../src/engines/editor/server/githubSource");

let fileTree: FileTree;
let githubSource: GitHubSource;

before(async () => {
  fileTree = await import("../src/engines/editor/server/fileTree");
  githubSource = await import("../src/engines/editor/server/githubSource");
});

test("image paths are detected, mapped to MIME types, and svg stays text", () => {
  for (const path of ["logo.png", "photo.JPG", "a/b/pic.jpeg", "anim.gif", "modern.webp", "icon.ico", "shot.avif"]) {
    assert.equal(fileTree.isImagePath(path), true, `${path} should be an image`);
  }
  for (const path of ["diagram.svg", "index.tsx", "readme.md", "font.woff2", "archive.zip"]) {
    assert.equal(fileTree.isImagePath(path), false, `${path} should not preview as an image`);
  }
  // `.svg` is editable text — turning it into an opaque preview would take
  // away the edit path it already has.
  assert.equal(fileTree.describeFile("diagram.svg", 100).editable, true);

  assert.equal(fileTree.imageContentType("logo.png"), "image/png");
  assert.equal(fileTree.imageContentType("photo.JPEG"), "image/jpeg");
  assert.equal(fileTree.imageContentType("icon.ico"), "image/x-icon");

  const described = fileTree.describeFile("logo.png", 1_000);
  assert.equal(described.editable, false);
  assert.match(described.reason ?? "", /shown as a preview/i);

  // The reason must match what actually happens: an image over the cap gets
  // "too large", never "shown as a preview" over an empty pane.
  const oversized = fileTree.describeFile("huge.png", fileTree.MAX_PREVIEW_BYTES + 1);
  assert.match(oversized.reason ?? "", /too large to preview/i);
});

test("readRepoFile turns GitHub's base64 into a data-URL preview for images", async () => {
  const pngBytes = Buffer.from("not-really-a-png-but-bytes");
  const fetchImpl = (async () => new Response(JSON.stringify({
    content: pngBytes.toString("base64"),
    encoding: "base64",
    size: pngBytes.length,
  }), { status: 200 })) as typeof fetch;

  const file = await githubSource.readRepoFile(
    { repository: "owner/site", ref: "main", token: "t", fetchImpl },
    "assets/logo.png",
  );
  assert.equal(file.editable, false, "an image never becomes editable text");
  assert.equal(file.preview, `data:image/png;base64,${pngBytes.toString("base64")}`);
  assert.equal(file.contents, undefined, "no text contents for an image");
});

test("an oversized image gets its refusal, not a preview", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({
    content: "aaaa",
    encoding: "base64",
    size: 5 * 1024 * 1024,
  }), { status: 200 })) as typeof fetch;

  const file = await githubSource.readRepoFile(
    { repository: "owner/site", ref: "main", token: "t", fetchImpl },
    "assets/huge.png",
  );
  assert.equal(file.editable, false);
  assert.equal(file.preview, undefined);
});

describe("the route and the pane carry the preview through", () => {
  it("the files route FS branch previews images with the same shape", () => {
    const route = readFileSync(join(ROOT, "src", "app", "api", "portal", "site-editor", "files", "route.ts"), "utf8");
    assert.match(route, /isImagePath\(requested\)/);
    assert.match(route, /MAX_PREVIEW_BYTES/);
    assert.match(route, /imageContentType\(requested\)/);
  });

  it("CodeWorkspace renders the preview image instead of the lock message", () => {
    const workspace = readFileSync(join(ROOT, "src", "app", "portal", "agency", "development", "code", "_CodeWorkspace.tsx"), "utf8");
    assert.match(workspace, /file\?\.preview/);
    assert.match(workspace, /<img\s/);
  });
});
