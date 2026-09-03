// Durable Aqua Tag ingestion across REAL processes (issues #87).
//
// smoke-aqua-tag-ingestion-durability proves the contract with one process
// and the reference model. This suite spawns separate Node processes — each
// running the real public handlers and the real delivery orchestrator — that
// share ONE model owned by a coordinator in this process over loopback HTTP,
// behind a filesystem barrier so they collide on purpose. A worker can die
// with SIGKILL right after a named effect happened, which no in-process test
// can do honestly. The database engine itself is still a model here; the SQL
// is proven only by smoke-aqua-tag-ingestion-live-postgres.
process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require_.resolve("tsx");
const fixturePath = join(root, "scripts", "fixtures", "aqua-tag-ingestion-worker.mjs");
const sandbox = mkdtempSync(join(tmpdir(), "aqua-tag-durable-processes-"));

type Fixture = typeof import("./fixtures/aqua-tag-ingestion-worker.mjs");
let fixture: Fixture;
let model: ReturnType<Fixture["createSubmissionStoreModel"]>;
let coordinator: { url: string; close: () => Promise<void> };

interface ChildOutcome { ok: boolean; result?: any; error?: string; crashed?: string; signal?: string | null }

function runWorker(input: Record<string, unknown>): Promise<ChildOutcome> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", tsxLoader, fixturePath], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORTAL_BACKEND: "memory",
        PORTAL_SESSION_SECRET: "aqua-tag-durable-processes-secret",
        TSX_TSCONFIG_PATH: join(root, "tsconfig.json"),
        AQUA_TEST_INPUT: JSON.stringify({ coordinatorUrl: coordinator.url, ...input }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", (code, signal) => {
      if (signal === "SIGKILL") {
        let crashed: string | undefined;
        try { crashed = (JSON.parse(stdout) as ChildOutcome).crashed; } catch { /* the kill can pre-empt the write */ }
        return resolveChild({ ok: true, crashed: crashed ?? "unknown", signal });
      }
      if (code !== 0) return rejectChild(new Error(`worker exited ${code}: ${stderr || stdout}`));
      try { resolveChild({ ...(JSON.parse(stdout) as ChildOutcome), signal }); }
      catch { rejectChild(new Error(`worker returned non-JSON output: ${stdout}\n${stderr}`)); }
    });
  });
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { await access(path); return; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 10)); }
  }
  throw new Error(`worker did not reach the barrier: ${path}`);
}

/** Start every worker, hold them at a barrier until all are loaded, release together. */
async function collide(workers: Array<Record<string, unknown>>): Promise<ChildOutcome[]> {
  const barrier = join(sandbox, `barrier-${Math.random().toString(36).slice(2)}`);
  await mkdir(barrier, { recursive: true });
  const goPath = join(barrier, "go");
  const readyPaths = workers.map((_, index) => join(barrier, `worker-${index}`));
  const results = workers.map((worker, index) => runWorker({ ...worker, readyPath: readyPaths[index], goPath }));
  await Promise.all(readyPaths.map(waitFor));
  await writeFile(goPath, "go", "utf8");
  return Promise.all(results);
}

const SUBMISSION_ID = "aqua_sub_durableprocess000001";

function reply(outcome: ChildOutcome, label: string): { status: number; body: Record<string, any> } {
  assert.equal(outcome.ok, true, `${label}: ${outcome.error}`);
  return outcome.result;
}

function effectCounts() {
  const counts: Record<string, number> = {};
  for (const effect of model.dump().effects as Array<{ name: string }>) counts[effect.name] = (counts[effect.name] ?? 0) + 1;
  return counts;
}

function theOneEnquiry() {
  const rows = model.dump().enquiries as Array<Record<string, any>>;
  assert.equal(rows.length, 1, `one browser submission must have one row (got ${rows.length})`);
  return rows[0];
}

before(async () => {
  fixture = await import("./fixtures/aqua-tag-ingestion-worker.mjs");
  model = fixture.createSubmissionStoreModel();
  coordinator = await fixture.startCoordinator(model);
});

beforeEach(() => { model.reset(); });

after(async () => {
  await coordinator?.close();
  await rm(sandbox, { recursive: true, force: true });
});

describe("real-process Aqua Tag ingestion durability", () => {
  it("the tag and the host form arriving at once from two processes produce one enquiry and one effect set", async () => {
    const [held, accepted] = await collide([
      { action: "capture", submissionId: SUBMISSION_ID, label: "tag" },
      { action: "brand", submissionId: SUBMISSION_ID, label: "host" },
    ]);
    assert.equal(reply(held, "tag").status, 200);
    assert.equal(reply(accepted, "host").status, 200);
    assert.equal(reply(accepted, "host").body.boundary, "database");
    assert.equal(reply(accepted, "host").body.submissionId, SUBMISSION_ID);
    const row = theOneEnquiry();
    assert.equal(row.consent, true);
    assert.equal(row.metadata.submissionId, SUBMISSION_ID);
    assert.ok(row.metadata.formCapture);
    assert.equal(row.metadata.ingestionState, "complete");
    assert.deepEqual(effectCounts(), { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
    assert.equal(model.submission(fixture.AGENCY_ID, SUBMISSION_ID)?.work_status, "complete");
  });

  it("a double-submitted host form from two processes ingests once; the other is a replay that claims no delivery it did not do", async () => {
    const outcomes = await collide([
      { action: "brand", submissionId: SUBMISSION_ID, label: "first" },
      { action: "brand", submissionId: SUBMISSION_ID, label: "second" },
    ]);
    const replies = outcomes.map((outcome, index) => reply(outcome, `brand ${index}`));
    assert.deepEqual(replies.map(entry => entry.status), [200, 200]);
    const deduped = replies.filter(entry => entry.body.deduped === true);
    assert.equal(deduped.length, 1, "exactly one of the two is a replay");
    // Whichever process wins the CLAIM runs the delivery and reports it
    // complete; the other saw work it did not do and may only say pending.
    assert.equal(replies.filter(entry => entry.body.delivery === "complete").length, 1, "exactly one process delivered");
    assert.ok(replies.every(entry => ["complete", "pending"].includes(entry.body.delivery)), "nobody may claim more than it saw");
    theOneEnquiry();
    assert.equal(theOneEnquiry().metadata.ingestionState, "complete");
    assert.deepEqual(effectCounts(), { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
  });

  it("a process killed after sending the notification and before acknowledging it is finished by a later sweep without a second send", async () => {
    const crashed = await runWorker({ action: "brand", submissionId: SUBMISSION_ID, crashAfterEffect: "notification" });
    assert.equal(crashed.signal, "SIGKILL", "the worker must have died, not returned");
    assert.equal(effectCounts().notification, 1);
    const leased = model.submission(fixture.AGENCY_ID, SUBMISSION_ID)!;
    assert.equal(leased.work_status, "processing", "the dead owner's lease is still held");
    assert.equal(leased.effects.notification?.status, "attempted");

    const early = reply(await runWorker({ action: "sweep" }), "early sweep");
    assert.equal(early.claimed, 0, "a live lease is not stolen");

    model.advanceClock(91_000);
    const sweep = reply(await runWorker({ action: "sweep" }), "recovery sweep");
    assert.equal(sweep.claimed, 1);
    assert.equal(sweep.completed, 1);
    const counts = effectCounts();
    assert.equal(counts.notification, 1, "never sent twice");
    assert.equal(counts.automation, 1, "the step after the crash runs exactly once, in the recovering process");
    assert.equal(counts.lead, 1, "checkpointed steps are not repeated");
    const row = theOneEnquiry();
    assert.equal(row.metadata.ingestionState, "complete");
    assert.equal(row.metadata.notification, "unknown", "the row must not claim the email was sent");
    assert.equal(model.submission(fixture.AGENCY_ID, SUBMISSION_ID)?.work_status, "complete");
  });

  it("two sweeps racing for one expired claim: exactly one wins, and the stale owner's settle is refused", async () => {
    // Enqueue without running: the inline claim fails once inside the request.
    model.injectFault({ target: "rpc:claim_aqua_tag_submission_work", mode: "error" });
    const pending = reply(await runWorker({ action: "brand", submissionId: SUBMISSION_ID }), "enqueue");
    assert.equal(pending.body.delivery, "pending");

    const stale = reply(await runWorker({ action: "claim", owner: "stale-owner", leaseMs: 1_000, tenantScope: fixture.AGENCY_ID, submissionId: SUBMISSION_ID }), "stale claim");
    assert.equal(stale.length, 1);
    model.advanceClock(1_500);

    const racers = await collide([
      { action: "claim", owner: "racer-a", leaseMs: 90_000, tenantScope: fixture.AGENCY_ID, submissionId: SUBMISSION_ID },
      { action: "claim", owner: "racer-b", leaseMs: 90_000, tenantScope: fixture.AGENCY_ID, submissionId: SUBMISSION_ID },
    ]);
    const claimed = racers.map((outcome, index) => reply(outcome, `racer ${index}`));
    assert.equal(claimed.flat().length, 1, "exactly one process may hold the reclaimed lease");
    const winner = claimed.flat()[0];

    const refused = reply(await runWorker({ action: "settle", claim: stale[0], outcome: "complete", metadataPatch: { ingestionState: "complete" } }), "stale settle");
    assert.equal(refused.settled, false);
    assert.equal(refused.reason, "lease_lost");
    assert.equal(theOneEnquiry().metadata.ingestionState, "processing");

    const accepted = reply(await runWorker({ action: "settle", claim: winner, outcome: "complete", metadataPatch: { ingestionState: "complete" } }), "live settle");
    assert.equal(accepted.settled, true);
    assert.equal(model.submission(fixture.AGENCY_ID, SUBMISSION_ID)?.work_status, "complete");
    assert.equal(theOneEnquiry().metadata.ingestionState, "complete");
  });

  it("a persistently failing step is retried by separate sweeps up to the bound and then dead-lettered with a safe error", async () => {
    const first = reply(await runWorker({ action: "brand", submissionId: SUBMISSION_ID, failLead: true }), "first attempt");
    assert.equal(first.body.ok, true);
    assert.equal(first.body.delivery, "pending");
    model.setMaxAttempts(fixture.AGENCY_ID, SUBMISSION_ID, 3);
    assert.equal(model.submission(fixture.AGENCY_ID, SUBMISSION_ID)?.attempts, 1);

    model.advanceClock(3_600_000);
    const second = reply(await runWorker({ action: "sweep", failLead: true }), "second attempt");
    assert.equal(second.claimed, 1);
    assert.equal(second.retried, 1);
    assert.equal(model.submission(fixture.AGENCY_ID, SUBMISSION_ID)?.work_status, "pending");

    model.advanceClock(3_600_000);
    const third = reply(await runWorker({ action: "sweep", failLead: true }), "third attempt");
    assert.equal(third.claimed, 1);
    assert.equal(third.dead, 1);
    const row = model.submission(fixture.AGENCY_ID, SUBMISSION_ID)!;
    assert.equal(row.work_status, "dead");
    assert.equal(row.state, "dead-letter");
    assert.match(String(row.last_error), /^lead: lead store unavailable/);
    assert.doesNotMatch(String(row.last_error), /sk_live|at somewhere/);
    const enquiry = theOneEnquiry();
    assert.equal(enquiry.metadata.deliveryState, "dead-letter");
    assert.equal(enquiry.metadata.ingestionState, "failed");
    assert.deepEqual(effectCounts(), {}, "nothing downstream of the failing first step ran on any attempt, in any process");

    model.advanceClock(3_600_000);
    assert.equal(reply(await runWorker({ action: "sweep" }), "after dead-letter").claimed, 0, "dead-letter is terminal");
  });
});
