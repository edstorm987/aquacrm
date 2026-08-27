import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import * as ts from "typescript";

import {
  createCoalescedRefreshCache,
  memoiseByStat,
  readParsedFile,
  invalidateFile,
  invalidatePath,
  invalidateNamespace,
  __cacheStats,
  __resetCache,
} from "../src/lib/server/dev/devMarkdownCache";
import {
  __devDocsIndexCacheStats,
  __resetDevDocsIndexCache,
  DEV_DOCS_INDEX_TTL_MS,
  isIgnoredDevDocsDirectory,
  scanDevDocs,
} from "../src/lib/server/dev/devDocs";
import {
  __resetWorkerSignalsCache,
  __workerSignalsCacheStats,
  SIGNALS_TTL_MS,
  scanWorkerSignals,
  shouldSkipWorkerDirectory,
} from "../src/lib/server/dev/devTeamWorkers";
import {
  DEFAULT_MIN_FREE_BYTES,
  evaluateDevDiskSpace,
} from "./dev-preflight.mjs";
import { composeDevTeamHomeSnapshot } from "../src/lib/server/dev/devTeamHomeSnapshot";

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

// ---- the directory-index cache ---------------------------------------------

test("simultaneous cold callers share one live-index refresh", async () => {
  const cache = createCoalescedRefreshCache<string, { version: number }>(15_000);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let loads = 0;
  const load = async () => {
    loads += 1;
    await gate;
    return { version: loads };
  };

  const reads = [cache.get("index", load), cache.get("index", load), cache.get("index", load)];
  assert.equal(loads, 1, "three concurrent misses started three filesystem walks");
  assert.equal(cache.stats().coalesced, 2);
  release();

  const values = await Promise.all(reads);
  assert.ok(values.every(value => value === values[0]), "callers did not share the same scan result");
  assert.equal(cache.stats().loads, 1);

  const forced = await cache.get("index", load, { fresh: true });
  assert.equal(forced.version, 2, "explicit refresh reused the completed cached value");
  assert.equal(cache.stats().loads, 2);
});

test("invalidation prevents an older in-flight refresh from publishing stale data", async () => {
  const cache = createCoalescedRefreshCache<string, string>(15_000);
  let releaseOld!: () => void;
  let releaseNew!: () => void;
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  const newGate = new Promise<void>(resolve => { releaseNew = resolve; });

  const oldRead = cache.get("index", async () => {
    await oldGate;
    return "old";
  });
  cache.invalidate("index");
  const newRead = cache.get("index", async () => {
    await newGate;
    return "new";
  });

  releaseOld();
  assert.equal(await oldRead, "old", "the original caller still receives its completed read");
  assert.equal(cache.stats().size, 0, "an invalidated in-flight value entered the cache");
  releaseNew();
  assert.equal(await newRead, "new");
  assert.equal(await cache.get("index", async () => "unexpected"), "new");
  assert.equal(cache.stats().loads, 2, "the post-invalidation warm read reloaded unexpectedly");
});

test("Dev Docs coalesces cold scans and makes warm navigation a memory read", async () => {
  __resetDevDocsIndexCache();

  const cold = await Promise.all([scanDevDocs(), scanDevDocs(), scanDevDocs()]);
  const afterCold = __devDocsIndexCacheStats();
  assert.equal(afterCold.loads, 1, "concurrent Dev Docs requests repeated the project walk");
  assert.equal(afterCold.coalesced, 2);
  assert.ok(cold.every(index => index === cold[0]), "cold callers did not share one index object");

  const started = performance.now();
  const warm = await Promise.all([scanDevDocs(), scanDevDocs(), scanDevDocs()]);
  const warmMs = performance.now() - started;
  assert.ok(warm.every(index => index === cold[0]), "warm calls rebuilt the docs index");
  assert.equal(__devDocsIndexCacheStats().loads, 1, "warm calls started another project walk");
  assert.ok(warmMs < 1_000, `warm Dev Docs reads took ${warmMs.toFixed(1)}ms; expected <1000ms`);
});

test("worker activity coalesces cold scans and makes warm reads a memory read", async () => {
  __resetWorkerSignalsCache();

  const cold = await Promise.all([scanWorkerSignals(), scanWorkerSignals(), scanWorkerSignals()]);
  const afterCold = __workerSignalsCacheStats();
  assert.equal(afterCold.loads, 1, "concurrent worker requests repeated the authored-tree walk");
  assert.equal(afterCold.coalesced, 2);
  assert.ok(cold.every(signals => signals === cold[0]), "cold callers did not share one signal object");

  const started = performance.now();
  const warm = await scanWorkerSignals();
  const warmMs = performance.now() - started;
  assert.equal(warm, cold[0]);
  assert.equal(__workerSignalsCacheStats().loads, 1, "the warm signal read started another tree walk");
  assert.ok(warmMs < 1_000, `warm worker signals took ${warmMs.toFixed(1)}ms; expected <1000ms`);
});

test("all worker-suffixed Next build directories are excluded from live indexes", () => {
  assert.equal(DEV_DOCS_INDEX_TTL_MS, 15_000, "Dev Docs staleness bound drifted");
  assert.equal(SIGNALS_TTL_MS, 15_000, "worker-signal staleness bound drifted");
  for (const name of [".next", ".next-codex-alpha", ".next-worker-17", ".next-verify"]) {
    assert.equal(isIgnoredDevDocsDirectory(name), true, `Dev Docs would enter ${name}`);
    assert.equal(shouldSkipWorkerDirectory(name), true, `worker signals would enter ${name}`);
  }
  assert.equal(isIgnoredDevDocsDirectory("next-steps"), false);
  assert.equal(shouldSkipWorkerDirectory("next-steps"), false);
});

test("the TypeScript project boundary excludes nested generated build trees", () => {
  const configPath = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(loaded.error, undefined, "tsconfig.json could not be read");

  const started = performance.now();
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  );
  const parseMs = performance.now() - started;
  assert.deepEqual(parsed.errors, [], "the TypeScript project boundary is invalid");

  const projectRoot = dirname(configPath);
  const files = parsed.fileNames.map(file => relative(projectRoot, file).replaceAll("\\", "/"));
  assert.ok(files.includes("src/app/portal/dev-team/page.tsx"), "the real Dev Team page fell outside the project");
  assert.ok(files.includes("middleware.ts"), "root runtime files fell outside the project");
  assert.equal(
    files.some(file => file === "private" || file.startsWith("private/")),
    false,
    "nested private build outputs entered the compiler project",
  );
  assert.ok(
    files.length < 2_500,
    `the compiler project expanded to ${files.length} files in ${parseMs.toFixed(1)}ms; generated trees are back on the hot path`,
  );
  assert.ok(parseMs < 1_000, `tsconfig expansion took ${parseMs.toFixed(1)}ms; expected <1000ms`);
});

test("the dev startup guard refuses the ENOSPC request-hang state without deleting anything", () => {
  const belowThreshold = evaluateDevDiskSpace(DEFAULT_MIN_FREE_BYTES - 1n);
  assert.equal(belowThreshold.ok, false, "a nearly full disk was allowed to start Next");
  assert.match(belowThreshold.message ?? "", /ENOSPC/);
  assert.match(belowThreshold.message ?? "", /Nothing was deleted automatically/);

  const atThreshold = evaluateDevDiskSpace(DEFAULT_MIN_FREE_BYTES);
  assert.equal(atThreshold.ok, true, "the exact documented free-space boundary was rejected");
});

// ---- landing-page streaming boundary --------------------------------------

test("the Dev Team Home snapshot preserves every displayed count while returning a compact DTO", () => {
  const snapshot = composeDevTeamHomeSnapshot({
    blockers: [
      { label: "Open", detail: "act", resolved: false },
      { label: "Closed", resolved: true },
    ],
    roadmap: {
      byHorizon: {
        now: [{ id: "now", title: "In flight", target: "2026-09", dueInDays: 5 }],
      },
      schedule: Array.from({ length: 7 }, (_, index) => ({
        id: `due-${index}`,
        title: `Due ${index}`,
        target: `2026-09-${String(index + 1).padStart(2, "0")}`,
        dueInDays: index,
      })),
      items: [{ done: 2, total: 3 }, { done: 4, total: 5 }],
    },
    findings: [{ status: "open" }, { status: "fixed" }, { status: "open" }],
    activeCheckIns: [
      { name: "Working", status: "building", phase: "phase 2" },
      { name: "Done", status: "working", phase: "done" },
      { name: "Routed", status: "routed" },
    ],
    waiting: 3,
  });

  assert.deepEqual(snapshot.openBlockers, [{ label: "Open", detail: "act" }]);
  assert.deepEqual(snapshot.inFlight, [{ id: "now", title: "In flight" }]);
  assert.equal(snapshot.upcoming.length, 5, "Home must keep its five-row Next up cap");
  assert.deepEqual([snapshot.tasksDone, snapshot.tasksTotal], [6, 8]);
  assert.equal(snapshot.openFindings, 2);
  assert.deepEqual(snapshot.activeWorkers.map(worker => worker.name), ["Working"]);
  assert.equal(snapshot.waitingThoughts, 3);
  assert.equal("items" in snapshot, false, "the complete roadmap leaked into the Home DTO");
  assert.equal("findings" in snapshot, false, "complete finding notes leaked into the Home DTO");
});

test("the Dev Team shell streams before its scanner and Librarian module graphs", async () => {
  const [page, layout, snapshot] = await Promise.all([
    readFile(new URL("../src/app/portal/dev-team/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/dev-team/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/dev/devTeamHomeSnapshot.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /import \{ devTeamAccessible \} from "@\/lib\/server\/dev\/devTeamAccess"/);
  assert.doesNotMatch(page, /^import .*devDocs/m, "the scanner-heavy docs graph returned to the shell chunk");
  for (const reader of ["devTeamRoadmap", "devTeamFindings", "devTeamWorkers", "devTeamThoughts"]) {
    assert.doesNotMatch(page, new RegExp(`^import .*${reader}`, "m"), `${reader} returned to the shell chunk`);
  }
  assert.match(page, /cache\(async \(\): Promise<DevTeamHomeSnapshot>/, "header and body no longer share one request snapshot");
  assert.match(page, /<Suspense fallback=\{<DashboardFallback \/>\}>[\s\S]*?<LiveDashboard \/>/);
  assert.match(snapshot, /await Promise\.all\(\[\s*import\("@\/lib\/server\/dev\/devDocs"\)/);
  assert.match(snapshot, /const \[blockers, roadmap, findings, activeCheckIns, waiting\] = await Promise\.all/);
  assert.match(snapshot, /workerReader\.readActiveCheckIns\(\)/, "Home stopped using the cheap authoritative worker check-ins");
  assert.doesNotMatch(snapshot, /workerReader\.scanWorkerSignals\(\)/, "the recursive activity walk returned to Home");
  const roadmap = await readFile(new URL("../src/lib/server/dev/devTeamRoadmap.ts", import.meta.url), "utf8");
  assert.match(roadmap, /readActiveCheckIns\(now\)/, "roadmap worker intent stopped using active check-ins");
  assert.doesNotMatch(roadmap, /scanWorkerSignals/, "the recursive activity walk returned through buildRoadmap");
  const tasks = await readFile(new URL("../src/lib/server/dev/devTeamTasks.ts", import.meta.url), "utf8");
  assert.match(tasks, /readActiveCheckIns\(\)/, "task ownership stopped using active check-ins");
  assert.doesNotMatch(tasks, /scanWorkerSignals/, "the recursive activity walk returned through scanTasks");

  assert.doesNotMatch(layout, /^import \{ LibrarianDrawerControl \}/m);
  assert.match(layout, /import \{ DeferredLibrarianDrawerControl \} from "@\/components\/chrome\/DeferredLibrarianDrawerControl"/);
  assert.doesNotMatch(layout, /await import\("@\/components\/chrome\/LibrarianDrawerControl"\)/, "closed Librarian still delayed the response stream");
  const deferredLibrarian = await readFile(new URL("../src/components/chrome/DeferredLibrarianDrawerControl.tsx", import.meta.url), "utf8");
  assert.match(deferredLibrarian, /import\("@\/components\/chrome\/LibrarianDrawerControl"\)/);
  assert.doesNotMatch(layout, /^import \{ Topbar \}/m, "the shared-chrome graph returned to the first shell chunk");
  assert.doesNotMatch(layout, /^import \{ NotificationCentreButton \}/m);
  assert.match(layout, /import\("@\/components\/chrome\/Topbar"\)/);
  assert.match(layout, /<Suspense fallback=\{<DevTeamTopbarFallback \/>\}>/);
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
