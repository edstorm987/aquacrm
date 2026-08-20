// Worker tooling — the primitives the whole parallel-worker plan rests on.
//
// `fork-sandbox.mjs` and `worker-checkin.mjs` had ZERO coverage: a full green
// suite said nothing about either. That matters most for fork-sandbox, whose
// entire promise is "your server writes ONLY here; the shared sandbox is
// untouched" — invert one `copyFileSync` argument and the next worker to fork
// overwrites Ed's shared state at the exact moment the script promises it
// cannot happen, with the suite still reporting green.
//
// Every case runs the REAL script as a child process against a throwaway temp
// root, so nothing here can reach the repo's own `.data/`.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const FORK = join(SCRIPTS, "fork-sandbox.mjs");
const CHECKIN = join(SCRIPTS, "worker-checkin.mjs");

const SHARED_BYTES = JSON.stringify({ agencies: [{ id: "a1", name: "Ed's real sandbox" }] }, null, 2) + "\n";

/** A throwaway project root with its own `.data/`. Never the repo's. */
function tempRoot(withShared = true): string {
  const root = mkdtempSync(join(tmpdir(), "aqua-worker-tooling-"));
  mkdirSync(join(root, ".data"), { recursive: true });
  if (withShared) writeFileSync(join(root, ".data", "portal-state.json"), SHARED_BYTES, "utf8");
  return root;
}

function run(script: string, args: string[], cwd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" }) };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("sandbox:fork — isolation is the whole product", () => {
  it("copies shared → own and leaves the shared file byte-identical", () => {
    const root = tempRoot();
    const shared = join(root, ".data", "portal-state.json");
    const before = readFileSync(shared, "utf8");

    const { ok, out } = run(FORK, ["alpha", "3041"], root);
    assert.equal(ok, true, out);

    const mine = join(root, ".data", "portal-state.alpha.json");
    assert.ok(existsSync(mine), "the worker must get its own state file");
    assert.equal(readFileSync(mine, "utf8"), SHARED_BYTES, "the fork starts from REAL seeded data");
    assert.equal(readFileSync(shared, "utf8"), before, "the shared sandbox must not be touched");
    assert.match(out, /Forked the shared sandbox/);
  });

  it("never writes over the shared file, whatever the worker's copy says", () => {
    const root = tempRoot();
    const shared = join(root, ".data", "portal-state.json");
    run(FORK, ["alpha"], root);

    // The worker's server writes to its own file. Re-forking must not push that
    // back into the shared sandbox — the inverted-copy failure mode.
    writeFileSync(join(root, ".data", "portal-state.alpha.json"), '{"agencies":[]}\n', "utf8");
    run(FORK, ["alpha"], root);
    assert.equal(readFileSync(shared, "utf8"), SHARED_BYTES, "the shared sandbox is still Ed's");
  });

  it("reuses an existing sandbox rather than re-copying over the worker's state", () => {
    const root = tempRoot();
    const mine = join(root, ".data", "portal-state.alpha.json");
    run(FORK, ["alpha"], root);

    const worked = '{"agencies":[{"id":"a1","name":"work in progress"}]}\n';
    writeFileSync(mine, worked, "utf8");
    const { ok, out } = run(FORK, ["alpha"], root);

    assert.equal(ok, true, out);
    assert.match(out, /Reusing existing sandbox/);
    assert.equal(readFileSync(mine, "utf8"), worked, "a re-fork must not discard the worker's own state");
  });

  it("starts empty, not broken, when there is no shared sandbox yet", () => {
    const root = tempRoot(false);
    const { ok, out } = run(FORK, ["alpha"], root);
    assert.equal(ok, true, out);
    assert.match(out, /No shared sandbox found/);
    assert.ok(!existsSync(join(root, ".data", "portal-state.json")), "and it does not invent one");
  });

  it("prints the three things that actually isolate the process", () => {
    const root = tempRoot();
    const { out } = run(FORK, ["Codex Alpha", "3055"], root);
    assert.match(out, /PORTAL_DATA_FILE=\.data\/portal-state\.codex-alpha\.json/);
    assert.match(out, /NEXT_DIST_DIR=\.next-codex-alpha/);
    assert.match(out, /-p 3055/);
    assert.ok(existsSync(join(root, ".data", "portal-state.codex-alpha.json")), "the name is slugged into the filename");
  });

  it("refuses a name or port it cannot make safe", () => {
    const root = tempRoot();
    assert.equal(run(FORK, [], root).ok, false, "no name");
    assert.equal(run(FORK, ["***"], root).ok, false, "a name that slugs to nothing");
    assert.equal(run(FORK, ["alpha", "80"], root).ok, false, "a privileged port");
    assert.equal(run(FORK, ["alpha", "99999"], root).ok, false, "an out-of-range port");
    // Nothing was created for any of them.
    assert.ok(!existsSync(join(root, ".data", "portal-state.alpha.json")));
  });

  it("cannot escape .data/ through the worker name", () => {
    const root = tempRoot();
    const { out } = run(FORK, ["../../etc/passwd"], root);
    assert.ok(!out.includes("/etc/passwd"), out);
    assert.ok(existsSync(join(root, ".data", "portal-state.etc-passwd.json")),
      "the name is sanitised into one flat filename inside .data/");
  });
});

describe("worker:checkin — the name the board will show", () => {
  const readCheckIn = (root: string, file: string) =>
    JSON.parse(readFileSync(join(root, ".data", "workers", file), "utf8")) as {
      name: string; status: string; plan?: string; phase?: string; at: number;
    };

  it("slugs the name into the filename the board reads", () => {
    const root = tempRoot();
    const { ok, out } = run(CHECKIN, ["Codex Alpha", "building phase 2"], root);
    assert.equal(ok, true, out);

    const payload = readCheckIn(root, "codex-alpha.json");
    assert.equal(payload.name, "codex-alpha", "the stored name matches the filename");
    assert.equal(payload.status, "building phase 2");
    assert.ok(Date.now() - payload.at < 60_000, "stamped now");
    assert.match(out, /checked in as "codex-alpha"/);
  });

  it("records plan and phase for the board to join on", () => {
    const root = tempRoot();
    run(CHECKIN, ["alpha", "on it", "--plan", "enquiry-detail-card", "--phase", "P2"], root);
    const payload = readCheckIn(root, "alpha.json");
    assert.equal(payload.plan, "enquiry-detail-card");
    assert.equal(payload.phase, "P2");
    assert.equal(payload.status, "on it", "the flags are removed from the status text");
  });

  it("re-checking in overwrites the same file rather than piling up", () => {
    const root = tempRoot();
    run(CHECKIN, ["alpha", "starting"], root);
    run(CHECKIN, ["alpha", "phase 3 green"], root);
    assert.equal(readCheckIn(root, "alpha.json").status, "phase 3 green");
  });

  it("--done is the check-OUT the channel was missing", async () => {
    const { isCheckInActive } = await import("../src/lib/server/dev/devTeamWorkers");
    const root = tempRoot();
    run(CHECKIN, ["alpha", "suite green, handing back", "--done"], root);

    const payload = readCheckIn(root, "alpha.json");
    assert.equal(payload.phase, "done");
    assert.equal(payload.status, "suite green, handing back", "--done is not swallowed into the status");
    assert.equal(isCheckInActive(payload), false, "a signed-off worker stops reading as live immediately");

    // …and without it, the same fresh check-in is live.
    run(CHECKIN, ["beta", "still building"], root);
    assert.equal(isCheckInActive(readCheckIn(root, "beta.json")), true);
  });

  it("clamps what it writes so a runaway status cannot bloat the board", () => {
    const root = tempRoot();
    run(CHECKIN, ["alpha", "x".repeat(500), "--plan", "p".repeat(500), "--phase", "f".repeat(500)], root);
    const payload = readCheckIn(root, "alpha.json");
    assert.equal(payload.status.length, 200);
    assert.equal(payload.plan?.length, 120);
    assert.equal(payload.phase?.length, 80);
  });

  it("refuses a name it cannot slug, and writes nothing", () => {
    const root = tempRoot();
    assert.equal(run(CHECKIN, [], root).ok, false);
    assert.equal(run(CHECKIN, ["***", "hello"], root).ok, false);
    assert.ok(!existsSync(join(root, ".data", "workers")), "no directory, no half-written file");
  });

  it("agrees with fork-sandbox on what a worker is called", () => {
    // The two scripts are two halves of one identity. If they slug differently,
    // a worker's sandbox and its board row stop lining up.
    const root = tempRoot();
    run(CHECKIN, ["Codex Alpha", "on it"], root);
    run(FORK, ["Codex Alpha"], root);
    assert.ok(existsSync(join(root, ".data", "workers", "codex-alpha.json")));
    assert.ok(existsSync(join(root, ".data", "portal-state.codex-alpha.json")));
  });

  it("writes only inside .data/, never up the tree", () => {
    const root = tempRoot();
    const before = statSync(join(root, ".data", "portal-state.json")).mtimeMs;
    run(CHECKIN, ["alpha", "on it"], root);
    assert.equal(statSync(join(root, ".data", "portal-state.json")).mtimeMs, before,
      "a check-in must never touch the state file");
  });
});
