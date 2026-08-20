import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  memoiseByStat,
  readParsedFile,
  invalidateFile,
  invalidatePath,
  invalidateNamespace,
  __cacheStats,
  __resetCache,
} from "../src/lib/server/dev/devMarkdownCache";

// The Dev Team workspace was the slowest surface in the app: every request
// re-read and re-parsed ~40 markdown files (roadmap.md, all 37 plans twice
// over, findings, state.md, audits.md, the docs tree) with no cross-request
// cache. `devMarkdownCache` is the fix — a transparent mtime-keyed memo in
// front of those parses. These pin the two properties the fix has to have:
//
//   (a) a second read of an UNCHANGED file does not re-parse from disk; and
//   (b) a write (or an mtime/size change) makes the very next read fresh —
//       the cache never serves stale data after an edit.
//
// Before the cache existed, parsing was unconditional, so every one of the
// "served from cache" assertions below fails.

async function withTempFile<T>(name: string, body: string, run: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "aqua-devperf-"));
  const path = join(dir, name);
  await writeFile(path, body, "utf8");
  try {
    return await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---- the cache primitive ----------------------------------------------------

test("an unchanged file is parsed once, then served from cache", async () => {
  __resetCache();
  await withTempFile("plan.md", "## Phases\n1. First\n", async path => {
    let parses = 0;
    const parse = (text: string) => {
      parses += 1;
      return text.length;
    };

    const first = await readParsedFile("probe", path, parse);
    const second = await readParsedFile("probe", path, parse);
    const third = await readParsedFile("probe", path, parse);

    assert.equal(first, second);
    assert.equal(second, third);
    assert.equal(parses, 1, "the parser re-ran on an unchanged file — the cache did nothing");

    const stats = __cacheStats();
    assert.equal(stats.misses, 1, "exactly one miss (the first read)");
    assert.equal(stats.hits, 2, "the second and third reads must be cache hits");
  });
});

test("a null the parser returns is memoised too — a no-phase plan is not re-parsed", async () => {
  __resetCache();
  await withTempFile("empty.md", "no phases here\n", async path => {
    let parses = 0;
    const parse = () => {
      parses += 1;
      return null;
    };
    assert.equal(await readParsedFile("probe", path, parse), null);
    assert.equal(await readParsedFile("probe", path, parse), null);
    assert.equal(parses, 1, "a cached null was re-parsed");
  });
});

test("a changed file (different size) busts the cache and re-parses fresh", async () => {
  __resetCache();
  await withTempFile("plan.md", "AAAA", async path => {
    const parse = (text: string) => text;
    assert.equal(await readParsedFile("probe", path, parse), "AAAA");

    // A different length guarantees a size change, so this is a miss regardless
    // of the filesystem's mtime resolution.
    await writeFile(path, "BBBBBBBB", "utf8");
    assert.equal(await readParsedFile("probe", path, parse), "BBBBBBBB", "a changed file was served stale");
    assert.equal(__cacheStats().misses, 2);
  });
});

test("a same-size rewrite with a newer mtime still busts the cache", async () => {
  __resetCache();
  await withTempFile("plan.md", "AAAA", async path => {
    const parse = (text: string) => text;
    assert.equal(await readParsedFile("probe", path, parse), "AAAA");

    // Same byte length, but a distinctly newer mtime — the other half of the
    // (mtime, size) guard.
    await writeFile(path, "CCCC", "utf8");
    const future = new Date(Date.now() + 5000);
    await utimes(path, future, future);
    assert.equal(await readParsedFile("probe", path, parse), "CCCC", "an mtime bump did not invalidate");
  });
});

test("explicit invalidation forces a re-parse even when the file never moved", async () => {
  __resetCache();
  await withTempFile("plan.md", "same-bytes", async path => {
    let parses = 0;
    const parse = (text: string) => {
      parses += 1;
      return text;
    };

    await readParsedFile("probe", path, parse); // miss
    await readParsedFile("probe", path, parse); // hit
    assert.equal(parses, 1);

    // The write-path safety net: a write that lands in the same mtime tick with
    // an identical size must still be re-read, which only explicit invalidation
    // can guarantee. The file is untouched here, so a re-parse proves it works.
    invalidateFile("probe", path);
    await readParsedFile("probe", path, parse);
    assert.equal(parses, 2, "invalidateFile did not drop the entry");
  });
});

test("invalidatePath drops every namespace that cached one file", async () => {
  __resetCache();
  await withTempFile("plan.md", "x", async path => {
    let a = 0;
    let b = 0;
    await readParsedFile("tasks", path, t => (a += 1, t));
    await readParsedFile("planStatus", path, t => (b += 1, t));
    // Both cached now.
    await readParsedFile("tasks", path, t => (a += 1, t));
    await readParsedFile("planStatus", path, t => (b += 1, t));
    assert.equal(a, 1);
    assert.equal(b, 1);

    // One file, cached under two namespaces (exactly a plan's tasks + status).
    // A write to it has to reach both.
    invalidatePath(path);
    await readParsedFile("tasks", path, t => (a += 1, t));
    await readParsedFile("planStatus", path, t => (b += 1, t));
    assert.equal(a, 2, "the tasks entry survived invalidatePath");
    assert.equal(b, 2, "the planStatus entry survived invalidatePath");
  });
});

test("invalidateNamespace clears one namespace and leaves the others", async () => {
  __resetCache();
  await withTempFile("plan.md", "x", async path => {
    let a = 0;
    let b = 0;
    await readParsedFile("tasks", path, t => (a += 1, t));
    await readParsedFile("planStatus", path, t => (b += 1, t));

    invalidateNamespace("tasks");
    await readParsedFile("tasks", path, t => (a += 1, t)); // miss again
    await readParsedFile("planStatus", path, t => (b += 1, t)); // still cached
    assert.equal(a, 2, "the tasks namespace was not cleared");
    assert.equal(b, 1, "an unrelated namespace was wrongly cleared");
  });
});

test("a missing file returns null and never calls compute", async () => {
  __resetCache();
  let called = false;
  const value = await memoiseByStat("probe", join(tmpdir(), "aqua-does-not-exist-9f3a.md"), async () => {
    called = true;
    return "x";
  });
  assert.equal(value, null);
  assert.equal(called, false, "compute ran for a file that cannot be stat'd");
});

// ---- integration: the real hot readers use the cache ------------------------

test("scanTasks parses every plan once, then serves the whole scan from cache", async () => {
  __resetCache();
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");

  const first = await scanTasks();
  const afterFirst = __cacheStats();
  assert.ok(afterFirst.misses > 0, "scanTasks did not populate the cache — it is not memoised");

  const second = await scanTasks();
  const afterSecond = __cacheStats();

  // The whole second scan is served from cache: not one plan is re-parsed.
  assert.equal(afterSecond.misses, afterFirst.misses, "a second scanTasks re-parsed plans from disk");
  assert.ok(afterSecond.hits > afterFirst.hits, "the second scan recorded no cache hits");

  // And memoisation must not change what scanTasks returns.
  assert.deepEqual(second, first, "the cached scan differs from the fresh one");
});

test("scanPlanStatuses and scanTasks cache the same plans under separate namespaces", async () => {
  __resetCache();
  const { scanPlanStatuses } = await import("../src/lib/server/dev/devTeamBoard");
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");

  await scanTasks();
  await scanPlanStatuses();
  const primed = __cacheStats();

  const statuses1 = await scanPlanStatuses();
  const statuses2 = await scanPlanStatuses();
  const after = __cacheStats();
  assert.equal(after.misses, primed.misses, "a repeat scanPlanStatuses re-parsed from disk");
  assert.deepEqual(statuses2, statuses1);
});

// ---- integration: writes invalidate, so a read after a write is fresh -------

async function withTempRoadmap<T>(markdown: string, run: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "aqua-devperf-roadmap-"));
  const path = join(dir, "roadmap.md");
  await writeFile(path, markdown, "utf8");
  const previous = process.env.PORTAL_ROADMAP_FILE;
  process.env.PORTAL_ROADMAP_FILE = path;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PORTAL_ROADMAP_FILE;
    else process.env.PORTAL_ROADMAP_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test("the roadmap read is cached, and a write makes the next read fresh", async () => {
  __resetCache();
  const { readItems, addItem, updateItem, removeItem } =
    await import("../src/lib/server/dev/devTeamRoadmap");

  await withTempRoadmap("# Roadmap\n\n---\n\n## Now\n_In flight._\n", async () => {
    const empty = await readItems();
    assert.equal(empty.length, 0);
    const afterRead = __cacheStats();

    // A second read with no write in between is a pure cache hit.
    await readItems();
    assert.equal(__cacheStats().misses, afterRead.misses, "an unchanged roadmap was re-parsed");
    assert.ok(__cacheStats().hits > afterRead.hits, "the second readItems was not a cache hit");

    // A write must invalidate: the added item has to be visible immediately,
    // regardless of whether the rename landed inside the same mtime tick.
    const added = await addItem({ title: "Perf probe", horizon: "now" });
    const afterAdd = await readItems();
    assert.ok(afterAdd.some(i => i.id === added.id), "the roadmap read was served stale after an add");

    // …and the same for update and remove.
    await updateItem({ id: added.id, status: "building" });
    assert.equal((await readItems()).find(i => i.id === added.id)?.status, "building", "stale after update");

    await removeItem(added.id);
    assert.ok(!(await readItems()).some(i => i.id === added.id), "stale after remove");
  });
});
