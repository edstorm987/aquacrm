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

function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", CONSOLE, ...args], {
    cwd: join(HERE, ".."),
    encoding: "utf8",
    env: { ...process.env, PORTAL_BACKEND: "memory", NODE_OPTIONS: "--conditions react-server" },
    timeout: 30_000,
  });
}

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
