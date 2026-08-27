import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  captureBenchmarkNextEnv,
  restoreBenchmarkNextEnv,
  snapshotNextEnv,
} from "./lib/production-benchmark-next-env.mjs";

const DIST_NAME = ".next-production-benchmark-sentinel";
const generated = `/// <reference types="next" />\nimport "./${DIST_NAME}/types/routes.d.ts";\n`;

test("benchmark restores exact pre-build next-env bytes", async () => {
  await withTemporaryNextEnv(async path => {
    const sentinel = Buffer.from("sentinel-before-build\n\0binary-safe\n");
    writeFileSync(path, sentinel);
    const before = await snapshotNextEnv(path);
    writeFileSync(path, generated);
    const owned = await captureBenchmarkNextEnv(path, DIST_NAME);

    assert.equal(await restoreBenchmarkNextEnv({ path, distName: DIST_NAME, before, generated: owned }), "restored");
    assert.deepEqual(readFileSync(path), sentinel);
  });
});

test("benchmark deletes a next-env file that did not exist before its build", async () => {
  await withTemporaryNextEnv(async path => {
    const before = await snapshotNextEnv(path);
    assert.equal(before.exists, false);
    writeFileSync(path, generated);
    const owned = await captureBenchmarkNextEnv(path, DIST_NAME);

    assert.equal(await restoreBenchmarkNextEnv({ path, distName: DIST_NAME, before, generated: owned }), "deleted");
    assert.equal(existsSync(path), false);
  });
});

test("benchmark preserves a concurrent next-env edit even when it still mentions this run", async () => {
  await withTemporaryNextEnv(async path => {
    writeFileSync(path, "sentinel-before-build\n");
    const before = await snapshotNextEnv(path);
    writeFileSync(path, generated);
    const owned = await captureBenchmarkNextEnv(path, DIST_NAME);
    const concurrent = `${generated}// concurrent legitimate change\n`;
    writeFileSync(path, concurrent);

    assert.equal(
      await restoreBenchmarkNextEnv({ path, distName: DIST_NAME, before, generated: owned }),
      "skipped-concurrent-change",
    );
    assert.equal(readFileSync(path, "utf8"), concurrent);
  });
});

async function withTemporaryNextEnv(operation: (path: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "aqua-next-env-isolation-"));
  try {
    await operation(join(directory, "next-env.d.ts"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
