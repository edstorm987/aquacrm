#!/usr/bin/env node
// Is the LIVE project's schema the one the migrations describe?  → READ ONLY.
//
// `supabase migration list` needs a CLI login and a database password; this
// needs only the service-role key already in `.env.local`, and it never prints
// that key, a row, or an address. It reads PostgREST's OpenAPI document (the
// schema as the service role sees it), takes HEAD-only row counts, lists the
// storage buckets, and compares all of it with what `../supabase/migrations`
// would create. The output is a drift table: which migration each expected
// table or RPC came from, and whether the live project has it.
//
// What it cannot see (needs SQL access): policies, triggers, indexes,
// constraints, `supabase_migrations.schema_migrations`, and storage policies.
// Those are the job of `../supabase/rls-verify.sql` once a password exists.
//
//   node scripts/supabase-schema-status.mjs            # table
//   node scripts/supabase-schema-status.mjs --json     # machine-readable
//
// Exit code 0 when the live schema carries every table/RPC the migrations
// define (plus nothing unexpected), 1 when there is drift, 2 on a probe error.

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIGRATIONS = resolve(ROOT, "..", "supabase", "migrations");
const asJson = process.argv.includes("--json");

function loadEnvLocal() {
  let raw;
  try { raw = readFileSync(resolve(ROOT, ".env.local"), "utf8"); } catch { return; }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

/** Objects each migration file creates, by a conservative regex over the SQL. */
export function expectedObjects(dir = MIGRATIONS) {
  const tables = new Map(); const rpcs = new Map(); const columns = new Map(); const buckets = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const m of sql.matchAll(/create table if not exists public\.(\w+)/gi)) tables.set(m[1], file);
    for (const m of sql.matchAll(/drop table if exists public\.(\w+)/gi)) if (tables.get(m[1]) && tables.get(m[1]) < file) tables.delete(m[1]);
    for (const m of sql.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*)\)\s*returns\s+(\w+)/gi)) {
      if (/^trigger$/i.test(m[3])) continue; // trigger functions are not RPCs
      const params = m[2].split(",").map(p => p.trim().split(/\s+/)[0]).filter(Boolean);
      rpcs.set(m[1], { file, params });
    }
    for (const m of sql.matchAll(/alter table public\.(\w+)\s+add column if not exists (\w+)/gi)) columns.set(`${m[1]}.${m[2]}`, file);
    for (const m of sql.matchAll(/\('([a-z0-9-]+)',\s*'[a-z0-9-]+',\s*(true|false),\s*(\d+)/gi)) buckets.set(m[1], { file, isPublic: m[2] === "true", limit: Number(m[3]) });
  }
  return { tables, rpcs, columns, buckets };
}

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !service) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (from .env.local)."); process.exit(2); }
  const H = key => ({ apikey: key, authorization: `Bearer ${key}` });
  const fingerprint = key => createHash("sha256").update(key).digest("hex").slice(0, 12);

  const spec = await fetch(`${url}/rest/v1/`, { headers: { ...H(service), accept: "application/openapi+json" } }).then(r => r.json());
  const liveTables = new Map(); const liveRpcs = new Map();
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    if (path.startsWith("/rpc/")) {
      const name = path.slice(5);
      const params = Object.keys(spec.definitions?.[`(rpc) ${name}`]?.properties ?? ops.post?.parameters?.[0]?.schema?.properties ?? {});
      liveRpcs.set(name, params);
    } else if (path !== "/") liveTables.set(path.slice(1), Object.keys(spec.definitions?.[path.slice(1)]?.properties ?? {}));
  }
  const counts = {};
  for (const table of [...liveTables.keys()].sort()) {
    const head = async key => { const r = await fetch(`${url}/rest/v1/${table}?select=*`, { method: "HEAD", headers: { ...H(key), prefer: "count=exact" } }); return { status: r.status, count: (r.headers.get("content-range") ?? "").split("/")[1] ?? null }; };
    counts[table] = { service: await head(service), anon: anon ? await head(anon) : null };
  }
  const bucketList = await fetch(`${url}/storage/v1/bucket`, { headers: H(service) }).then(r => r.ok ? r.json() : []);
  const liveBuckets = new Map(bucketList.map(b => [b.id, { isPublic: b.public, limit: b.file_size_limit, mimes: (b.allowed_mime_types ?? []).length }]));

  const expected = expectedObjects();
  const rows = [];
  for (const [table, file] of [...expected.tables].sort()) rows.push({ kind: "table", object: table, migration: file, live: liveTables.has(table) ? `present (${counts[table]?.service.count ?? "?"} rows)` : "MISSING" });
  for (const [table] of liveTables) if (!expected.tables.has(table)) rows.push({ kind: "table", object: table, migration: "(none)", live: "present, not in any migration" });
  for (const [name, { file, params }] of [...expected.rpcs].sort()) {
    const live = liveRpcs.get(name);
    let state = "MISSING";
    if (live) state = live.length === params.length && params.every(p => live.includes(p)) ? "present" : `present with DIFFERENT signature (${live.join(",")})`;
    rows.push({ kind: "rpc", object: name, migration: file, live: state });
  }
  for (const [name] of liveRpcs) if (!expected.rpcs.has(name)) rows.push({ kind: "rpc", object: name, migration: "(none)", live: "present, not in any migration" });
  for (const [column, file] of [...expected.columns].sort()) {
    const [table, col] = column.split(".");
    rows.push({ kind: "column", object: column, migration: file, live: liveTables.get(table)?.includes(col) ? "present" : liveTables.has(table) ? "MISSING" : "table missing" });
  }
  for (const [id, { file, isPublic, limit }] of [...expected.buckets].sort()) {
    const live = liveBuckets.get(id);
    rows.push({ kind: "bucket", object: id, migration: file, live: live ? (live.isPublic === isPublic && live.limit === limit ? `present (${live.mimes} mimes)` : `present, differs (public=${live.isPublic}, limit=${live.limit})`) : "MISSING" });
  }
  const anonReadable = Object.entries(counts).filter(([, c]) => c.anon && c.anon.status === 200 && c.anon.count !== null && c.anon.count !== "0" && c.anon.count === c.service.count).map(([t]) => t);
  const drift = rows.filter(r => /MISSING|DIFFERENT|differs|not in any migration/.test(r.live));
  const report = { project: new URL(url).hostname.split(".")[0], keyFingerprints: { anon: anon ? fingerprint(anon) : null, service: fingerprint(service) }, ranAt: new Date().toISOString(), rows, anonReadableTables: anonReadable, driftCount: drift.length };
  if (asJson) { console.log(JSON.stringify(report, null, 2)); }
  else {
    console.log(`\nSupabase schema status — project ${report.project} (service key …${report.keyFingerprints.service}) at ${report.ranAt}\n`);
    for (const r of rows) console.log(`  ${r.kind.padEnd(7)} ${r.object.padEnd(44)} ${r.migration.padEnd(56)} ${r.live}`);
    console.log(`\n  anon-readable tables (same count as service): ${anonReadable.join(", ") || "none"}`);
    console.log(`  drift rows: ${drift.length}\n`);
  }
  process.exit(drift.length ? 1 : 0);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) main().catch(error => { console.error(error.message); process.exit(2); });
