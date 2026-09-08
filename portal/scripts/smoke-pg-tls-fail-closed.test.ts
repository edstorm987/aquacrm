// Postgres TLS fail-closed regression (assume-breach containment, Phase 0-E).
//
// The old connectors used `ssl: { rejectUnauthorized: false }` for every
// non-local connection — TLS with verification off, i.e. a MITM-able channel
// carrying every tenant's state and the database password. This suite pins the
// replacement policy in lib/server/pgTls.ts, including the one that matters
// most: PRODUCTION IGNORES the insecure escape hatch.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { resolvePgTls } from "../src/lib/server/pgTls";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REMOTE = "postgresql://user:pass@db.example.supabase.co:5432/postgres?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("remote connections get VERIFIED TLS in production", () => {
  const tls = resolvePgTls(REMOTE, { NODE_ENV: "production" } as NodeJS.ProcessEnv);
  assert.deepEqual(tls.ssl, { rejectUnauthorized: true });
});

test("production IGNORES the insecure escape hatch (fail closed)", () => {
  const tls = resolvePgTls(REMOTE, { NODE_ENV: "production", PORTAL_PG_ALLOW_INSECURE_TLS: "1" } as NodeJS.ProcessEnv);
  assert.deepEqual(tls.ssl, { rejectUnauthorized: true }, "verification must stay ON");
  assert.match(tls.warning ?? "", /IGNORED in production/);
});

test("a provider CA certificate is honoured with verification kept on", () => {
  const tls = resolvePgTls(REMOTE, { NODE_ENV: "production", PORTAL_PG_CA_CERT: "-----BEGIN CERTIFICATE-----X" } as NodeJS.ProcessEnv);
  assert.deepEqual(tls.ssl, { rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----X" });
});

test("development defaults to verified TLS too", () => {
  const tls = resolvePgTls(REMOTE, { NODE_ENV: "development" } as NodeJS.ProcessEnv);
  assert.deepEqual(tls.ssl, { rejectUnauthorized: true });
});

test("the escape hatch works ONLY outside production, and says so loudly", () => {
  const tls = resolvePgTls(REMOTE, { NODE_ENV: "development", PORTAL_PG_ALLOW_INSECURE_TLS: "1" } as NodeJS.ProcessEnv);
  assert.deepEqual(tls.ssl, { rejectUnauthorized: false });
  assert.match(tls.warning ?? "", /DISABLED .*non-production only/);
});

test("localhost and sslmode=disable keep plain connections", () => {
  assert.equal(resolvePgTls(LOCAL, { NODE_ENV: "production" } as NodeJS.ProcessEnv).ssl, false);
  assert.equal(
    resolvePgTls("postgresql://u:p@db.example.com/db?sslmode=disable", { NODE_ENV: "production" } as NodeJS.ProcessEnv).ssl,
    false,
  );
});

test("no raw rejectUnauthorized:false survives outside the policy module (sweep)", () => {
  // Match the dangerous CONFIG idiom (an ssl assignment turning verification
  // off), not comments or type unions that merely mention the literal.
  const hits = execSync(
    `grep -rln "ssl: { rejectUnauthorized: false" "${join(ROOT, "src")}" || true`,
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean).filter(file => !file.endsWith("pgTls.ts") && !file.endsWith(".test.ts"));
  assert.deepEqual(hits, [], `insecure TLS reintroduced in: ${hits.join(", ")}`);
});
