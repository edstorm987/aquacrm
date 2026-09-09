// Operator security console — the runnable incident controls the runbooks name.
// Guarantees: mutating commands are DRY-RUN by default (no --commit → no
// mutation), and required metadata (actor/reason) is enforced.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONSOLE = join(HERE, "security-console.ts");

// Run the DOCUMENTED command verbatim — NO hidden NODE_OPTIONS. The launcher
// must self-provide `--conditions react-server` (else `server-only` throws).
function run(args: string[]) {
  const env = { ...process.env, PORTAL_BACKEND: "memory" };
  delete env.NODE_OPTIONS;
  return spawnSync(process.execPath, ["--import", "tsx", CONSOLE, ...args], {
    cwd: join(HERE, ".."),
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
}

test("the documented command works with NO NODE_OPTIONS (launcher self-provides the condition)", () => {
  const status = run(["status"]);
  assert.equal(status.status, 0, `status should exit 0; stderr: ${status.stderr}`);
  assert.doesNotMatch(status.stderr, /server-only|cannot be imported/i);
  assert.match(status.stdout, /"globalEpoch"/);
});

test("a --commit mutation reads back and reports the persisted state", () => {
  const frozen = run(["freeze", "--actor", "ops", "--reason", "console read-back test", "--commit"]);
  assert.equal(frozen.status, 0, `freeze --commit should exit 0; stderr: ${frozen.stderr}`);
  assert.match(frozen.stderr, /Global read-only ON\./);
  assert.doesNotMatch(frozen.stderr, /FAILED/);
});

test("a mutating command without --commit is a DRY RUN and mutates nothing", () => {
  const freeze = run(["freeze", "--actor", "ops", "--reason", "drill"]);
  assert.equal(freeze.status, 0);
  assert.match(freeze.stderr, /DRY RUN/);
  // State is unchanged: status still shows no global read-only.
  const status = run(["status"]);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /"globalReadOnly":\s*null/);
});

test("mutating commands require an actor and a reason", () => {
  assert.match(run(["freeze", "--reason", "x", "--commit"]).stderr, /--actor .* required/);
  assert.match(run(["freeze", "--actor", "ops", "--commit"]).stderr, /--reason .* required/);
});

test("an unknown command fails loudly", () => {
  const r = run(["definitely-not-a-command"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown command/);
});
