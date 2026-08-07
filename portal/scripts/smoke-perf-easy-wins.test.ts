// Standalone portal perf/source smoke.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FOUNDER_SEED = readFileSync(join(ROOT, "src/lib/server/founderSeed.ts"), "utf8");

describe("Perf — AquaCRM guards", () => {
  it("founderSeed.ts keeps idempotent seeding memoized", () => {
    assert.ok(FOUNDER_SEED.includes("let seedPromise: Promise<void> | null = null"));
    assert.ok(FOUNDER_SEED.includes("if (!seedPromise) seedPromise = run()"));
    assert.ok(FOUNDER_SEED.includes("return seedPromise"));
  });

  it("performance scripts target the standalone portal", () => {
    const perf = readFileSync(join(ROOT, "scripts/smoke-perf.mjs"), "utf8");
    const baseline = readFileSync(join(ROOT, "scripts/perf-baseline.mjs"), "utf8");
    assert.ok(perf.includes("http://localhost:3030"));
    assert.ok(perf.includes("/portal/agency"));
    assert.ok(perf.includes("/portal/clients"));
    assert.ok(baseline.includes("perf-baseline"));
    assert.ok(baseline.includes(".next"));
  });

  it("retired public static apps are not shipped", () => {
    assert.equal(existsSync(join(ROOT, "public", "aquacrm-site")), true);
    for (const folder of ["incubator", "_marketing"]) {
      assert.equal(existsSync(join(ROOT, "public", folder)), false, `${folder} should live outside this portal app`);
    }
  });
});
