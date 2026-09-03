// Aqua Tag ingestion migration on a REAL PostgreSQL (issues #87) — opt-in.
//
// Everything else in the #87 gate runs against a reference model of the SQL.
// This file is the only proof of the SQL itself: it applies
// `20260902093000_aqua_tag_submission_delivery.sql` to a database that the
// operator has EXPLICITLY marked disposable, twice (idempotency), and then
// exercises the contract with real transactions, real `for update skip
// locked`, real separate Node processes and a real SIGKILL.
//
// It skips cleanly unless BOTH are set:
//   AQUA_TAG_DISPOSABLE_DATABASE_URL=postgres://...   a throwaway database
//   AQUA_TAG_DISPOSABLE_DATABASE_ACK="this database may be modified and dropped"
//
// It REFUSES (fails, never proceeds) when the URL equals DATABASE_URL or points
// at the project's own Supabase host: nothing here may ever run against a
// database the portal uses. It creates a minimal `brand_enquiries` scaffold
// only when the table is absent, and drops everything it created at the end.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

const url = process.env.AQUA_TAG_DISPOSABLE_DATABASE_URL?.trim() ?? "";
const ack = process.env.AQUA_TAG_DISPOSABLE_DATABASE_ACK?.trim() ?? "";
const REQUIRED_ACK = "this database may be modified and dropped";
const enabled = Boolean(url) && ack === REQUIRED_ACK;
const skipReason = !url
  ? "AQUA_TAG_DISPOSABLE_DATABASE_URL is not set — live PostgreSQL acceptance not run"
  : ack !== REQUIRED_ACK
    ? `AQUA_TAG_DISPOSABLE_DATABASE_ACK must be exactly "${REQUIRED_ACK}"`
    : undefined;

function refuseProtectedTargets(): void {
  const live = process.env.DATABASE_URL?.trim();
  if (live && live === url) throw new Error("Refusing: the disposable URL equals DATABASE_URL.");
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { throw new Error("Refusing: the disposable URL is not a valid URL."); }
  if (host.includes("dghzbsxbdatskserctgt") || host.endsWith("supabase.co") || host.endsWith("supabase.com")) {
    throw new Error("Refusing: the disposable URL points at a Supabase project host; use a throwaway local database.");
  }
}

const migrationPath = new URL("../../supabase/migrations/20260902093000_aqua_tag_submission_delivery.sql", import.meta.url);
const MIGRATION = readFileSync(migrationPath, "utf8");
const SCOPE = `live-test-${randomUUID().slice(0, 8)}`;
const submissionId = (suffix: string) => `aqua_sub_live${suffix.padEnd(14, "0").slice(0, 14)}`;

type Pg = typeof import("pg");
let pg: Pg;
let pool: import("pg").Pool;
let scaffoldedEnquiries = false;
// The real `brand_enquiries.brand_slug` is NOT NULL with a foreign key to
// `brands(slug)` (20260731131500). On a full-schema target the fixture must
// therefore name a real brand; on the bare scaffold the value is inert.
const BRAND_SLUG = "aqua-tag-rehearsal-brand";
let scaffoldedBrand = false;

const enquiryRow = (overrides: Record<string, unknown> = {}) => ({
  brand_slug: BRAND_SLUG,
  name: "Taylor",
  email: "taylor@example.test",
  phone: null,
  contact_method: "email",
  services: ["Photography"],
  message: "A launch shoot",
  source_url: "https://milesymedia.com/contact",
  campaign: null,
  consent: true,
  agency_id: SCOPE,
  metadata: { agencyId: SCOPE, ingestionState: "processing" },
  ...overrides,
});

async function ingest(client: import("pg").PoolClient | import("pg").Pool, args: {
  id: string; arrival: "tag" | "brand"; facts: Record<string, unknown>; capture?: Record<string, unknown> | null;
  brand?: Record<string, unknown> | null; row?: Record<string, unknown>;
}) {
  const { rows } = await client.query(
    "select public.ingest_aqua_tag_submission($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb) as receipt",
    [SCOPE, args.id, "aqua_public_milesymedia_v1", args.arrival, JSON.stringify(args.facts),
      args.capture ? JSON.stringify(args.capture) : null, args.brand ? JSON.stringify(args.brand) : null,
      JSON.stringify(args.row ?? enquiryRow())],
  );
  return rows[0].receipt as Record<string, any>;
}

async function claim(client: import("pg").PoolClient | import("pg").Pool, owner: string, id: string, leaseMs = 90_000) {
  const { rows } = await client.query(
    "select * from public.claim_aqua_tag_submission_work($1, $2, $3, $4, 1)",
    [owner, leaseMs, SCOPE, id],
  );
  return rows as Array<Record<string, any>>;
}

async function settle(client: import("pg").Pool, row: Record<string, any>, outcome: string, patch: Record<string, unknown> | null, error: string | null = null) {
  const { rows } = await client.query(
    "select public.settle_aqua_tag_submission_work($1, $2, $3, $4, $5, $6, null, $7::jsonb) as receipt",
    [SCOPE, row.submission_id, row.claim_owner, row.claim_token, outcome, error, patch ? JSON.stringify(patch) : null],
  );
  return rows[0].receipt as Record<string, any>;
}

async function submission(id: string) {
  const { rows } = await pool.query("select * from public.aqua_tag_submissions where tenant_scope = $1 and submission_id = $2", [SCOPE, id]);
  return rows[0] as Record<string, any> | undefined;
}

async function enquiry(id: string) {
  const { rows } = await pool.query("select * from public.brand_enquiries where id = $1", [id]);
  return rows[0] as Record<string, any> | undefined;
}

/** A separate Node process that claims (or claims-then-dies) with its own connection. */
function claimInProcess(owner: string, id: string, options: { leaseMs?: number; crash?: boolean; barrier?: string } = {}): Promise<{ claimed: number; signal: string | null }> {
  const script = `
    const { Client } = require("pg");
    const { accessSync, writeFileSync } = require("node:fs");
    (async () => {
      const client = new Client({ connectionString: process.env.AQUA_TAG_DISPOSABLE_DATABASE_URL });
      await client.connect();
      if (process.env.BARRIER) {
        writeFileSync(process.env.BARRIER + ".ready." + process.pid, "ready");
        for (;;) { try { accessSync(process.env.BARRIER + ".go"); break; } catch { await new Promise(r => setTimeout(r, 10)); } }
      }
      const { rows } = await client.query("select * from public.claim_aqua_tag_submission_work($1, $2, $3, $4, 1)",
        [process.env.OWNER, Number(process.env.LEASE_MS), process.env.SCOPE, process.env.SUBMISSION]);
      process.stdout.write(JSON.stringify({ claimed: rows.length }));
      if (process.env.CRASH === "1") { process.kill(process.pid, "SIGKILL"); }
      await client.end();
    })().catch(error => { console.error(error); process.exit(1); });
  `;
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, ["-e", script], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        OWNER: owner, SUBMISSION: id, SCOPE, LEASE_MS: String(options.leaseMs ?? 90_000),
        CRASH: options.crash ? "1" : "0", BARRIER: options.barrier ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", (code, signal) => {
      if (signal !== "SIGKILL" && code !== 0) return rejectChild(new Error(`claim process exited ${code}: ${stderr}`));
      try { resolveChild({ ...(JSON.parse(stdout || "{\"claimed\":0}")), signal }); }
      catch { rejectChild(new Error(`claim process returned non-JSON: ${stdout}\n${stderr}`)); }
    });
  });
}

describe("Aqua Tag ingestion migration on a disposable PostgreSQL", { skip: skipReason }, () => {
  before(async () => {
    refuseProtectedTargets();
    pg = await import("pg");
    pool = new pg.Pool({ connectionString: url, max: 6 });
    for (const role of ["anon", "authenticated", "service_role"]) {
      await pool.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$;`);
    }
    await pool.query("create extension if not exists pgcrypto");
    const { rows } = await pool.query("select to_regclass('public.brand_enquiries') as existing");
    if (!rows[0].existing) {
      scaffoldedEnquiries = true;
      await pool.query(`create table public.brand_enquiries (
        id uuid primary key default gen_random_uuid(), brand_slug text, name text not null, email text, phone text,
        contact_method text, services text[] not null default '{}', message text, source_url text, campaign text,
        consent boolean not null default false, agency_id text, metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now())`);
    }
    const { rows: brands } = await pool.query("select to_regclass('public.brands') as existing");
    if (brands[0].existing) {
      const { rowCount } = await pool.query(
        "insert into public.brands (slug, name) values ($1, $2) on conflict (slug) do nothing",
        [BRAND_SLUG, "Aqua Tag rehearsal brand"],
      );
      scaffoldedBrand = rowCount === 1;
    }
    await pool.query(MIGRATION);
    await pool.query(MIGRATION); // applying twice must be a no-op
  });

  after(async () => {
    if (!pool) return;
    await pool.query("delete from public.brand_enquiries where agency_id = $1", [SCOPE]).catch(() => undefined);
    await pool.query("drop function if exists public.settle_aqua_tag_submission_work(text, text, text, uuid, text, text, jsonb, jsonb)");
    await pool.query("drop function if exists public.checkpoint_aqua_tag_submission_work(text, text, text, uuid, text, jsonb)");
    await pool.query("drop function if exists public.claim_aqua_tag_submission_work(text, integer, text, text, integer)");
    await pool.query("drop function if exists public.ingest_aqua_tag_submission(text, text, text, text, jsonb, jsonb, jsonb, jsonb)");
    await pool.query("drop function if exists public.aqua_tag_merge_facts(jsonb, jsonb)");
    await pool.query("drop table if exists public.aqua_tag_submissions");
    if (scaffoldedEnquiries) await pool.query("drop table if exists public.brand_enquiries");
    if (scaffoldedBrand) await pool.query("delete from public.brands where slug = $1", [BRAND_SLUG]).catch(() => undefined);
    await pool.end();
  });

  it("the table, its identity and the four functions exist after an idempotent apply", async () => {
    const { rows } = await pool.query(`select conname from pg_constraint where conrelid = 'public.aqua_tag_submissions'::regclass and contype = 'p'`);
    assert.equal(rows.length, 1);
    const { rows: fns } = await pool.query(`select proname from pg_proc where proname in ('ingest_aqua_tag_submission','claim_aqua_tag_submission_work','checkpoint_aqua_tag_submission_work','settle_aqua_tag_submission_work','aqua_tag_merge_facts') order by proname`);
    assert.equal(fns.length, 5);
    const { rows: rls } = await pool.query(`select relrowsecurity from pg_class where oid = 'public.aqua_tag_submissions'::regclass`);
    assert.equal(rls[0].relrowsecurity, true);
  });

  it("tag-first then brand: one identity, the hold row promoted in place, work enqueued once", async () => {
    const id = submissionId("tagfirst");
    const held = await ingest(pool, { id, arrival: "tag", facts: { captureFingerprint: "f1", pagePath: "/contact" }, capture: { fields: [{ key: "email", value: "taylor@example.test" }] }, row: enquiryRow({ consent: false, contact_method: null, metadata: { captureOnly: true, agencyId: SCOPE } }) });
    assert.equal(held.created, true);
    assert.equal(held.state, "capture-only");
    assert.equal(held.workStatus, "idle");
    const hold = await enquiry(held.enquiryId);
    assert.equal(hold?.consent, false);
    assert.equal(hold?.metadata.formCapture.fields[0].value, "taylor@example.test");

    const accepted = await ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:taylor@example.test" }, brand: { agencyId: SCOPE } });
    assert.equal(accepted.enquiryId, held.enquiryId, "the same canonical row");
    assert.equal(accepted.promoted, true);
    assert.equal(accepted.workStatus, "pending");
    const promoted = await enquiry(held.enquiryId);
    assert.equal(promoted?.consent, true);
    assert.equal(promoted?.contact_method, "email");
    assert.equal(promoted?.metadata.captureOnly, undefined);
    assert.ok(promoted?.metadata.formCapture, "the richer capture survives promotion");
    assert.equal(promoted?.metadata.submissionId, id);
    const { rows } = await pool.query("select count(*)::int as n from public.brand_enquiries where metadata->>'submissionId' = $1", [id]);
    assert.equal(rows[0].n, 1);
  });

  it("brand-first then tag attaches; a replayed brand is a no-op; contradictory reuse raises AQ409 and changes nothing", async () => {
    const id = submissionId("brandfirst");
    const accepted = await ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:taylor@example.test" }, brand: { agencyId: SCOPE } });
    assert.equal(accepted.created, true);
    const attached = await ingest(pool, { id, arrival: "tag", facts: { captureFingerprint: "f2", pagePath: "/contact" }, capture: { fields: [] } });
    assert.equal(attached.attached, true);
    assert.equal(attached.enquiryId, accepted.enquiryId);
    const replay = await ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:taylor@example.test" }, brand: { agencyId: "changed" } });
    assert.equal(replay.replay, true);
    const before = await submission(id);
    await assert.rejects(
      ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:someone-else@example.test" }, brand: { agencyId: SCOPE } }),
      (error: { code?: string; message?: string }) => error.code === "AQ409" && /aqua_tag_submission_conflict:contactKey/.test(error.message ?? ""),
    );
    assert.deepEqual(await submission(id), before, "a refused reuse leaves the identity row byte-identical");
    const { rows } = await pool.query("select count(*)::int as n from public.brand_enquiries where metadata->>'submissionId' = $1", [id]);
    assert.equal(rows[0].n, 1);
  });

  it("concurrent inserts for one new id from two connections converge on one identity row", async () => {
    const id = submissionId("concurrent");
    const [held, accepted] = await Promise.all([
      ingest(pool, { id, arrival: "tag", facts: { captureFingerprint: "f3", pagePath: "/contact" }, capture: { fields: [] }, row: enquiryRow({ consent: false, metadata: { captureOnly: true, agencyId: SCOPE } }) }),
      ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:taylor@example.test" }, brand: { agencyId: SCOPE } }),
    ]);
    assert.equal(held.enquiryId, accepted.enquiryId, "both halves must land on one canonical row");
    const { rows } = await pool.query("select count(*)::int as n from public.aqua_tag_submissions where tenant_scope = $1 and submission_id = $2", [SCOPE, id]);
    assert.equal(rows[0].n, 1);
  });

  it("claims are exclusive across separate processes, fenced by owner and token, and recoverable after the owner dies", async () => {
    const id = submissionId("claims");
    await ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:taylor@example.test" }, brand: { agencyId: SCOPE } });

    const barrier = `/tmp/aqua-tag-live-barrier-${randomUUID()}`;
    const racers = [claimInProcess("racer-a", id, { barrier }), claimInProcess("racer-b", id, { barrier })];
    const { readdirSync, writeFileSync } = await import("node:fs");
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && readdirSync("/tmp").filter(name => name.startsWith(barrier.slice(5) + ".ready.")).length < 2) {
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    writeFileSync(`${barrier}.go`, "go");
    const outcomes = await Promise.all(racers);
    assert.equal(outcomes.reduce((sum, outcome) => sum + outcome.claimed, 0), 1, "exactly one process may claim");

    // The live lease is fenced: a stranger cannot settle it.
    const live = await submission(id);
    const stranger = await pool.query(
      "select public.settle_aqua_tag_submission_work($1, $2, $3, $4, 'complete', null, null, null) as receipt",
      [SCOPE, id, "stranger", randomUUID()],
    );
    assert.equal(stranger.rows[0].receipt.settled, false);
    assert.equal(stranger.rows[0].receipt.reason, "lease_lost");
    const wrongToken = await pool.query(
      "select public.checkpoint_aqua_tag_submission_work($1, $2, $3, $4, 'lead', '{\"status\":\"done\"}'::jsonb) as ok",
      [SCOPE, id, live!.claim_owner, randomUUID()],
    );
    assert.equal(wrongToken.rows[0].ok, false);

    // Release it properly, then simulate the crash: a process claims with a
    // one-second lease and is killed; after expiry another owner reclaims.
    const released = await settle(pool, live!, "retry", { ingestionState: "processing" }, "first owner backing off");
    assert.equal(released.settled, true);
    await pool.query("update public.aqua_tag_submissions set available_at = now() where tenant_scope = $1 and submission_id = $2", [SCOPE, id]);
    const crashed = await claimInProcess("doomed", id, { leaseMs: 1_000, crash: true });
    assert.equal(crashed.claimed, 1);
    assert.equal(crashed.signal, "SIGKILL");
    assert.equal((await claim(pool, "too-early", id)).length, 0, "a live lease is not stolen");
    await new Promise(resolveWait => setTimeout(resolveWait, 1_200));
    const recovered = await claim(pool, "recoverer", id);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].attempts, 3);
    const doomedSettle = await pool.query(
      "select public.settle_aqua_tag_submission_work($1, $2, 'doomed', $3, 'complete', null, null, null) as receipt",
      [SCOPE, id, recovered[0].claim_token],
    );
    assert.equal(doomedSettle.rows[0].receipt.settled, false, "the dead owner's name with the live token is still refused");
    const done = await settle(pool, recovered[0], "complete", { ingestionState: "complete", deliveryState: "complete" });
    assert.equal(done.settled, true);
    assert.equal((await submission(id))?.work_status, "complete");
    assert.equal((await enquiry((await submission(id))!.enquiry_id))?.metadata.ingestionState, "complete", "the completion patch lands in the same transaction");
  });

  it("retries back off, are bounded by max_attempts, and end in a terminal dead-letter with the metadata patch applied", async () => {
    const id = submissionId("retries");
    const accepted = await ingest(pool, { id, arrival: "brand", facts: { brandSlug: "milesymedia", contactKey: "email:taylor@example.test" }, brand: { agencyId: SCOPE } });
    await pool.query("update public.aqua_tag_submissions set max_attempts = 2 where tenant_scope = $1 and submission_id = $2", [SCOPE, id]);
    const first = await claim(pool, "worker", id);
    assert.equal(first.length, 1);
    const retry = await settle(pool, first[0], "retry", { deliveryState: "pending" }, "automation: provider down");
    assert.equal(retry.settled, true);
    assert.equal(retry.workStatus, "pending");
    assert.ok(retry.availableAt > Date.now() + 20_000, "the first retry waits about thirty seconds");
    assert.equal((await claim(pool, "worker", id)).length, 0, "backoff is honoured");
    await pool.query("update public.aqua_tag_submissions set available_at = now() where tenant_scope = $1 and submission_id = $2", [SCOPE, id]);
    const second = await claim(pool, "worker", id);
    assert.equal(second.length, 1);
    assert.equal(second[0].attempts, 2);
    const dead = await settle(pool, second[0], "retry", { ingestionState: "failed", deliveryState: "dead-letter" }, "automation: provider down");
    assert.equal(dead.workStatus, "dead");
    assert.equal(dead.state, "dead-letter");
    const row = await submission(id);
    assert.ok(row?.dead_lettered_at);
    assert.equal(row?.claim_owner, null);
    assert.equal((await claim(pool, "worker", id)).length, 0, "dead-letter is terminal");
    assert.equal((await enquiry(accepted.enquiryId))?.metadata.deliveryState, "dead-letter");
  });

  it("anon and authenticated cannot reach the table or the functions", async () => {
    const { rows } = await pool.query(`select
      has_table_privilege('anon', 'public.aqua_tag_submissions', 'SELECT') as anon_select,
      has_table_privilege('authenticated', 'public.aqua_tag_submissions', 'SELECT') as auth_select,
      has_table_privilege('service_role', 'public.aqua_tag_submissions', 'UPDATE') as service_update,
      has_function_privilege('anon', 'public.ingest_aqua_tag_submission(text, text, text, text, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE') as anon_ingest,
      has_function_privilege('service_role', 'public.ingest_aqua_tag_submission(text, text, text, text, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE') as service_ingest`);
    assert.equal(rows[0].anon_select, false);
    assert.equal(rows[0].auth_select, false);
    assert.equal(rows[0].service_update, true);
    assert.equal(rows[0].anon_ingest, false);
    assert.equal(rows[0].service_ingest, true);
  });
});
