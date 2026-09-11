#!/usr/bin/env node
// Deterministic canonical-suite enumerator + runner.
//
// WHY THIS EXISTS: `smoke:all` used to be
//   node --test scripts/*.test.ts 'src/built-ins/modules/!(website-editor)/src/__smoke__/*.test.ts'
// which depends on the SHELL to expand the globs. The `!(...)` extglob is off by
// default in a non-interactive bash (GitHub's runner shell), where it is a hard
// SYNTAX ERROR — so `npm run smoke:all` died before a single test ran, and CI's
// "canonical suite" step was red for a reason unrelated to any test. Locally it
// only worked for operators whose shell had extglob enabled. Test discovery must
// not depend on shell dialect.
//
// This enumerates the exact same file set in Node (cross-platform, shell-
// independent), FAILS LOUDLY if either expected group is empty (so a discovery
// regression can never masquerade as a green short run), prints the counts, and
// execs the node test runner over the explicit file list. The Website Editor
// module smokes are run by their own gate (`smoke:website-editor`) and are
// deliberately excluded here — kept as a separate, explicit required lane.

import { readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL = join(HERE, "..");

export const EXCLUDED_MODULES = new Set(["website-editor"]);

function testFilesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith(".test.ts"))
    .map(name => join(dir, name))
    .sort();
}

/**
 * Pure discovery — enumerate the exact canonical file set in Node so the same
 * logic the runner uses is also assertable by the coverage meta-test, without
 * spawning 600+ tests. `problems` is non-empty iff a fail-closed group is empty.
 */
export function discoverCanonicalTests(portalRoot = PORTAL) {
  const scriptsDir = join(portalRoot, "scripts");
  const scriptTests = testFilesIn(scriptsDir);

  const modulesRoot = join(portalRoot, "src", "built-ins", "modules");
  const moduleTests = [];
  const includedModules = [];
  if (existsSync(modulesRoot)) {
    for (const mod of readdirSync(modulesRoot).sort()) {
      if (EXCLUDED_MODULES.has(mod)) continue;
      const smokeDir = join(modulesRoot, mod, "src", "__smoke__");
      if (!existsSync(smokeDir) || !statSync(smokeDir).isDirectory()) continue;
      const found = testFilesIn(smokeDir);
      if (found.length > 0) {
        moduleTests.push(...found);
        includedModules.push(`${mod}(${found.length})`);
      }
    }
  }

  const problems = [];
  if (scriptTests.length === 0) problems.push("no scripts/*.test.ts files were discovered");
  if (moduleTests.length === 0) problems.push("no non-website-editor module __smoke__ tests were discovered");
  return { scriptsDir, modulesRoot, scriptTests, moduleTests, includedModules, problems };
}

// When imported (by the coverage meta-test), stop here — do not run the suite.
if (process.argv[1] && fileURLToPath(import.meta.url) !== process.argv[1]) {
  // eslint-disable-next-line no-var
} else {
  runCanonicalSuite();
}

function runCanonicalSuite() {
const { scriptsDir, modulesRoot, scriptTests, moduleTests, includedModules, problems } = discoverCanonicalTests();

// Fail-closed discovery: a zero count in either group means the layout moved or
// a glob broke — that must be a red run, never a silent "0 tests, all passed".
if (problems.length > 0) {
  console.error(`[canonical-suite] test discovery FAILED: ${problems.join("; ")}`);
  console.error(`[canonical-suite] scripts dir: ${scriptsDir}`);
  console.error(`[canonical-suite] modules root: ${modulesRoot}`);
  process.exit(2);
}

const files = [...scriptTests, ...moduleTests];
console.error(
  `[canonical-suite] discovered ${files.length} test files ` +
    `(${scriptTests.length} scripts + ${moduleTests.length} module smokes across ${includedModules.length} modules).`,
);
console.error(`[canonical-suite] modules: ${includedModules.join(", ")}`);
console.error(`[canonical-suite] website-editor runs in its own gate (smoke:website-editor).`);

const child = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  {
    cwd: PORTAL,
    stdio: "inherit",
    env: {
      ...process.env,
      PORTAL_BACKEND: process.env.PORTAL_BACKEND || "memory",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : ""}--conditions react-server`,
    },
  },
);

if (child.error) {
  console.error(`[canonical-suite] runner failed to start: ${child.error.message}`);
  process.exit(1);
}
process.exit(child.status ?? 1);
}
