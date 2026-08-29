#!/usr/bin/env node
// Supabase cutover pre-flight — READ ONLY.
//
// Answers one question: after the cutover, can everybody who has a portal
// account actually sign in?
//
// Sign-in goes through `signInWithPassword`, so Supabase Auth holds the
// password and the portal's own scrypt hashes are never consulted. A portal
// user with no Supabase Auth account is therefore locked out the moment that
// becomes the only path — and a Supabase Auth account with no portal record
// authenticates successfully and then resolves to no role and no agency.
//
// ── This script does not fix anything ────────────────────────────────────
//
// It reports. Creating accounts and deleting them are account-management
// actions that belong to a human in the Supabase dashboard, deliberately not
// automated here. Run it before the cutover to size the work, and again
// afterwards to confirm the gap closed.
//
// ── It never reads anybody's address ─────────────────────────────────────
//
// Both lists are reduced to SHA-256 hashes before they are compared, so the
// overlap can be counted without an email being printed, logged, or held in a
// variable any longer than the hash needs. The one exception is `--show-missing`,
// which prints ONLY the addresses that need action and only when asked for.
//
//   node scripts/supabase-cutover-preflight.mjs
//   node scripts/supabase-cutover-preflight.mjs --show-missing

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const showMissing = process.argv.includes("--show-missing");

// Next loads `.env.local`; a bare node process does not. Measuring without it
// is how a previous session concluded "0 of 12 ready, nobody can sign in" and
// lost a day to a number that was never true.
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    console.error("No .env.local found. Run this from the portal directory.");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const hash = value => createHash("sha256").update(String(value ?? "").trim().toLowerCase()).digest("hex");

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const state = JSON.parse(readFileSync(resolve(process.cwd(), ".data", "portal-state.json"), "utf8"));
  const portalUsers = Object.values(state.users ?? {});

  const response = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    console.error(`Supabase Auth admin API returned ${response.status}.`);
    process.exit(1);
  }
  const authUsers = (await response.json()).users ?? [];

  const authHashes = new Set(authUsers.map(user => hash(user.email)));
  const portalHashes = new Set(portalUsers.map(user => hash(user.email)));

  const missingFromAuth = portalUsers.filter(user => !authHashes.has(hash(user.email)));
  const orphanAuth = authUsers.filter(user => !portalHashes.has(hash(user.email)));

  console.log(`portal users                     ${portalUsers.length}`);
  console.log(`supabase auth users              ${authUsers.length}`);
  console.log(`present in both                  ${portalHashes.size - missingFromAuth.length}`);
  console.log("");
  console.log(`LOCKED OUT after cutover         ${missingFromAuth.length}  (portal user, no auth account)`);
  console.log(`AUTH WITH NO ROLE                ${orphanAuth.length}  (auth account, no portal record)`);

  if (missingFromAuth.length || orphanAuth.length) {
    console.log("");
    console.log("Not fixed here on purpose — creating and deleting accounts belongs to you,");
    console.log("in the Supabase dashboard. Re-run this afterwards to confirm both reach 0.");
    if (showMissing) {
      console.log("");
      for (const user of missingFromAuth) console.log(`  needs an auth account: ${user.email}  (role: ${user.role})`);
      for (const user of orphanAuth) console.log(`  auth account with no portal user: ${user.email}`);
    } else {
      console.log("Re-run with --show-missing to list the addresses that need action.");
    }
  } else {
    console.log("");
    console.log("Everyone with a portal account can sign in after the cutover.");
  }
}

void main();
