// Run this test file WITHOUT the suite's `--conditions react-server`.
//
// `react-dom/server` refuses to load under that condition — "react-dom/server
// is not supported in React Server Components" — so any test whose whole point
// is rendering components to HTML cannot run in the same process as the rest of
// the suite. Two files were failing for exactly this reason and for no other:
// both pass immediately when the condition is dropped.
//
// The tempting fix is to move them out of `smoke:all` into their own script.
// That is worse than the failure: a test nobody runs looks identical to a test
// that passes, and the canonical command in CLAUDE.md would stop covering them.
//
// So instead: if we are under `react-server`, re-exec THIS SAME FILE in a child
// with the condition stripped, forward the child's TAP output verbatim, and
// exit with its code. The suite sees one file and one honest result, and the
// assertions genuinely ran.
//
// **Import this FIRST**, before anything that reaches for `react-dom/server`.
// ES module imports are evaluated in source order, so a first-position import
// whose body exits the process stops evaluation before the offending import is
// ever resolved. (Same reason `dev-console-request-scope` has to come first.)

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const CHILD_MARKER = "AQUA_CLIENT_RENDER_CHILD";

function underReactServer(): boolean {
  const pattern = /--conditions[= ]?react-server/;
  return pattern.test(process.env.NODE_OPTIONS ?? "")
    || process.execArgv.some(arg => pattern.test(arg));
}

if (underReactServer() && !process.env[CHILD_MARKER]) {
  const entry = process.argv[1];
  const env: NodeJS.ProcessEnv = { ...process.env, [CHILD_MARKER]: "1" };

  // Strip the condition from BOTH places it can arrive: the env var the suite
  // sets, and any exec argv this process was started with.
  const nodeOptions = (env.NODE_OPTIONS ?? "").replace(/--conditions[= ]?react-server/g, "").trim();
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;

  // The child must NOT be started with `--test`, and must not inherit the
  // parent's test context. Both make node:test decide it is already inside a
  // run and answer "run() is being called recursively ... skipping running
  // files" — which prints a passing TAP line for a file whose assertions never
  // executed. A test that passes without running is worse than one that fails.
  // Without `--test`, the `test()` calls in the file register and run on import
  // and print their own TAP, which is exactly what gets forwarded.
  delete env.NODE_TEST_CONTEXT;

  const require_ = createRequire(import.meta.url);
  const tsxCli = require_.resolve("tsx/cli");

  const child = spawnSync(process.execPath, [tsxCli, entry], {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  // Forward the child's TAP unchanged — the parent must print the child's
  // result and nothing of its own, or the runner sees two nested reports.
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  process.exit(child.status ?? 1);
}
