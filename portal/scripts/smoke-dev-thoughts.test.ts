import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Ed's thought channel — the reply channel between the Dev Console and the
// workers. It had ZERO tests, which is why every one of these defects survived:
// a general note being consumed by the first worker to --ack, two writers
// splicing each other's JSON, and a row cap that dropped thoughts nobody had
// read yet. It also hardcoded `.data/dev-thoughts.json`, so no test could run
// without writing Ed's real ledger — hence `DEV_THOUGHTS_FILE`.

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("./worker-thoughts.mjs", import.meta.url));

async function ledger(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dev-thoughts-"));
  const file = join(dir, "dev-thoughts.json");
  process.env.DEV_THOUGHTS_FILE = file;
  return file;
}

async function seed(file: string, rows: unknown[]): Promise<void> {
  await writeFile(file, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

async function rowsOf(file: string): Promise<any[]> {
  return JSON.parse(await readFile(file, "utf8"));
}

/** Drive the real worker script the way a worker does. */
function worker(file: string, args: string[]) {
  return run(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, DEV_THOUGHTS_FILE: file },
  });
}

// ---- the channel works at all ----------------------------------------------

test("a thought round-trips: post, list, group by task", async () => {
  const file = await ledger();
  const { addThought, listThoughts, thoughtsByTask } = await import("../src/lib/server/dev/devTeamThoughts");

  const posted = await addThought({ text: "  check the  gate ", author: "Ed", taskId: "plan-a#2", planName: "plan-a" });
  assert.equal(posted.text, "check the gate");

  const listed = await listThoughts();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, posted.id);

  const byTask = await thoughtsByTask();
  assert.deepEqual(Object.keys(byTask), ["plan-a#2"]);
  assert.equal(byTask["plan-a#2"][0].text, "check the gate");
  assert.equal(await rowsOf(file).then(r => r.length), 1);
});

// ---- a general note belongs to EVERY worker --------------------------------
//
// The default path. `worker` is only set when a check-in is live on that exact
// phase, so almost every thought Ed leaves is general — and one global
// acknowledgement stamp let the first worker to run --ack consume it for all
// the others. The intended reader never saw it.

test("a general note stays unread for the workers who have not read it", async () => {
  await ledger();
  const { addThought, acknowledge, unreadFor } = await import("../src/lib/server/dev/devTeamThoughts");

  const t = await addThought({ text: "everyone: stop using pnpm", author: "Ed" });
  assert.equal((await unreadFor("alpha")).length, 1);
  assert.equal((await unreadFor("bravo")).length, 1);

  assert.equal(await acknowledge([t.id], "bravo"), 1);

  assert.equal((await unreadFor("bravo")).length, 0, "the worker who read it is done");
  assert.equal((await unreadFor("alpha")).length, 1, "bravo must not consume alpha's copy");
});

test("a thought aimed at one worker reaches only that worker", async () => {
  await ledger();
  const { addThought, unreadFor } = await import("../src/lib/server/dev/devTeamThoughts");
  await addThought({ text: "yours alone", author: "Ed", worker: "Alpha" });
  assert.equal((await unreadFor("alpha")).length, 1, "case-insensitive match on the worker name");
  assert.equal((await unreadFor("bravo")).length, 0);
});

test("acknowledging twice as the same worker does not double-count", async () => {
  await ledger();
  const { addThought, acknowledge } = await import("../src/lib/server/dev/devTeamThoughts");
  const t = await addThought({ text: "once", author: "Ed" });
  assert.equal(await acknowledge([t.id], "alpha"), 1);
  assert.equal(await acknowledge([t.id], "alpha"), 0);
});

test("the badge counts thoughts NOBODY has picked up", async () => {
  await ledger();
  const { addThought, acknowledge, unacknowledgedCount } = await import("../src/lib/server/dev/devTeamThoughts");
  const a = await addThought({ text: "one", author: "Ed" });
  await addThought({ text: "two", author: "Ed" });
  assert.equal(await unacknowledgedCount(), 2);
  await acknowledge([a.id], "alpha");
  assert.equal(await unacknowledgedCount(), 1);
});

test("a ledger written before per-reader acknowledgement still reads correctly", async () => {
  const file = await ledger();
  await seed(file, [
    { id: "th_old", at: 1, author: "Ed", text: "legacy", acknowledgedBy: "alpha", acknowledgedAt: 2 },
    { id: "th_new", at: 3, author: "Ed", text: "unread" },
  ]);
  const { unreadFor, unacknowledgedCount } = await import("../src/lib/server/dev/devTeamThoughts");
  assert.deepEqual((await unreadFor("alpha")).map(t => t.id), ["th_new"]);
  assert.equal(await unacknowledgedCount(), 1);
});

// ---- two writers, one file --------------------------------------------------

test("concurrent posts ALL land — none is overwritten by the next", async () => {
  const file = await ledger();
  const { addThought } = await import("../src/lib/server/dev/devTeamThoughts");

  const posted = await Promise.all(
    Array.from({ length: 25 }, (_, i) => addThought({ text: `note ${i}`, author: "Ed" })),
  );
  const rows = await rowsOf(file);
  assert.equal(rows.length, 25, "read-modify-write must be serialised, not interleaved");
  assert.equal(new Set(rows.map(r => r.id)).size, 25, "ids must be unique");
  assert.equal(new Set(posted.map(p => p.id)).size, 25);
});

test("ids stay unique when the ledger is already at the cap", async () => {
  const file = await ledger();
  await seed(file, Array.from({ length: 500 }, (_, i) => ({
    id: `seed${i}`, at: i, author: "Ed", text: `seed ${i}`, readBy: { alpha: 1 },
  })));
  const { addThought } = await import("../src/lib/server/dev/devTeamThoughts");
  const posted = await Promise.all(
    Array.from({ length: 5 }, (_, i) => addThought({ text: `late ${i}`, author: "Ed" })),
  );
  assert.equal(new Set(posted.map(p => p.id)).size, 5,
    "the old id folded in rows.length, which stops moving at the cap");
});

test("the worker script and the console never leave the ledger unparseable", async () => {
  const file = await ledger();
  const { addThought } = await import("../src/lib/server/dev/devTeamThoughts");

  // A ledger big enough that a write takes several flushes. The corruption
  // this pins needs exactly that: a shorter write truncating the file while a
  // longer one is still streaming, so the tail of the long write lands past
  // the end of the short one — valid JSON followed by trailing garbage, which
  // readAll() then reported as an empty ledger.
  await seed(file, Array.from({ length: 300 }, (_, i) => ({
    id: `seed${i}`, at: 1000 - i, author: "Ed", text: `seed ${i} `.padEnd(1500, "x"),
  })));

  for (let round = 0; round < 6; round++) {
    await Promise.all([
      worker(file, ["alpha", "--ack"]).catch(() => undefined),
      addThought({ text: `racing ${round}`, author: "Ed" }),
    ]);
    const rows = await rowsOf(file);
    assert.ok(Array.isArray(rows), `round ${round} left the ledger unparseable`);
    assert.ok(rows.length >= 300, `round ${round} truncated the ledger to ${rows.length} rows`);
  }
  const left = (await readdir(join(file, ".."))).filter(n => n.endsWith(".tmp"));
  assert.deepEqual(left, [], "atomic writes must not leave temp files behind");
});

// ---- a ledger we cannot read is never overwritten ---------------------------

test("a damaged ledger is left alone, not replaced with one row", async () => {
  const file = await ledger();
  const damaged = '[\n  {\n    "id": "th_1", "at": 1, "author": "Ed", "text": "keep me"\n  }\n]\n  }\n]\n';
  await writeFile(file, damaged, "utf8");
  const { addThought, unreadFor } = await import("../src/lib/server/dev/devTeamThoughts");

  await assert.rejects(() => addThought({ text: "this must not land", author: "Ed" }), /not readable JSON/i);
  await assert.rejects(() => unreadFor("alpha"), /not readable JSON/i);
  assert.equal(await readFile(file, "utf8"), damaged, "the damaged ledger must be untouched");
});

test("a missing ledger is a legitimate empty, not an error", async () => {
  await ledger(); // the file is never created
  const { listThoughts, unacknowledgedCount, unreadFor } = await import("../src/lib/server/dev/devTeamThoughts");
  assert.deepEqual(await listThoughts(), []);
  assert.equal(await unacknowledgedCount(), 0);
  assert.deepEqual(await unreadFor("alpha"), []);
});

// ---- the cap never destroys undelivered work --------------------------------

test("at the cap, an UNREAD thought is kept and a read one is archived", async () => {
  const file = await ledger();
  await seed(file, Array.from({ length: 500 }, (_, i) => ({
    id: `seed${i}`, at: 1000 - i, author: "Ed", text: `seed ${i}`, worker: "alpha",
  })));
  const { addThought, unreadFor } = await import("../src/lib/server/dev/devTeamThoughts");

  await addThought({ text: "the newest", author: "Ed", worker: "alpha" });

  const rows = await rowsOf(file);
  assert.ok(rows.some(r => r.id === "seed499"),
    "the oldest thought was unread — dropping it destroys instructions nobody has seen");
  assert.equal((await unreadFor("alpha")).length, 501);
  assert.equal(rows.length, 501, "the cap yields to undelivered work");
});

test("read rows are the ones evicted at the cap, and they are archived", async () => {
  const file = await ledger();
  await seed(file, Array.from({ length: 500 }, (_, i) => ({
    id: `seed${i}`, at: 1000 - i, author: "Ed", text: `seed ${i}`,
    // The three oldest have been picked up; everything newer has not.
    readBy: i >= 497 ? { alpha: 5 } : undefined,
  })));
  const { addThought } = await import("../src/lib/server/dev/devTeamThoughts");
  await addThought({ text: "the newest", author: "Ed" });

  const rows = await rowsOf(file);
  assert.equal(rows.length, 500);
  assert.ok(!rows.some(r => r.id === "seed499"), "the oldest READ row is the one to go");
  assert.ok(rows.some(r => r.id === "seed496"), "an unread row is never evicted");

  const archive = await readFile(file.replace(/\.json$/, ".archive.jsonl"), "utf8");
  assert.match(archive, /"id": ?"seed499"|"id":"seed499"/, "an evicted thought is archived, not deleted");
});

test("ledgerPressure reports the backlog honestly", async () => {
  await ledger();
  const { addThought, acknowledge, ledgerPressure } = await import("../src/lib/server/dev/devTeamThoughts");
  const a = await addThought({ text: "one", author: "Ed" });
  await addThought({ text: "two", author: "Ed" });
  await acknowledge([a.id], "alpha");
  assert.deepEqual(await ledgerPressure(), { rows: 2, unread: 1, max: 500, full: false });
});

// ---- the script and the module must agree -----------------------------------
//
// `worker-thoughts.mjs` runs under plain node and cannot import the TypeScript
// module, so it reimplements the unread rule and the acknowledgement write.
// Two copies of one rule drift; this is the test that catches it.

test("the worker script picks up exactly what unreadFor says it should", async () => {
  const file = await ledger();
  const { addThought, unreadFor } = await import("../src/lib/server/dev/devTeamThoughts");
  await addThought({ text: "for alpha only", author: "Ed", worker: "alpha" });
  await addThought({ text: "for everybody", author: "Ed" });
  await addThought({ text: "for bravo only", author: "Ed", worker: "bravo" });

  const shown = await worker(file, ["bravo"]);
  assert.match(shown.stdout, /2 thoughts waiting for "bravo"/);
  assert.equal((await unreadFor("bravo")).length, 2);
  assert.ok(!shown.stdout.includes("for alpha only"));
});

test("the worker script acknowledges per reader, like the module does", async () => {
  const file = await ledger();
  const { addThought, unreadFor, unacknowledgedCount } = await import("../src/lib/server/dev/devTeamThoughts");
  await addThought({ text: "for everybody", author: "Ed" });

  await worker(file, ["bravo", "--ack"]);

  assert.equal((await unreadFor("bravo")).length, 0, "bravo has read it");
  assert.equal((await unreadFor("alpha")).length, 1, "alpha has not — the note was addressed to everyone");
  assert.equal(await unacknowledgedCount(), 0, "somebody has picked it up, so the badge clears");

  const again = await worker(file, ["bravo"]);
  assert.match(again.stdout, /Nothing waiting for "bravo"/);
  const alpha = await worker(file, ["alpha"]);
  assert.match(alpha.stdout, /1 thought waiting for "alpha"/);
  assert.match(alpha.stdout, /also read by bravo/);
});

test("the worker script refuses to write over a damaged ledger", async () => {
  const file = await ledger();
  const damaged = '[{"id":"th_1","at":1,"author":"Ed","text":"keep me"}]\n]\n';
  await writeFile(file, damaged, "utf8");
  await assert.rejects(() => worker(file, ["alpha", "--ack"]), /damaged/i);
  assert.equal(await readFile(file, "utf8"), damaged);
});

// ---- the route stays behind the founder gate --------------------------------

test("the thoughts route keeps the shared founder-only Dev Team gate", async () => {
  const { PROJECT_ROOT } = await import("../src/lib/server/dev/devDocs");
  const source = await readFile(join(PROJECT_ROOT, "src/app/api/portal/dev-team/thoughts/route.ts"), "utf8");
  assert.match(source, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/, "the route must require an agency role");
  assert.match(source, /devDocsAccessible\(session\)/, "the route must check Dev Mode access");
  assert.match(source, /error: "not_found".*status: 404/s, "a refused caller must not learn the route exists");
  for (const handler of ["export async function GET", "export async function POST"]) {
    assert.ok(source.includes(handler), `${handler} must stay gated by gate()`);
  }
  assert.equal((source.match(/await gate\(\)/g) ?? []).length, 2, "every handler goes through the gate");
});
