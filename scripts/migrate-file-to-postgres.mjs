#!/usr/bin/env node
// One-shot migration: copy `.data/portal-state.json` → `portal_kv`.
//
// Idempotent — uses `INSERT ... ON CONFLICT (key) DO UPDATE`. Safe to
// re-run after a partial migration or after testing with seeded data.
//
// Usage:
//   DATABASE_URL=postgres://… node scripts/migrate-file-to-postgres.mjs
//
// Optional:
//   STATE_FILE=.data/portal-state.json   (default)
//   STATE_KEY=__portal_state__           (default — matches storagePostgres.ts)
//   DRY_RUN=1                            (parse the file, skip the upsert)
//
// Exit codes:
//   0 = success (or dry-run completed)
//   1 = file backend state missing / unreadable
//   2 = DATABASE_URL unset
//   3 = Postgres connection failed
//   4 = upsert failed

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const STATE_FILE = process.env.STATE_FILE
  ? resolve(process.env.STATE_FILE)
  : resolve(".data", "portal-state.json");
const STATE_KEY = process.env.STATE_KEY ?? "__portal_state__";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function log(...args) { console.log("[migrate]", ...args); }

async function readState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { raw, parsed };
  } catch (err) {
    log(`failed to read state file: ${STATE_FILE}`);
    log(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function summarise(state) {
  const counts = {
    agencies: Object.keys(state.agencies ?? {}).length,
    clients: Object.keys(state.clients ?? {}).length,
    endCustomers: Object.keys(state.endCustomers ?? {}).length,
    users: Object.keys(state.users ?? {}).length,
    pluginInstalls: Object.keys(state.pluginInstalls ?? {}).length,
    pluginData: Object.keys(state.pluginData ?? {}).length,
    phases: Object.keys(state.phases ?? {}).length,
    activity: Array.isArray(state.activity) ? state.activity.length : 0,
  };
  return counts;
}

async function main() {
  log(`reading ${STATE_FILE}`);
  const { raw, parsed } = await readState();
  const counts = summarise(parsed);
  log("source counts:", JSON.stringify(counts));

  if (DRY_RUN) {
    log("DRY_RUN — skipping upsert");
    log(`would write key=${STATE_KEY}, ${raw.length} bytes`);
    process.exit(0);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    log("DATABASE_URL is unset; cannot connect.");
    process.exit(2);
  }

  // Same SSL detection as the runtime backend.
  const u = new URL(url);
  const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  const sslmode = u.searchParams.get("sslmode");
  const wantsTls = (sslmode && sslmode !== "disable") || (!sslmode && !isLocal);

  const client = new pg.Client({
    connectionString: url,
    ssl: wantsTls ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
  } catch (err) {
    log("connection failed:", err instanceof Error ? err.message : String(err));
    process.exit(3);
  }

  try {
    const result = await client.query(
      `INSERT INTO portal_kv (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = EXCLUDED.updated_at
       RETURNING (xmax = 0) AS inserted`,
      [STATE_KEY, raw],
    );
    const inserted = result.rows[0]?.inserted === true;
    log(`upsert ok — ${inserted ? "INSERT" : "UPDATE"} portal_kv key=${STATE_KEY}`);
  } catch (err) {
    log("upsert failed:", err instanceof Error ? err.message : String(err));
    process.exit(4);
  } finally {
    await client.end().catch(() => {});
  }

  log("done.");
}

main().catch(err => {
  log("crashed:", err instanceof Error ? err.message : String(err));
  process.exit(99);
});
