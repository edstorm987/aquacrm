import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CONSOLIDATED_AUTHORED_DOC_PATHS,
  consolidatedDevDocsIndex,
} from "../src/lib/server/dev/devDocsConsolidation";
import type { DevDocEntry, DevDocsIndex } from "../src/lib/server/dev/devDocs";

interface ManifestSource {
  path: string;
  volume: string;
  anchor: string;
  sha256: string;
  words: number;
  bytes: number;
}

interface Manifest {
  canonicalMarkdownCount: number;
  sources: ManifestSource[];
}

const manifest = JSON.parse(readFileSync("docs/consolidation-manifest.json", "utf8")) as Manifest;

test("nine authored volumes retain every source with path and digest provenance", () => {
  assert.equal(CONSOLIDATED_AUTHORED_DOC_PATHS.length, 9);
  assert.ok(manifest.sources.length >= 120, `only ${manifest.sources.length} source documents were consolidated`);
  assert.equal(new Set(manifest.sources.map(source => source.path)).size, manifest.sources.length);

  for (const source of manifest.sources) {
    const current = readFileSync(source.path, "utf8");
    const digest = crypto.createHash("sha256").update(current).digest("hex");
    assert.equal(digest, source.sha256, `${source.path} changed without regenerating the consolidation`);
    const volume = readFileSync(source.volume, "utf8");
    const start = `<!-- AQUACRM_SOURCE_START path=${JSON.stringify(source.path)} sha256=${JSON.stringify(source.sha256)} -->\n`;
    const end = `<!-- AQUACRM_SOURCE_END path=${JSON.stringify(source.path)} -->`;
    const from = volume.indexOf(start);
    const to = volume.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `${source.path} is missing from ${source.volume}`);
    const embedded = volume.slice(from + start.length, to);
    assert.equal(embedded, current.endsWith("\n") ? current : `${current}\n`, `${source.path} was not retained verbatim`);
  }
});

test("the founder-facing documentation index is exactly twenty canonical volumes", () => {
  const authored = CONSOLIDATED_AUTHORED_DOC_PATHS.map((relPath, index): DevDocEntry => ({
    relPath,
    title: relPath,
    mtimeMs: 100 - index,
    sizeBytes: 1,
  }));
  const reference = Array.from({ length: 11 }, (_, index): DevDocEntry => ({
    relPath: `docs/reference/${index}.md`,
    title: `Reference ${index}`,
    mtimeMs: index,
    sizeBytes: 1,
  }));
  const legacy: DevDocEntry = {
    relPath: "docs/development/plans/legacy-fragment.md",
    title: "Compatibility fragment",
    mtimeMs: 200,
    sizeBytes: 1,
  };
  const raw: DevDocsIndex = {
    entries: [legacy, ...authored, ...reference],
    tree: [],
    total: 21,
    scannedAtMs: 123,
  };
  const consolidated = consolidatedDevDocsIndex(raw);
  assert.equal(consolidated.total, 20);
  assert.equal(consolidated.entries.some(entry => entry.relPath === legacy.relPath), false);
  assert.equal(consolidated.tree[0]?.path, "docs");
  assert.equal(consolidated.tree[0]?.count, 20);
});

test("the manifest records the intended twenty-document canonical count", () => {
  assert.equal(manifest.canonicalMarkdownCount, 20);
});
