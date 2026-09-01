import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SessionPayload } from "../src/server/types";

// Select the same virtual-workspace branch Vercel uses, but keep the test
// process isolated from every real datastore and from the checked-out files.
process.env.PORTAL_BACKEND = "memory";
process.env.DEV_TEAM_WORKSPACE_BACKEND = "state";

let runtimePromise: Promise<{
  storage: typeof import("../src/server/storage");
  workspace: typeof import("../src/lib/server/dev/devWorkspaceFiles");
}> | null = null;

function runtime() {
  runtimePromise ??= Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/dev/devWorkspaceFiles"),
  ]).then(([storage, workspace]) => ({ storage, workspace }));
  return runtimePromise;
}

function target(name: string): string {
  return resolve(process.cwd(), ".data", `dev-team-production-test-${process.pid}-${name}`);
}

test("production workspace persists an overlay without writing the deployment snapshot", async () => {
  const { storage, workspace } = await runtime();
  await storage.reset();
  const path = target("one.md");

  const created = await workspace.createDurableDevWorkspaceFile(path, "first\n");
  assert.equal(await workspace.readDevWorkspaceFile(path, "utf8"), "first\n");
  assert.equal((await workspace.devWorkspaceFileVersion(path))?.sha256, created.sha256);

  const relPath = workspace.devWorkspaceRelPath(path);
  assert.equal(storage.getState().devTeamWorkspaceFiles[relPath]?.content, "first\n");
  assert.equal(storage.getState().devTeamWorkspaceFiles[relPath]?.deleted, undefined);
});

test("stale production edits conflict instead of erasing a newer document", async () => {
  const { storage, workspace } = await runtime();
  await storage.reset();
  const path = target("conflict.md");
  const first = await workspace.createDurableDevWorkspaceFile(path, "one");
  const second = await workspace.replaceDurableDevWorkspaceFile(path, "two", first);
  assert.notEqual(second.sha256, first.sha256);

  await assert.rejects(
    workspace.replaceDurableDevWorkspaceFile(path, "stale overwrite", first),
    workspace.DevWorkspaceFileConflictError,
  );
  assert.equal(await workspace.readDevWorkspaceFile(path, "utf8"), "two");
});

test("a multi-file production commit is all-or-nothing", async () => {
  const { storage, workspace } = await runtime();
  await storage.reset();
  const left = target("batch-left.md");
  const right = target("batch-right.md");
  const [leftV1, rightV1] = await workspace.replaceDurableDevWorkspaceFiles([
    { target: left, content: "left-v1", expected: null },
    { target: right, content: "right-v1", expected: null },
  ]);
  const rightV2 = await workspace.replaceDurableDevWorkspaceFile(right, "right-v2", rightV1);
  assert.notEqual(rightV2.sha256, rightV1.sha256);

  await assert.rejects(
    workspace.replaceDurableDevWorkspaceFiles([
      { target: left, content: "left-v2", expected: leftV1 },
      { target: right, content: "stale-right", expected: rightV1 },
    ]),
    workspace.DevWorkspaceFileConflictError,
  );
  assert.equal(await workspace.readDevWorkspaceFile(left, "utf8"), "left-v1");
  assert.equal(await workspace.readDevWorkspaceFile(right, "utf8"), "right-v2");
});

test("a structurally corrupt durable attribution ledger fails closed", async () => {
  const { storage, workspace } = await runtime();
  await storage.reset();
  const document = target("corrupt-ledger.md");
  const ledger = resolve(process.cwd(), ".data", "dev-doc-edits.json");
  const originalDocument = "durable document before save\n";
  const corruptLedger = JSON.stringify({ entries: "not-an-array" }) + "\n";
  await workspace.replaceDurableDevWorkspaceFiles([
    { target: document, content: originalDocument, expected: await workspace.devWorkspaceFileVersion(document) },
    { target: ledger, content: corruptLedger, expected: await workspace.devWorkspaceFileVersion(ledger) },
  ]);

  const { saveDevDoc } = await import("../src/lib/server/dev/devDocEdits");
  const session = { email: "ed@aquacrm.test", role: "agency-owner" } as unknown as SessionPayload;
  await assert.rejects(
    () => saveDevDoc({
      session,
      relPath: document.slice(process.cwd().length + 1),
      content: "must not replace corrupt durable history\n",
    }),
    /attribution ledger is invalid and was left untouched/,
  );
  assert.equal(await workspace.readDevWorkspaceFile(document, "utf8"), originalDocument);
  assert.equal(await workspace.readDevWorkspaceFile(ledger, "utf8"), corruptLedger);
});

test("a production tombstone keeps a bundled/local baseline hidden", async () => {
  const { storage, workspace } = await runtime();
  await storage.reset();
  const baseline = resolve(process.cwd(), "docs", "development", "updates.md");
  const source = await workspace.readDevWorkspaceFile(baseline, "utf8");
  assert.match(source, /# Updates/i);
  const version = await workspace.devWorkspaceFileVersion(baseline);
  assert.ok(version);

  await workspace.deleteDurableDevWorkspaceFile(baseline, version);
  await assert.rejects(
    workspace.readDevWorkspaceFile(baseline, "utf8"),
    (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
  );
  assert.equal(storage.getState().devTeamWorkspaceFiles["docs/development/updates.md"]?.deleted, true);
});

test("Supabase migration validates the batch before applying any file", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20260826132000_dev_team_workspace_files.sql"),
    "utf8",
  );
  const validation = sql.indexOf("-- Validate the complete batch");
  const mutation = sql.indexOf("workspace_files := jsonb_set", validation);
  assert.ok(validation >= 0 && mutation > validation);
  assert.match(sql, /for update/i);
  assert.match(sql, /DEV_TEAM_WORKSPACE_CONFLICT/);
  assert.match(sql, /grant execute[^;]+service_role/is);
});

test("real Dev Team authoring modules round-trip through the production overlay", async () => {
  const { storage, workspace } = await runtime();
  await storage.reset();
  process.env.DEV_THOUGHTS_FILE = target("thoughts.json");

  const [plans, board, docs, roadmap, findings, updates, thoughts, workers] = await Promise.all([
    import("../src/lib/server/dev/devTeamPlans"),
    import("../src/lib/server/dev/devTeamBoard"),
    import("../src/lib/server/dev/devDocs"),
    import("../src/lib/server/dev/devTeamRoadmap"),
    import("../src/lib/server/dev/devTeamFindings"),
    import("../src/lib/server/dev/devTeamUpdates"),
    import("../src/lib/server/dev/devTeamThoughts"),
    import("../src/lib/server/dev/devTeamWorkers"),
  ]);

  const unique = `Production overlay ${process.pid}`;
  const plan = await plans.createPlan({
    title: unique,
    goal: "Prove the production workspace survives outside the deployment filesystem.",
    phases: ["Create", "Reload", "Read"],
  });
  assert.equal(existsSync(plan.absPath), false, "production plan must not write into the checkout");
  assert.ok((await board.scanPlanStatuses()).some(item => item.relPath === plan.relPath));
  assert.ok((await docs.scanDevDocs({ fresh: true })).entries.some(item => item.relPath === plan.relPath));

  const item = await roadmap.addItem({ title: unique, horizon: "now", plans: [plan.slug] });
  assert.ok((await roadmap.readItems()).some(candidate => candidate.id === item.id));
  await roadmap.updateItem({ id: item.id, status: "building" });
  assert.equal((await roadmap.readItems()).find(candidate => candidate.id === item.id)?.status, "building");
  const concurrentRoadmapTitles = [`${unique} A`, `${unique} B`];
  await Promise.all(concurrentRoadmapTitles.map(title => roadmap.addItem({ title, horizon: "next" })));
  const roadmapTitles = new Set((await roadmap.readItems()).map(candidate => candidate.title));
  assert.ok(concurrentRoadmapTitles.every(title => roadmapTitles.has(title)));

  const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const finding = await findings.createFinding({
    title: `Overlay finding ${process.pid}`,
    note: "The production finding and its screenshot must share one durable commit.",
    images: [onePixelPng],
  });
  assert.ok((await findings.listFindings()).some(candidate => candidate.slug === finding.slug));
  assert.ok(await findings.readFindingImage(finding.images[0]));
  assert.equal((await findings.updateFinding(finding.slug, { status: "fixed" }))?.status, "fixed");

  const planSource = await findings.createFinding({
    title: `Overlay plan source ${process.pid}`,
    note: "Plan creation and finding status must commit together.",
  });
  const planned = await findings.planFromFindings([planSource], { title: `Overlay generated plan ${process.pid}` });
  assert.equal(planned.findings[0]?.status, "planned");
  assert.equal((await findings.getFinding(planSource.slug))?.planRelPath, planned.plan.relPath);
  assert.equal(existsSync(planned.plan.absPath), false);

  const update = await updates.appendUpdateEntry({
    title: `Production overlay ${process.pid}`,
    bullets: ["Persisted without writing the deployment filesystem."],
  });
  assert.ok((await updates.scanUpdates(100)).some(candidate => candidate.title === update.title));

  const thought = await thoughts.addThought({ text: "Production thought", author: "Test founder" });
  assert.ok((await thoughts.listThoughts()).some(candidate => candidate.id === thought.id));
  const concurrentThoughts = await Promise.all(
    Array.from({ length: 5 }, (_, index) => thoughts.addThought({ text: `Concurrent ${index}`, author: "Test founder" })),
  );
  const thoughtIds = new Set((await thoughts.listThoughts()).map(candidate => candidate.id));
  assert.ok(concurrentThoughts.every(candidate => thoughtIds.has(candidate.id)));

  const workerPath = resolve(process.cwd(), ".data", "workers", `production-${process.pid}.json`);
  await workspace.createDurableDevWorkspaceFile(workerPath, JSON.stringify({
    name: `production-${process.pid}`,
    status: "verifying durable Dev Team",
    at: Date.now(),
  }));
  assert.ok((await workers.readCheckIns()).some(candidate => candidate.name === `production-${process.pid}`));

  const overlayPaths = Object.keys(storage.getState().devTeamWorkspaceFiles);
  assert.ok(overlayPaths.includes(plan.relPath));
  assert.ok(overlayPaths.includes(finding.relPath));
  assert.ok(overlayPaths.includes("docs/development/roadmap.md"));
  assert.ok(overlayPaths.includes("docs/development/updates.md"));
  assert.equal(await workspace.readDevWorkspaceFile(plan.absPath, "utf8").then(text => text.includes(unique)), true);
});
