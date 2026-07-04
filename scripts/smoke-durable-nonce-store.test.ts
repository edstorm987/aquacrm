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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  _createMemoryAdapterForTests,
} from "../src/lib/server/nonceStore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STORE = join(ROOT, "src", "lib", "server", "nonceStore.ts");
const RATE_LIMIT = join(ROOT, "src", "lib", "server", "rateLimit.ts");
const MAGIC_VERIFY = join(ROOT, "src", "app", "api", "auth", "magic", "verify", "route.ts");
const VERIFY_EMAIL = join(ROOT, "src", "app", "api", "auth", "verify-email", "route.ts");

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

describe("Durable nonce store — sweepExpired wires nonce GC (R028)", () => {
  it("rateLimit.sweepExpired calls getNonceStore().gcExpiredNonces + reports `nonces.deleted`", () => {
    const src = readFileSync(RATE_LIMIT, "utf8");
    assert.ok(src.includes('await import("./nonceStore")'));
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
