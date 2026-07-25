// Standalone portal perf/source smoke.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FOUNDER_SEED = readFileSync(join(ROOT, "src/lib/server/founderSeed.ts"), "utf8");

describe("Perf — standalone portal guards", () => {
  it("founderSeed.ts keeps dev-bypass seeding memoized", () => {
    assert.ok(FOUNDER_SEED.includes("DEV_SEED_TTL_MS"));
    assert.ok(FOUNDER_SEED.includes("30_000"));
    assert.ok(FOUNDER_SEED.includes("devSeedPromise"));
    assert.ok(FOUNDER_SEED.includes("devSeedPromise = null"));
    assert.ok(FOUNDER_SEED.includes("devSeedAt = 0"));
  });

  it("performance scripts target the standalone portal", () => {
    const perf = readFileSync(join(ROOT, "scripts/smoke-perf.mjs"), "utf8");
    const baseline = readFileSync(join(ROOT, "scripts/perf-baseline.mjs"), "utf8");
    assert.ok(perf.includes("http://localhost:3032"));
    assert.ok(perf.includes("/portal/agency"));
    assert.ok(perf.includes("/portal/clients"));
    assert.ok(baseline.includes("perf-baseline"));
    assert.ok(baseline.includes(".next"));
  });

  it("old public static apps are not part of this separated portal", () => {
    for (const folder of ["health-check", "business-os", "incubator", "_marketing"]) {
      assert.equal(existsSync(join(ROOT, "public", folder)), false, `${folder} should live outside this portal app`);
    }
  });
});
