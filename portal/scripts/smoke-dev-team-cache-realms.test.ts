import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";

// Select the production-style virtual workspace while keeping every mutation
// inside this test process. Project imports stay dynamic so these switches are
// established before storage chooses its backend.
process.env.PORTAL_BACKEND = "memory";
process.env.DEV_TEAM_WORKSPACE_BACKEND = "state";

const LIVE_REALM = "live";
const SANDBOX_REALM = "sandbox-dev-cache-realm-test";
const DOC_REL_PATH = "docs/00-START-HERE.md";
const ACTIVITY_REL_PATH = "src/realm-cache-probe.ts";
const STATE_REL_PATH = "docs/context/state.md";
const CHECKLIST_REL_PATH = "docs/development/checklist.md";
const WORKER_REL_PATH = ".data/workers/realm-console-proof.json";
const FIXED_NOW = Date.now();
const DOC_MTIME_MS = 1_700_000_000_000;

let runtimePromise: Promise<{
  storage: typeof import("../src/server/storage");
  docs: typeof import("../src/lib/server/dev/devDocs");
  markdown: typeof import("../src/lib/server/dev/devMarkdownCache");
  workers: typeof import("../src/lib/server/dev/devTeamWorkers");
  console: typeof import("../src/lib/server/dev/devConsoleStatus");
}> | null = null;

function runtime() {
  runtimePromise ??= Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/dev/devDocs"),
    import("../src/lib/server/dev/devMarkdownCache"),
    import("../src/lib/server/dev/devTeamWorkers"),
    import("../src/lib/server/dev/devConsoleStatus"),
  ]).then(([storage, docs, markdown, workers, console]) => ({ storage, docs, markdown, workers, console }));
  return runtimePromise;
}

function findingMarkdown(title: string, found: string): string {
  return `# Finding — ${title}\n\n**Severity:** bug\n**Status:** open\n**Found:** ${found}\n\n## What I saw\n\nRealm cache regression proof.\n\n---\n`;
}

async function seedConsoleRealm(
  storage: typeof import("../src/server/storage"),
  realmId: string,
  marker: "Live" | "Sandbox",
  findingCount: number,
  blockerCount: number,
): Promise<void> {
  await storage.runInDataRealm(realmId, async () => {
    await storage.reset();
    storage.mutate(state => {
      state.devTeamWorkspaceFiles[STATE_REL_PATH] = workspaceFile(
        STATE_REL_PATH,
        `# State\n\n## Blockers\n${Array.from({ length: blockerCount }, (_, index) => `- ${marker} blocker ${index + 1} — ${marker} detail`).join("\n")}\n`,
        DOC_MTIME_MS,
      );
      state.devTeamWorkspaceFiles[CHECKLIST_REL_PATH] = workspaceFile(
        CHECKLIST_REL_PATH,
        "# Checklist\n\n## Current work\n\n- Nothing blocking in this fixture.\n",
        DOC_MTIME_MS,
      );
      for (let index = 0; index < findingCount; index += 1) {
        const relPath = `docs/development/findings/realm-console-${marker.toLowerCase()}-${index + 1}.md`;
        state.devTeamWorkspaceFiles[relPath] = workspaceFile(
          relPath,
          findingMarkdown(`${marker} finding ${index + 1}`, `2033-05-1${index} 12:00`),
          DOC_MTIME_MS + index,
        );
      }
      state.devTeamWorkspaceFiles[WORKER_REL_PATH] = workspaceFile(
        WORKER_REL_PATH,
        JSON.stringify({ name: `${marker} worker`, status: `${marker} status`, phase: `${marker} phase`, at: FIXED_NOW }),
        FIXED_NOW,
      );
    });
    await storage.flushPendingWrites();
  });
}

function workspaceFile(relPath: string, content: string, mtimeMs: number) {
  return {
    relPath,
    encoding: "utf8" as const,
    content,
    sizeBytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    mtimeMs,
  };
}

async function seedRealm(
  storage: typeof import("../src/server/storage"),
  realmId: string,
  docContent: string,
  activityMtimeMs: number,
): Promise<void> {
  await storage.runInDataRealm(realmId, async () => {
    await storage.reset();
    storage.mutate(state => {
      state.devTeamWorkspaceFiles[DOC_REL_PATH] = workspaceFile(DOC_REL_PATH, docContent, DOC_MTIME_MS);
      state.devTeamWorkspaceFiles[ACTIVITY_REL_PATH] = workspaceFile(
        ACTIVITY_REL_PATH,
        realmId === LIVE_REALM ? "live" : "sand",
        activityMtimeMs,
      );
    });
    await storage.flushPendingWrites();
  });
}

function docTitle(index: { entries: Array<{ relPath: string; title: string }> }): string | undefined {
  return index.entries.find(entry => entry.relPath === DOC_REL_PATH)?.title;
}

function activityMtime(activity: { recentFiles: Array<{ relPath: string; mtimeMs: number }> }): number | undefined {
  return activity.recentFiles.find(file => file.relPath === ACTIVITY_REL_PATH)?.mtimeMs;
}

test("Dev Team document and activity caches never cross live/Sandbox realms", async () => {
  const { storage, docs, markdown, workers } = await runtime();
  const liveDoc = "# Realm Live Doc\n";
  const sandboxDoc = "# Realm Sand Doc\n";
  assert.equal(Buffer.byteLength(liveDoc), Buffer.byteLength(sandboxDoc), "the fixture must exercise equal-size stat keys");

  await seedRealm(storage, LIVE_REALM, liveDoc, FIXED_NOW - 1_000);
  await seedRealm(storage, SANDBOX_REALM, sandboxDoc, FIXED_NOW - 2_000);
  docs.__resetDevDocsIndexCache();
  markdown.__resetCache();
  workers.__resetWorkerSignalsCache();

  const scanDocsIn = (realmId: string) => storage.runInDataRealm(realmId, async () => {
    const [library, project] = await Promise.all([
      docs.scanLibraryDevDocs(),
      docs.scanDevDocs(),
    ]);
    return { library, project };
  });

  // Alternate realms without a forced refresh. Both outer indexes must retain
  // their own object and metadata instead of returning the most recent realm.
  const liveDocs = await scanDocsIn(LIVE_REALM);
  const sandboxDocs = await scanDocsIn(SANDBOX_REALM);
  const liveDocsWarm = await scanDocsIn(LIVE_REALM);
  assert.equal(docTitle(liveDocs.library), "Realm Live Doc");
  assert.equal(docTitle(liveDocs.project), "Realm Live Doc");
  assert.equal(docTitle(sandboxDocs.library), "Realm Sand Doc");
  assert.equal(docTitle(sandboxDocs.project), "Realm Sand Doc");
  assert.equal(liveDocsWarm.library, liveDocs.library);
  assert.equal(liveDocsWarm.project, liveDocs.project);
  assert.equal(docs.__libraryDocsIndexCacheStats().loads, 2);
  assert.equal(docs.__devDocsIndexCacheStats().loads, 2);

  // A write invalidation clears every realm safely. Rebuilding the indexes
  // while retaining the parsed-file cache also proves equal mtime/size files
  // are realm-keyed below the index layer.
  storage.runInDataRealm(LIVE_REALM, () => docs.invalidateDevDocsIndex());
  assert.equal(docs.__libraryDocsIndexCacheStats().size, 0);
  assert.equal(docs.__devDocsIndexCacheStats().size, 0);
  const sandboxDocsReloaded = await scanDocsIn(SANDBOX_REALM);
  const liveDocsReloaded = await scanDocsIn(LIVE_REALM);
  assert.equal(docTitle(sandboxDocsReloaded.library), "Realm Sand Doc");
  assert.equal(docTitle(liveDocsReloaded.library), "Realm Live Doc");

  const docAbsPath = resolve(process.cwd(), DOC_REL_PATH);
  markdown.__resetCache();
  let liveParses = 0;
  let sandboxParses = 0;
  const readTitle = (realmId: string, parse: (text: string) => string) =>
    storage.runInDataRealm(realmId, () => markdown.readParsedFile("realm-probe", docAbsPath, parse));
  const parseLive = (text: string) => (liveParses += 1, text.trim());
  const parseSandbox = (text: string) => (sandboxParses += 1, text.trim());
  assert.equal(await readTitle(LIVE_REALM, parseLive), liveDoc.trim());
  assert.equal(await readTitle(SANDBOX_REALM, parseSandbox), sandboxDoc.trim());
  await readTitle(LIVE_REALM, parseLive);
  await readTitle(SANDBOX_REALM, parseSandbox);
  assert.deepEqual([liveParses, sandboxParses], [1, 1]);
  storage.runInDataRealm(LIVE_REALM, () => markdown.invalidateFile("realm-probe", docAbsPath));
  await readTitle(LIVE_REALM, parseLive);
  await readTitle(SANDBOX_REALM, parseSandbox);
  assert.deepEqual([liveParses, sandboxParses], [2, 2], "write invalidation did not reach both realm buckets");
  storage.runInDataRealm(SANDBOX_REALM, () => markdown.invalidatePath(docAbsPath));
  await readTitle(LIVE_REALM, parseLive);
  await readTitle(SANDBOX_REALM, parseSandbox);
  assert.deepEqual([liveParses, sandboxParses], [3, 3], "path-wide write invalidation did not reach both realms");

  const windowMs = 10_000;
  const scanActivityIn = (realmId: string) => storage.runInDataRealm(
    realmId,
    () => workers.scanRecentWorkerFiles(windowMs, FIXED_NOW),
  );
  const liveActivity = await scanActivityIn(LIVE_REALM);
  const sandboxActivity = await scanActivityIn(SANDBOX_REALM);
  const liveActivityWarm = await scanActivityIn(LIVE_REALM);
  assert.equal(activityMtime(liveActivity), FIXED_NOW - 1_000);
  assert.equal(activityMtime(sandboxActivity), FIXED_NOW - 2_000);
  assert.equal(liveActivityWarm, liveActivity);
  assert.equal(workers.__workerFileActivityCacheStats().loads, 2);

  const scanSignalsIn = (realmId: string) => storage.runInDataRealm(
    realmId,
    () => workers.scanWorkerSignals(windowMs, FIXED_NOW),
  );
  const liveSignals = await scanSignalsIn(LIVE_REALM);
  const sandboxSignals = await scanSignalsIn(SANDBOX_REALM);
  const liveSignalsWarm = await scanSignalsIn(LIVE_REALM);
  assert.equal(activityMtime(liveSignals), FIXED_NOW - 1_000);
  assert.equal(activityMtime(sandboxSignals), FIXED_NOW - 2_000);
  assert.equal(liveSignalsWarm, liveSignals);
  assert.equal(workers.__workerSignalsCacheStats().loads, 2);
});

test("Dev Console core/status slots alternate realms without crossing titles, counts or workers", async () => {
  const { storage, markdown, workers, console } = await runtime();
  await seedConsoleRealm(storage, LIVE_REALM, "Live", 1, 1);
  await seedConsoleRealm(storage, SANDBOX_REALM, "Sandbox", 2, 2);
  markdown.__resetCache();
  workers.__resetWorkerSignalsCache();
  console.invalidateDevConsoleBadge("all");

  const readCore = (realmId: string) => storage.runInDataRealm(
    realmId,
    () => console.devConsoleCore(FIXED_NOW),
  );
  const readStatus = (realmId: string) => storage.runInDataRealm(
    realmId,
    () => console.devConsoleStatus(FIXED_NOW),
  );

  const liveCore = await readCore(LIVE_REALM);
  const sandboxCore = await readCore(SANDBOX_REALM);
  const liveCoreWarm = await readCore(LIVE_REALM);
  assert.equal(liveCoreWarm, liveCore, "returning to live reuses only the live core slot");
  assert.equal(liveCore.findings.some(finding => finding.title === "Live finding 1"), true);
  assert.equal(liveCore.findings.some(finding => finding.title.startsWith("Sandbox finding")), false);
  assert.equal(sandboxCore.findings.some(finding => finding.title === "Sandbox finding 1"), true);
  assert.equal(sandboxCore.findings.some(finding => finding.title === "Sandbox finding 2"), true);
  assert.equal(sandboxCore.findings.some(finding => finding.title.startsWith("Live finding")), false);
  assert.equal(liveCore.blockers.some(blocker => blocker.label === "Live blocker 1"), true);
  assert.equal(liveCore.blockers.some(blocker => blocker.label.startsWith("Sandbox blocker")), false);
  assert.equal(sandboxCore.blockers.some(blocker => blocker.label === "Sandbox blocker 2"), true);
  assert.equal(sandboxCore.blockers.some(blocker => blocker.label.startsWith("Live blocker")), false);
  assert.equal(sandboxCore.openFindings, liveCore.openFindings + 1);
  assert.equal(sandboxCore.openBlockers, liveCore.openBlockers + 1);
  assert.equal(liveCore.attention, liveCore.openFindings + liveCore.openBlockers);
  assert.equal(sandboxCore.attention, sandboxCore.openFindings + sandboxCore.openBlockers);

  const liveStatus = await readStatus(LIVE_REALM);
  const sandboxStatus = await readStatus(SANDBOX_REALM);
  const liveStatusWarm = await readStatus(LIVE_REALM);
  assert.equal(liveStatusWarm, liveStatus, "returning to live reuses only the live status slot");
  assert.equal(liveStatus.workers.some(worker => worker.name === "Live worker"), true);
  assert.equal(liveStatus.workers.some(worker => worker.name === "Sandbox worker"), false);
  assert.equal(sandboxStatus.workers.some(worker => worker.name === "Sandbox worker"), true);
  assert.equal(sandboxStatus.workers.some(worker => worker.name === "Live worker"), false);

  // Default invalidation is deliberately local: a finding captured in live
  // cannot evict (or later repopulate) the independent Sandbox slot.
  storage.runInDataRealm(LIVE_REALM, () => console.invalidateDevConsoleBadge());
  const sandboxStillWarm = await readCore(SANDBOX_REALM);
  const liveReloaded = await readCore(LIVE_REALM);
  assert.equal(sandboxStillWarm, sandboxCore);
  assert.notEqual(liveReloaded, liveCore);

  console.invalidateDevConsoleBadge("all");
  const sandboxReloaded = await readCore(SANDBOX_REALM);
  assert.notEqual(sandboxReloaded, sandboxCore);
});
