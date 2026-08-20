#!/usr/bin/env node
// Worker check-in — one line that makes you visible on Ed's live board.
//
//   npm run worker:checkin -- <name> "<what you're doing>" [--plan <plan>] [--phase <phase>] [--done]
//
//   npm run worker:checkin -- alpha "building phase 2 — the enquiry card" --plan enquiry-detail-card --phase "P2"
//   npm run worker:checkin -- alpha "suite green, handing back" --done
//
// Writes `.data/workers/<name>.json` (local only, never committed). The Dev Team
// board polls these, so Ed sees who is working on what without asking. Call it
// when you start, after each shipped phase, and when you finish or block.
//
// The board ALSO shows raw file activity, so you are visible either way — but a
// check-in is what turns "something changed in src/app/portal" into
// "alpha is on phase 2 of the enquiry card".

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);

function takeFlag(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  argv.splice(i, value === undefined ? 1 : 2);
  return value;
}

function takeSwitch(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
}

const plan = takeFlag("--plan");
// `--done` is the check-OUT half of the channel. Nothing deletes these files,
// so without an explicit sign-off a worker stays "live" on the board until its
// check-in ages out of the window. `phase: "done"` is what the readers use to
// tell "still on it" from "handed back" (isCheckInActive in devTeamWorkers.ts).
const done = takeSwitch("--done");
const phase = takeFlag("--phase") ?? (done ? "done" : undefined);
const [rawName, ...statusParts] = argv;

if (!rawName) {
  console.error('Usage: npm run worker:checkin -- <name> "<status>" [--plan <plan>] [--phase <phase>] [--done]');
  process.exit(1);
}

const name = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
if (!name) {
  console.error(`Could not derive a usable worker name from "${rawName}".`);
  process.exit(1);
}

const status = statusParts.join(" ").trim() || "working";

const dir = resolve(process.cwd(), ".data", "workers");
mkdirSync(dir, { recursive: true });

const payload = {
  name,
  status: status.slice(0, 200),
  plan: plan ? String(plan).slice(0, 120) : undefined,
  phase: phase ? String(phase).slice(0, 80) : undefined,
  at: Date.now(),
};

writeFileSync(join(dir, `${name}.json`), JSON.stringify(payload, null, 2) + "\n", "utf-8");

console.log(`✓ checked in as "${name}" — ${status}`);
if (plan) console.log(`  plan:  ${plan}`);
if (phase) console.log(`  phase: ${phase}`);
console.log("  Ed's Dev Team board will show this within ~10s.");
