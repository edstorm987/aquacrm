#!/usr/bin/env node
// Fork an isolated dev sandbox for one worker.
//
// The problem this solves: the file backend used to write to a single
// `.data/portal-state.json`, so a second worker running `dev:verify` silently
// clobbered the first worker's (and the commander's) sandbox. Workers were
// told not to self-verify because of it. Now `PORTAL_DATA_FILE` +
// `NEXT_DIST_DIR` isolate a process, and this script hands a worker its own
// copy of the current state so it starts with REAL seeded data, not an empty
// tenant — then prints the exact command to run.
//
//   node scripts/fork-sandbox.mjs <worker-name> [port]
//   npm run sandbox:fork -- alpha 3041
//
// Nothing is mutated for anyone else: it only ever writes a NEW file under
// .data/ and never touches the shared portal-state.json.

import { existsSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

const [, , rawName, rawPort] = process.argv;

if (!rawName) {
  console.error("Usage: npm run sandbox:fork -- <worker-name> [port]\n" +
    "   e.g. npm run sandbox:fork -- alpha 3041");
  process.exit(1);
}

// Keep the name filesystem-safe — it becomes part of a filename and a dir name.
const name = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
if (!name) {
  console.error(`Could not derive a usable worker name from "${rawName}".`);
  process.exit(1);
}

const port = Number(rawPort ?? 0) || 3041;
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error(`Port must be an integer between 1024 and 65535 (got "${rawPort}").`);
  process.exit(1);
}

const root = process.cwd();
const shared = resolve(root, ".data", "portal-state.json");
const mine = resolve(root, ".data", `portal-state.${name}.json`);
const distDir = `.next-${name}`;

if (existsSync(mine)) {
  const age = Math.round((Date.now() - statSync(mine).mtimeMs) / 60000);
  console.log(`↻ Reusing existing sandbox ${mine} (last written ${age}m ago).`);
  console.log("  Delete that file and re-run if you want a fresh copy of the shared state.\n");
} else if (existsSync(shared)) {
  mkdirSync(dirname(mine), { recursive: true });
  copyFileSync(shared, mine);
  console.log(`✓ Forked the shared sandbox → ${mine}`);
  console.log("  Your server writes ONLY here; the shared sandbox is untouched.\n");
} else {
  mkdirSync(dirname(mine), { recursive: true });
  console.log(`✓ No shared sandbox found — starting empty at ${mine}`);
  console.log("  The dev seed will populate it on first boot.\n");
}

console.log("Run your isolated dev server with:\n");
console.log(`  PORTAL_DATA_FILE=.data/portal-state.${name}.json \\`);
console.log(`  NEXT_DIST_DIR=${distDir} \\`);
console.log(`  npm run dev:worker -- -p ${port}\n`);
console.log(`Then sign in with no credentials at:  http://localhost:${port}/dev`);
console.log(`(append ?client=<slug> for a client view, or use Dev Mode to switch POV)\n`);
console.log("Isolation: own state file · own build dir · own port → cannot clobber another worker.");
