// T1 R028 smoke — durable HMAC nonce store.
// Run via `npm run smoke:durable-nonce-store` (tsx --test).
//
// nonceStore.ts deliberately omits `server-only` so the memory adapter
// runs under tsx. Postgres adapter is exercised via source-marker
// (it imports storagePostgres which has the shim). Multi-process
// behaviour is simulated by allocating two memory adapter instances —
// each carries its own Map; a token consumed in adapter A doesn't
// short-circuit adapter B (the prompt's "multi-process simulated"
// scenario, demonstrating why production needs Postgres).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  _createMemoryAdapterForTests,
  _createSupabaseAdapterForTests,
  _swapStoreForTests,
  getNonceStore,
} from "../src/lib/server/auth/nonceStore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STORE = join(ROOT, "src", "lib", "server", "auth", "nonceStore.ts");
const RATE_LIMIT = join(ROOT, "src", "lib", "server", "rateLimit.ts");
const MAGIC_VERIFY = join(ROOT, "src", "app", "api", "auth", "magic", "verify", "route.ts");
const VERIFY_EMAIL = join(ROOT, "src", "app", "api", "auth", "verify-email", "route.ts");
const MIGRATION = join(ROOT, "..", "supabase", "migrations", "20260912150000_durable_auth_nonces.sql");

describe("Durable nonce store — memory adapter (R028)", () => {
  it("first consume returns true", async () => {
    const store = _createMemoryAdapterForTests();
    const ok = await store.consumeNonce("nonce-1", "magic-link", 60_000);
    assert.equal(ok, true);
  });

  it("second consume of same token returns false (single-use)", async () => {
    const store = _createMemoryAdapterForTests();
    await store.consumeNonce("nonce-2", "magic-link", 60_000);
    const second = await store.consumeNonce("nonce-2", "magic-link", 60_000);
    assert.equal(second, false);
  });

  it("expired-on-arrival (ttl <= 0) is rejected", async () => {
    const store = _createMemoryAdapterForTests();
    const ok = await store.consumeNonce("nonce-3", "magic-link", 0);
    assert.equal(ok, false);
  });

  it("different tokens are independent (kind doesn't constrain key)", async () => {
    const store = _createMemoryAdapterForTests();
    assert.equal(await store.consumeNonce("a", "magic-link", 60_000), true);
    assert.equal(await store.consumeNonce("b", "email-verify", 60_000), true);
    // Same token, different kind — token is the primary key, so still rejected.
    assert.equal(await store.consumeNonce("a", "email-verify", 60_000), false);
  });

  it("re-consume of expired entry is still rejected (chapter contract)", async () => {
    // The prompt's contract: "Rejection on row existing OR expires_at < now".
    // Once consumed, the row stays — even when expired, until GC runs.
    const store = _createMemoryAdapterForTests();
    await store.consumeNonce("nonce-5", "magic-link", 1);
    // Wait past expiry.
    await new Promise(r => setTimeout(r, 5));
    assert.equal(await store.consumeNonce("nonce-5", "magic-link", 60_000), false);
  });
});

describe("Durable nonce store — gcExpiredNonces (R028)", () => {
  it("returns count of pruned rows + leaves live rows alone", async () => {
    const store = _createMemoryAdapterForTests();
    const now = Date.now();
    await store.consumeNonce("live-1", "magic-link", 60_000);
    await store.consumeNonce("live-2", "magic-link", 60_000);
    await store.consumeNonce("dead-1", "magic-link", 1);
    await store.consumeNonce("dead-2", "magic-link", 1);
    // Sweep at a time well past the 1ms TTL.
    const deleted = await store.gcExpiredNonces(now + 100);
    assert.equal(deleted, 2);
    // Live entries still reject re-use.
    assert.equal(await store.consumeNonce("live-1", "magic-link", 60_000), false);
    // Dead entries are now reusable (post-GC).
    assert.equal(await store.consumeNonce("dead-1", "magic-link", 60_000), true);
  });

  it("idempotent — second sweep returns 0", async () => {
    const store = _createMemoryAdapterForTests();
    await store.consumeNonce("d", "magic-link", 1);
    await new Promise(r => setTimeout(r, 5));
    const first = await store.gcExpiredNonces();
    const second = await store.gcExpiredNonces();
    assert.equal(first, 1);
    assert.equal(second, 0);
  });
});

describe("Durable nonce store — multi-process simulation (R028)", () => {
  it("two memory adapters do NOT share state — production needs Postgres", async () => {
    // Two memory adapters simulate two app instances that never see
    // each other's writes. The same token can be consumed twice — once
    // per adapter. This is precisely the bug the Postgres adapter
    // closes for production: row-level uniqueness across instances.
    const a = _createMemoryAdapterForTests();
    const b = _createMemoryAdapterForTests();
    assert.equal(await a.consumeNonce("shared", "magic-link", 60_000), true);
    assert.equal(await b.consumeNonce("shared", "magic-link", 60_000), true,
      "memory adapter is process-local — exact reason production must use Postgres adapter");
  });
});

describe("Durable nonce store — Postgres adapter wiring (R028, source-marker)", () => {
  it("Postgres adapter creates `nonces` table lazily + uses INSERT…ON CONFLICT DO NOTHING RETURNING", () => {
    const src = readFileSync(STORE, "utf8");
    assert.ok(src.includes("CREATE TABLE IF NOT EXISTS nonces"));
    assert.ok(src.includes("token text PRIMARY KEY"));
    assert.ok(src.includes("kind text NOT NULL"));
    assert.ok(src.includes("expires_at bigint NOT NULL"));
    assert.ok(src.includes("ON CONFLICT (token) DO NOTHING"));
    assert.ok(src.includes("RETURNING token"));
  });

  it("adapter switches on PORTAL_BACKEND === postgres OR DATABASE_URL set", () => {
    const src = readFileSync(STORE, "utf8");
    assert.ok(src.includes('explicit === "postgres"'));
    assert.ok(src.includes("process.env.DATABASE_URL"));
  });

  it("Postgres gcExpiredNonces uses DELETE WHERE expires_at < now", () => {
    const src = readFileSync(STORE, "utf8");
    assert.ok(src.match(/DELETE FROM nonces WHERE expires_at < \$1/));
  });
});

describe("Durable nonce store — Supabase production adapter", () => {
  it("uses service-role RPCs and never sends the bearer nonce", async () => {
    const previous = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SECRET_KEY,
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nonce-test.supabase.test";
    process.env.SUPABASE_SECRET_KEY = "test-secret";
    const calls: Array<{ url: string; body: string }> = [];
    try {
      const adapter = _createSupabaseAdapterForTests(async (input, init) => {
        calls.push({ url: String(input), body: String(init?.body ?? "") });
        return new Response("true", { status: 200 });
      });
      assert.equal(await adapter.consumeNonce("raw-secret-nonce", "magic-link", 60_000), true);
      assert.equal(await adapter.consumeNonce("raw-embed-nonce", "aqua-embed", 60_000), true);
      assert.equal(calls.length, 2);
      assert.match(calls[0]!.url, /consume_aqua_auth_nonce$/);
      assert.doesNotMatch(calls[0]!.body, /raw-secret-nonce/);
      assert.match(calls[0]!.body, /[0-9a-f]{64}/);
      assert.match(calls[1]!.body, /"p_kind":"aqua-embed"/);
      assert.doesNotMatch(calls[1]!.body, /raw-embed-nonce/);
    } finally {
      if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
      if (previous.key === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = previous.key;
    }
  });

  it("fails closed when production resolves no durable backend", async () => {
    const previous = { ...process.env };
    try {
      process.env.NODE_ENV = "production";
      process.env.PORTAL_BACKEND = "memory";
      delete process.env.DATABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SECRET_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      await _swapStoreForTests(null);
      assert.throws(() => getNonceStore(), /durable_nonce_store_required/);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
      await _swapStoreForTests(null);
    }
  });

  it("two independent production processes share one atomic Supabase replay ledger", async () => {
    const consumed = new Set<string>();
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { p_token_hash?: string };
      const tokenHash = body.p_token_hash ?? "";
      const first = !consumed.has(tokenHash);
      if (first) consumed.add(tokenHash);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(first));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}`;
    const worker = join(ROOT, "scripts", "fixtures", "nonce-store-worker.ts");
    const tsx = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
    const run = () => new Promise<boolean>((resolve, reject) => {
      const child = spawn(process.execPath, [tsx, worker, "shared-cross-process-nonce"], {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORTAL_BACKEND: "supabase",
          NEXT_PUBLIC_SUPABASE_URL: url,
          SUPABASE_SECRET_KEY: "local-test-secret",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += String(chunk); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", code => {
        if (code !== 0) return reject(new Error(stderr || `worker exited ${code}`));
        resolve(JSON.parse(stdout) as boolean);
      });
    });
    try {
      const results = await Promise.all([run(), run()]);
      assert.deepEqual(results.sort(), [false, true]);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("migration exposes only service-role atomic functions", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    assert.match(sql, /create table if not exists public\.aqua_auth_nonces/i);
    assert.match(sql, /'aqua-embed'/i);
    assert.match(sql, /on conflict \(token_hash\) do nothing/i);
    assert.match(sql, /security definer/i);
    assert.match(sql, /revoke all .* from public, anon, authenticated/i);
    assert.match(sql, /revoke all on table public\.aqua_auth_nonces from public, anon, authenticated, service_role/i);
    assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all).*on table public\.aqua_auth_nonces/i);
    assert.match(sql, /grant execute .* to service_role/i);
  });
});

describe("Durable nonce store — sweepExpired wires nonce GC (R028)", () => {
  it("rateLimit.sweepExpired calls getNonceStore().gcExpiredNonces + reports `nonces.deleted`", () => {
    const src = readFileSync(RATE_LIMIT, "utf8");
    assert.ok(src.includes('await import("@/lib/server/auth/nonceStore")'));
    assert.ok(src.includes("gcExpiredNonces(now)"));
    assert.ok(src.includes("nonces: { deleted: number }"));
    assert.ok(src.includes("nonces: { deleted: nonceDeleted }"));
  });

  it("nonce GC failure is non-fatal (warn + continue)", () => {
    const src = readFileSync(RATE_LIMIT, "utf8");
    assert.ok(src.includes("[sweep] nonce GC failed"));
  });
});

describe("Durable nonce store — atomic consume on hot routes (R028)", () => {
  it("/api/auth/magic/verify uses consumeMagicNonce (no check-then-mark race)", () => {
    const src = readFileSync(MAGIC_VERIFY, "utf8");
    assert.ok(src.includes("consumeMagicNonce"));
    assert.ok(!src.includes("isUsed(nonce)"), "legacy check-then-mark must be gone");
  });

  it("/api/auth/verify-email uses consumeVerifyNonce (no check-then-mark race)", () => {
    const src = readFileSync(VERIFY_EMAIL, "utf8");
    assert.ok(src.includes("consumeVerifyNonce"));
    assert.ok(!src.includes("isVerifyNonceUsed("), "legacy check-then-mark must be gone");
  });
});
