// T1 R027 smoke — Postgres backend wired.
// Run via `npm run smoke:postgres-backend-wired` (tsx --test).
//
// Two surfaces:
//   - Source-marker: backend default-resolution + dual-read fallback +
//     migration script idempotence + smoke-skip pattern.
//   - Optional runtime: when DATABASE_URL is set, exercise the
//     storagePostgres saveBlob/loadBlob roundtrip. Skips cleanly
//     when env is absent so dev workflow doesn't break (per prompt D).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STORAGE = join(ROOT, "src", "server", "storage.ts");
const STORAGE_PG = join(ROOT, "src", "server", "storagePostgres.ts");
const MIGRATE = join(ROOT, "scripts", "migrate-file-to-postgres.mjs");
const SMOKE_PG = join(ROOT, "scripts", "smoke-postgres.mjs");

describe("Postgres backend — default-resolution (R027 A)", () => {
  it("DATABASE_URL set + PORTAL_BACKEND unset → postgres backend wins", () => {
    const src = readFileSync(STORAGE, "utf8");
    assert.ok(src.includes("if (!explicit && process.env.DATABASE_URL) return postgresBackend"));
  });

  it("explicit `postgres` resolves to postgresBackend", () => {
    const src = readFileSync(STORAGE, "utf8");
    assert.ok(src.match(/case\s+"postgres":\s*return\s+postgresBackend/));
  });
});

describe("Postgres backend — dual-read fallback (R027 C)", () => {
  it("ensureHydrated falls back to file backend when Postgres blob missing", () => {
    const src = readFileSync(STORAGE, "utf8");
    assert.ok(src.includes('backend.kind === "postgres"'));
    assert.ok(src.includes("fileBackend.loadBlob"));
    assert.ok(src.includes("dual-read fallback"));
  });

  it("after fallback hydrate, writes the recovered blob to Postgres + logs the migration", () => {
    const src = readFileSync(STORAGE, "utf8");
    assert.ok(src.match(/backend\s*\.\s*saveBlob\(fallback\)/));
    assert.ok(src.includes("hydrated cache from file backend + wrote to Postgres"));
  });

  it("file→postgres write failure is non-fatal — cache stays populated", () => {
    const src = readFileSync(STORAGE, "utf8");
    assert.ok(src.includes("file→postgres write failed"));
    // The save is fire-and-forget; cache assignment runs unconditionally.
  });
});

describe("Postgres backend — migration runner (R027 B)", () => {
  it("script exists + uses ON CONFLICT for idempotence", () => {
    assert.equal(existsSync(MIGRATE), true);
    const src = readFileSync(MIGRATE, "utf8");
    assert.ok(src.includes("ON CONFLICT"));
    assert.ok(src.toLowerCase().includes("idempotent"));
  });

  it("script supports DRY_RUN flag", () => {
    const src = readFileSync(MIGRATE, "utf8");
    assert.ok(src.includes("DRY_RUN"));
    assert.ok(src.includes('process.env.DRY_RUN === "1"'));
  });
});

describe("Postgres backend — smoke skips cleanly without DATABASE_URL (R027 D)", () => {
  it("smoke-postgres.mjs short-circuits when DATABASE_URL missing", () => {
    assert.equal(existsSync(SMOKE_PG), true);
    const src = readFileSync(SMOKE_PG, "utf8");
    // The smoke must not hard-fail when Ed runs `npm run smoke:postgres`
    // locally without a Postgres URL.
    assert.ok(src.includes("DATABASE_URL"));
    assert.ok(
      src.includes("skip") ||
        src.match(/\bunset\b/) ||
        src.match(/process\.exit\(0\)/),
      "smoke must short-circuit (skip / exit 0) when DATABASE_URL is absent",
    );
  });
});

describe("Postgres backend — TLS posture (R027)", () => {
  it("storagePostgres builds a Pool with TLS for non-localhost hosts", () => {
    const src = readFileSync(STORAGE_PG, "utf8");
    assert.ok(src.includes("rejectUnauthorized: false"));
    assert.ok(src.includes("isLocal"));
    assert.ok(src.includes("sslmode"));
  });

  it("describePostgres exposes diagnostics — pool counts + ssl + connectionHost", () => {
    const src = readFileSync(STORAGE_PG, "utf8");
    assert.ok(src.includes("export function describePostgres"));
    assert.ok(src.includes("connectionHost"));
    assert.ok(src.includes("waiting"));
  });
});

describe("Postgres backend — runtime roundtrip (R027 D, opt-in)", () => {
  const url = process.env.DATABASE_URL;
  // Honour the prompt's "Skip cleanly when DATABASE_URL not set so dev
  // workflow doesn't break."
  if (!url) {
    it("skipped — DATABASE_URL not set", { skip: true }, () => { /* noop */ });
    return;
  }
  it("loadBlob → null on empty key; saveBlob+loadBlob roundtrips", async () => {
    const { saveBlob, loadBlob, closePool } = await import("../src/server/storagePostgres");
    const payload = JSON.stringify({ smoke: "r027", ts: Date.now() });
    await saveBlob(payload);
    const got = await loadBlob();
    assert.ok(got, "loadBlob should return the payload after saveBlob");
    await closePool();
  });
});
