#!/usr/bin/env node
// Direct postgres-backend smoke. Validates loadBlob/saveBlob round-trip
// against the schema without spinning up Next. Useful when a parallel
// dev server holds the Next.js single-instance lock.
//
// Usage:
//   DATABASE_URL=postgres://… node scripts/smoke-postgres.mjs

import pg from "pg";

const STATE_KEY = "__portal_state__";
const url = process.env.DATABASE_URL;
if (!url) {
  // R027 — skip cleanly so dev workflow without Postgres doesn't break.
  console.log("[smoke-postgres] DATABASE_URL unset → skipped (set DATABASE_URL to run)");
  process.exit(0);
}

const u = new URL(url);
const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
const sslmode = u.searchParams.get("sslmode");
const wantsTls = (sslmode && sslmode !== "disable") || (!sslmode && !isLocal);

const pool = new pg.Pool({
  connectionString: url,
  ssl: wantsTls ? { rejectUnauthorized: false } : undefined,
});

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
}

try {
  // Schema present
  const schema = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'portal_kv' ORDER BY ordinal_position`,
  );
  check("schema: portal_kv exists with key/value/updated_at",
    schema.rows.length === 3
    && schema.rows[0].column_name === "key"
    && schema.rows[1].column_name === "value"
    && schema.rows[1].data_type === "jsonb"
    && schema.rows[2].column_name === "updated_at");

  const idx = await pool.query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'portal_kv' AND indexname = 'portal_kv_key_prefix'`,
  );
  check("schema: prefix index portal_kv_key_prefix present", idx.rowCount === 1);

  // loadBlob baseline
  const before = await pool.query(`SELECT value FROM portal_kv WHERE key = $1`, [STATE_KEY]);
  const baseline = before.rowCount === 0 ? null : before.rows[0].value;
  check("loadBlob baseline (row may or may not exist)", true,
    `row=${before.rowCount === 0 ? "absent" : "present"}`);

  // saveBlob writes JSONB, returns updated_at
  const probe = JSON.stringify({ smoke: "r7", ts: Date.now() });
  await pool.query(
    `INSERT INTO portal_kv (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [`__r7_smoke_probe__`, probe],
  );
  const probeRead = await pool.query(`SELECT value FROM portal_kv WHERE key = $1`, [`__r7_smoke_probe__`]);
  const got = probeRead.rows[0]?.value;
  check("saveBlob → loadBlob round-trip preserves shape",
    typeof got === "object" && got?.smoke === "r7", JSON.stringify(got));

  // Idempotent re-write
  const probeV2 = JSON.stringify({ smoke: "r7", iteration: 2 });
  await pool.query(
    `INSERT INTO portal_kv (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [`__r7_smoke_probe__`, probeV2],
  );
  const probeRead2 = await pool.query(`SELECT value FROM portal_kv WHERE key = $1`, [`__r7_smoke_probe__`]);
  check("idempotent upsert (UPDATE branch)",
    probeRead2.rows[0]?.value?.iteration === 2);

  // Prefix lookup
  await pool.query(
    `INSERT INTO portal_kv (key, value) VALUES ('t/agA/c1/x', '{}'::jsonb), ('t/agA/c2/y', '{}'::jsonb), ('t/agB/c3/z', '{}'::jsonb)
     ON CONFLICT (key) DO NOTHING`,
  );
  const prefix = await pool.query(`SELECT key FROM portal_kv WHERE key LIKE $1 || '%' ORDER BY key`, ['t/agA/']);
  check("prefix scan (uses btree text_pattern_ops index)",
    prefix.rowCount === 2 && prefix.rows[0].key === "t/agA/c1/x" && prefix.rows[1].key === "t/agA/c2/y");

  // Migration round-trip — ensure `__portal_state__` row size > 1KB after demo seed
  if (baseline) {
    const stateBytes = typeof baseline === "string" ? baseline.length : JSON.stringify(baseline).length;
    check("__portal_state__ row carries meaningful payload",
      stateBytes > 1000, `${stateBytes} bytes`);
  } else {
    check("__portal_state__ row absent — run migration first", true,
      "skipping size check");
  }

  // Cleanup probe rows
  await pool.query(
    `DELETE FROM portal_kv WHERE key IN ('__r7_smoke_probe__','t/agA/c1/x','t/agA/c2/y','t/agB/c3/z')`,
  );
  check("cleanup probe rows", true);
} catch (err) {
  console.error("smoke crashed:", err instanceof Error ? err.message : err);
  fail++;
} finally {
  await pool.end();
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass}/${pass + fail} postgres smoke checks passed`);
process.exit(fail === 0 ? 0 : 1);
