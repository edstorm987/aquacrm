#!/usr/bin/env node
// Read the thoughts Ed has left for you, and acknowledge them.
//
//   npm run worker:thoughts -- <your-name>          # show what's waiting
//   npm run worker:thoughts -- <your-name> --ack    # show, then mark as read
//
// This is the reply channel. Ed leaves notes on specific tasks from the Dev
// Console; they land in `.data/dev-thoughts.json` (or `$DEV_THOUGHTS_FILE`).
// Run this when you start, after each phase, and before you call anything
// done — a note you never read is worse than no note at all.
//
// You'll see thoughts addressed to you plus general ones addressed to nobody.
// Acknowledgement is PER READER: marking a general note read marks it read for
// YOU. It stays waiting for every other worker, because it was addressed to
// all of you. (It used to be one global stamp, so the first worker to --ack
// consumed everyone else's copy.)
//
// The rules below MUST match `src/lib/server/dev/devTeamThoughts.ts` — this script
// runs under plain `node`, so it cannot import that TypeScript module.
// `scripts/smoke-dev-thoughts.test.ts` drives BOTH against one ledger and
// fails if they ever disagree.

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const FILE = process.env.DEV_THOUGHTS_FILE?.trim()
  || resolve(process.cwd(), ".data", "dev-thoughts.json");

const argv = process.argv.slice(2);
const ack = argv.includes("--ack");
const name = (argv.find(a => !a.startsWith("--")) ?? "").toLowerCase();

if (!name) {
  console.error("Usage: npm run worker:thoughts -- <your-name> [--ack]");
  process.exit(1);
}

if (!existsSync(FILE)) {
  console.log("No thoughts yet — nothing waiting for you.");
  process.exit(0);
}

const LOCK = `${FILE}.aqua-lock`;
const REAPER = `${LOCK}.reaper`;
let ownsLock = false;

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

function staleLock() {
  let info;
  try { info = statSync(LOCK); } catch { return false; }
  try {
    const owner = JSON.parse(readFileSync(`${LOCK}/owner.json`, "utf8"));
    return !processExists(owner.pid);
  } catch { /* creator may be between mkdir and owner write */ }
  return Date.now() - info.mtimeMs > 60_000;
}

function tryReap() {
  try { mkdirSync(REAPER); } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
  try {
    if (!staleLock()) return false;
    rmSync(LOCK, { recursive: true, force: true });
    return true;
  } finally {
    rmSync(REAPER, { recursive: true, force: true });
  }
}

async function acquireLock() {
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(`${LOCK}/owner.json`, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf8");
      ownsLock = true;
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (tryReap()) continue;
      if (Date.now() - started >= 10_000) throw new Error("Another process is still writing the thoughts ledger.");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}

function releaseLock() {
  if (!ownsLock) return;
  ownsLock = false;
  rmSync(LOCK, { recursive: true, force: true });
}

if (ack) {
  await acquireLock();
  process.once("exit", releaseLock);
}

let rows;
try {
  rows = JSON.parse(readFileSync(FILE, "utf8"));
  if (!Array.isArray(rows)) throw new Error("not an array");
} catch {
  // Writes are atomic now (temp file + rename), so this is NOT a transient
  // mid-write state — the ledger is genuinely damaged. Say so, and do not
  // write over it.
  console.error(`Could not parse ${FILE}. It is damaged, not mid-write — move it aside before anything writes to it again.`);
  releaseLock();
  process.exit(1);
}

/** Fold the pre-per-reader shape (`acknowledgedBy`/`acknowledgedAt`) forward. */
function readersOf(row) {
  const readBy = { ...(row.readBy ?? {}) };
  if (!Object.keys(readBy).length && typeof row.acknowledgedAt === "number") {
    readBy[String(row.acknowledgedBy || "a worker")] = row.acknowledgedAt;
  }
  return readBy;
}

const mine = rows.filter(t =>
  // `projectId` rows are the Dev Editor's per-project Notes tab riding the
  // same ledger (dev-editor-finish.md phase 14) — notes-to-self, never
  // instructions, so they are not "waiting for" any worker.
  !t.projectId &&
  !readersOf(t)[name] && (!t.worker || String(t.worker).toLowerCase() === name));

if (mine.length === 0) {
  console.log(`Nothing waiting for "${name}".`);
  releaseLock();
  process.exit(0);
}

console.log(`\n${mine.length} thought${mine.length === 1 ? "" : "s"} waiting for "${name}":\n`);
for (const t of mine) {
  const when = new Date(t.at).toISOString().slice(0, 16).replace("T", " ");
  const about = t.taskId ? `task ${t.taskId}` : t.planName ? `plan ${t.planName}` : "general";
  const also = Object.keys(readersOf(t));
  console.log(`  ── ${when}  ·  ${about}${t.worker ? `  ·  for ${t.worker}` : "  ·  for everyone"}`);
  console.log(`     ${t.text}`);
  if (also.length) console.log(`     (also read by ${also.join(", ")})`);
  console.log("");
}

if (ack) {
  const ids = new Set(mine.map(t => t.id));
  const now = Date.now();
  for (const row of rows) {
    const readBy = readersOf(row);
    if (ids.has(row.id)) readBy[name] = now;
    delete row.acknowledgedBy;
    delete row.acknowledgedAt;
    row.readBy = Object.keys(readBy).length ? readBy : undefined;
  }
  // Atomic write — a plain writeFileSync racing the Dev Console left the
  // shorter payload inside the longer one and the whole ledger unreadable.
  const tmp = `${FILE}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(rows, null, 2) + "\n", "utf8");
    renameSync(tmp, FILE);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* nothing to clean up */ }
    releaseLock();
    throw error;
  }
  releaseLock();
  console.log(`✓ Marked ${mine.length} as read for "${name}". Ed sees they've been picked up.`);
} else {
  console.log(`Re-run with --ack once you've taken them on board:`);
  console.log(`  npm run worker:thoughts -- ${name} --ack`);
}
