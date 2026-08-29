#!/usr/bin/env node
// Is the LIVE project still as locked down as the migrations say?
//
// `smoke-rls-policy-coverage.test.ts` guards the repo half — the written SQL
// against what the code assumes. It deliberately does not touch the network, so
// it cannot see the half that actually drifts: somebody changing a policy in
// the Supabase dashboard. That has already happened once (`rls_auto_enable`
// exists in the live project and in no migration).
//
// This is the other half. Read-only, run on demand, prints no secret.
//
// ── Why there is no DELETE in here ───────────────────────────────────────
//
// On 2026-08-29 I probed the live project with an anon DELETE to see whether it
// was refused. It was — RLS matched zero rows and the data was untouched — but
// that was luck standing in for judgement: had the policy been wrong, the
// "test" would have been the incident. A destructive verb is never a way to
// find out whether destruction is possible.
//
// So exposure is established the safe way instead:
//   • GET with `count=exact` as anon, compared against the same count as
//     service-role. Rows visible to service-role and invisible to anon is RLS
//     working; the same count both ways means the table is public.
//   • Writes are probed with POST only, whose refusal is an auth decision made
//     before any row is considered — and with a body that could not form a
//     valid row even if it were allowed.
//
// PostgREST answers `200 []` for "RLS filtered everything" and for "the table is
// empty" alike, which is why every check below is two-sided. A one-sided read
// would report an empty table as secure.

import { readFileSync, existsSync } from "node:fs";

const ENV_FILE = ".env.local";

function loadEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and");
  console.error("SUPABASE_SERVICE_ROLE_KEY — in .env.local or the environment.");
  process.exit(1);
}

/**
 * Tables the public key is SUPPOSED to read. Everything else must return zero
 * rows to anon while service-role can see them.
 *
 * Keeping the allowed set explicit is the point: a new table appears as a
 * finding rather than being quietly accepted because it looked plausible.
 */
const PUBLIC_BY_DESIGN = new Set(["brands", "shoots", "shoot_photos"]);

const headers = key => ({ apikey: key, Authorization: `Bearer ${key}` });

async function rowCount(table, key) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { ...headers(key), Prefer: "count=exact", Range: "0-0" },
  });
  if (response.status === 401 || response.status === 403) return { blocked: true, count: 0 };
  const range = response.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return { blocked: false, count: Number.isFinite(total) ? total : 0, status: response.status };
}

async function writeRefused(table) {
  // POST only. An empty body cannot form a valid row, and the refusal we are
  // looking for happens before any row is considered.
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers(anon), "content-type": "application/json", Prefer: "return=minimal" },
    body: "{}",
  });
  return { refused: response.status >= 400, status: response.status };
}

const spec = await fetch(`${url}/rest/v1/`, { headers: headers(service) }).then(r => r.json());
const tables = Object.keys(spec.definitions ?? spec.components?.schemas ?? {}).sort();

console.log(`Live RLS posture — ${tables.length} tables exposed via PostgREST\n`);

let leaks = 0;
let writable = 0;

for (const table of tables) {
  const asService = await rowCount(table, service);
  const asAnon = await rowCount(table, anon);
  const write = await writeRefused(table);

  const readable = !asAnon.blocked && asAnon.count > 0;
  const expected = PUBLIC_BY_DESIGN.has(table);
  // Rows exist AND anon sees none → RLS is doing work. Rows exist and anon sees
  // them → public. No rows at all → nothing proven either way, and said so.
  const verdict = asService.count === 0
    ? "empty — proves nothing"
    : readable
      ? (expected ? "public by design" : "!! READABLE BY THE PUBLIC !!")
      : "RLS filtering (rows exist, anon sees none)";

  if (readable && !expected) leaks += 1;
  if (!write.refused) writable += 1;

  const flag = (readable && !expected) || !write.refused ? "✗" : " ";
  console.log(
    `${flag} ${table.padEnd(30)} service=${String(asService.count).padStart(5)}  anon=${String(asAnon.count).padStart(5)}` +
    `  write=${write.refused ? `refused ${write.status}` : `!! ${write.status} !!`}  ${verdict}`,
  );
}

console.log(`\nUnexpectedly public: ${leaks}   Publicly writable: ${writable}`);
if (leaks || writable) {
  console.log("\nA table above is reachable by the anon key, which ships in every browser.");
  process.exit(1);
}
console.log("Nothing readable or writable by the public key beyond the portfolio tables.");
