import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  __libraryDocsIndexCacheStats,
  __resetDevDocsIndexCache,
  scanLibraryDevDocs,
} from "../src/lib/server/dev/devDocs";
import {
  __resetWorkerSignalsCache,
  __workerFileActivityCacheStats,
  areaFor,
  groupActivity,
  scanRecentWorkerFiles,
  type ActiveFile,
} from "../src/lib/server/dev/devTeamWorkers";
import { composeDevTeamLogsSnapshot } from "../src/lib/server/dev/devTeamLogsSnapshot";

test("the Library query route loads only the selected view and streams a fallback", async () => {
  const page = await readFile(new URL("../src/app/portal/dev-team/library/page.tsx", import.meta.url), "utf8");
  for (const eager of ["LogsSection", "UpdatesSection", "LibrarySection"]) {
    assert.doesNotMatch(page, new RegExp(`^import .*${eager}`, "m"), `${eager} returned to the shared route chunk`);
  }
  assert.match(page, /await import\("\.\/_Section"\)/);
  assert.match(page, /await import\("\.\.\/logs\/_Section"\)/);
  assert.match(page, /await import\("\.\.\/updates\/_Section"\)/);
  assert.match(page, /<Suspense fallback=\{<ViewLoading/);

  const docs = await readFile(new URL("../src/app/portal/dev-team/library/_Section.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(docs, /^import .*_LibraryDocViewer/m, "the Markdown viewer returned to the index chunk");
  assert.doesNotMatch(docs, /^import .*_LibraryIndex/m, "the index client tree is no longer branch-only");
  assert.match(docs, /import\("\.\/_LibraryDocViewer"\)/);
  assert.match(docs, /import\("\.\/_LibraryIndex"\)/);
});

test("Library tabs do not prefetch every optional query view", async () => {
  const ui = await readFile(new URL("../src/app/portal/dev-team/_ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /prefetch=\{section === "library" \? false : undefined\}/);
});

test("the Library scans and transports only its twenty canonical documents", async () => {
  __resetDevDocsIndexCache();
  const indexes = await Promise.all([
    scanLibraryDevDocs(),
    scanLibraryDevDocs(),
    scanLibraryDevDocs(),
  ]);
  const stats = __libraryDocsIndexCacheStats();
  assert.equal(stats.loads, 1, "concurrent Library requests repeated the canonical scan");
  assert.equal(stats.coalesced, 2);
  assert.ok(indexes.every(index => index === indexes[0]), "cold callers did not share one Library index");
  assert.equal(indexes[0].total, 20);
  assert.ok(indexes[0].entries.every(entry =>
    /^docs\/0[0-8]-/.test(entry.relPath) || entry.relPath.startsWith("docs/reference/"),
  ));
  assert.ok(Buffer.byteLength(JSON.stringify(indexes[0])) < 64_000, "the Library DTO stopped being compact");

  const started = performance.now();
  const warm = await scanLibraryDevDocs();
  const elapsed = performance.now() - started;
  assert.equal(warm, indexes[0]);
  assert.equal(__libraryDocsIndexCacheStats().loads, 1, "a warm Library read started another scan");
  assert.ok(elapsed < 100, `the in-memory Library read took ${elapsed.toFixed(1)}ms`);
});

test("the concurrent file-activity index coalesces and stays exact", async () => {
  __resetWorkerSignalsCache();
  const reads = await Promise.all([
    scanRecentWorkerFiles(),
    scanRecentWorkerFiles(),
    scanRecentWorkerFiles(),
  ]);
  const stats = __workerFileActivityCacheStats();
  assert.equal(stats.loads, 1, "concurrent Logs reads repeated the filesystem walk");
  assert.equal(stats.coalesced, 2);
  assert.ok(reads.every(activity => activity === reads[0]));
  for (let index = 1; index < reads[0].recentFiles.length; index += 1) {
    assert.ok(reads[0].recentFiles[index - 1].mtimeMs >= reads[0].recentFiles[index].mtimeMs);
  }
  assert.equal(groupActivity(reads[0].recentFiles).reduce((sum, area) => sum + area.count, 0), reads[0].recentFiles.length);
  await scanRecentWorkerFiles();
  assert.equal(__workerFileActivityCacheStats().loads, 1, "the warm Logs read started another walk");
});

test("the Logs DTO keeps exact totals without serializing every changed path", () => {
  const recentFiles: ActiveFile[] = Array.from({ length: 1_000 }, (_, index) => {
    const relPath = index % 2 === 0
      ? `src/lib/server/generated-${index}.ts`
      : `docs/development/generated-${index}.md`;
    return { relPath, mtimeMs: 10_000 - index, area: areaFor(relPath) };
  });
  const edits = Array.from({ length: 50 }, (_, index) => ({
    relPath: `docs/0${index % 9}-volume.md`,
    author: "Perf test",
    at: 10_000 - index,
    sizeBytes: index,
  }));
  const snapshot = composeDevTeamLogsSnapshot({
    checkIns: [{ name: "worker", status: "testing", at: 10_000 }],
    recentFiles,
    edits,
    scannedAtMs: 10_000,
    groupedActivity: groupActivity(recentFiles),
  });

  assert.equal(snapshot.changeCount, 1_000, "the exact pill count was replaced by the display slice");
  assert.equal(snapshot.recentFiles.length, 25);
  assert.ok(snapshot.activity.length <= 10);
  assert.equal(snapshot.edits.length, 20);
  assert.ok(
    Buffer.byteLength(JSON.stringify(snapshot)) * 5 < Buffer.byteLength(JSON.stringify({ recentFiles, edits })),
    "the compact Logs DTO no longer materially reduces serialization",
  );
});

test("Logs streams before loading its scanner and edit-ledger graphs", async () => {
  const [page, section] = await Promise.all([
    readFile(new URL("../src/app/portal/dev-team/library/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/dev-team/logs/_Section.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(section, /^import .*devTeamWorkers/m);
  assert.doesNotMatch(section, /^import .*devDocEdits/m);
  assert.doesNotMatch(section, /<Suspense|LogsSectionFallback/, "the Logs slow path gained a duplicate inner boundary");
  assert.match(page, /<Suspense fallback=\{<ViewLoading tabs=\{tabs\} label="logs" \/>\}>/);
  assert.match(section, /await import\("@\/lib\/server\/dev\/devTeamLogsSnapshot"\)/);
  assert.match(page, /testId="dev-team-library-view-loading"/);
});
