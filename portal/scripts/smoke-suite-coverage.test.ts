import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dirname` is undefined when this file is loaded through tsx's
// CJS transform, which threw before a single assertion ran. `import.meta.url`
// is populated in both loaders.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A test file that no command runs is not a test — it is a comment that costs
 * nothing to be wrong.
 *
 * Found on 2026-08-29: 14 module `__smoke__` files had never been in
 * `smoke:all`, which named exactly one of them by hand
 * (`fulfillment/.../lifecycle.test.ts`). One of the fourteen had been failing
 * silently since the client-CRM add-on shipped — `email-sender` pins the number
 * of declared event subscribers, CRM added a fifth, and nothing ran to notice.
 * A later audit found the same class of omission in `scripts/`: seven test
 * files did not use the `smoke-` prefix and were excluded by the narrower glob.
 *
 * The hand-written list was the defect: adding a module meant remembering to
 * edit `package.json`, and nothing enforced it. `smoke:all` now globs, and this
 * test guards the glob.
 */
describe("every smoke test is actually in a suite", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const smokeAll: string = pkg.scripts["smoke:all"];
  const scriptTests = readdirSync(join(ROOT, "scripts"))
    .filter(file => file.endsWith(".test.ts"));
  const nonSmokeScriptTests = scriptTests
    .filter(file => !file.startsWith("smoke-"));
  const MODULES = join(ROOT, "src/built-ins/modules");

  const modulesWithSmoke = readdirSync(MODULES, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => {
      try {
        return readdirSync(join(MODULES, entry.name, "src/__smoke__"))
          .some(file => file.endsWith(".test.ts"));
      } catch {
        return false;
      }
    })
    .map(entry => entry.name);

  it("finds the module smoke directories at all", () => {
    // Guards the guard: if the layout moves, the checks below would pass
    // vacuously over an empty list.
    assert.ok(modulesWithSmoke.length >= 10,
      `expected the module smoke suites to still exist, found ${modulesWithSmoke.length}`);
    assert.ok(modulesWithSmoke.includes("website-editor"));
    assert.ok(modulesWithSmoke.includes("email-sender"));
  });

  it("finds script tests whose names do not start with smoke", () => {
    // Guards the scripts glob specifically: these are the files the old
    // `scripts/smoke-*.test.ts` command silently skipped.
    assert.ok(scriptTests.length >= 550,
      `expected the scripts suites to still exist, found ${scriptTests.length}`);
    assert.deepEqual(nonSmokeScriptTests.sort(), [
      "attention-protection.test.ts",
      "client-aqua-health.test.ts",
      "client-marketing-service.test.ts",
      "client-workspace-navigation.test.ts",
      "company-health.test.ts",
      "hiring-capacity.test.ts",
      "inbox-attention-thread.test.ts",
    ]);
  });

  it("smoke:all globs every script test and every non-editor module suite", () => {
    assert.match(smokeAll, /src\/built-ins\/modules\/!\(website-editor\)\/src\/__smoke__\/\*\.test\.ts/,
      "smoke:all no longer globs the module smoke suites — a new module's tests would never run");
    assert.match(smokeAll, /scripts\/\*\.test\.ts/,
      "smoke:all no longer runs every scripts test");
    assert.doesNotMatch(smokeAll, /scripts\/smoke-\*\.test\.ts/,
      "smoke:all regressed to the narrow scripts glob and omits non-smoke test names");
    assert.match(smokeAll, /PORTAL_BACKEND=memory/,
      "smoke:all must use the deterministic in-memory backend");
  });

  it("every scripts test is covered by the canonical scripts glob", () => {
    const uncovered = scriptTests.filter(() => !/scripts\/\*\.test\.ts/.test(smokeAll));
    assert.deepEqual(uncovered, [],
      `these scripts tests are not run by smoke:all: ${uncovered.join(", ")}`);
  });

  it("website-editor is excluded from smoke:all because its own gate runs it", () => {
    // Not an oversight: `run-website-editor-smoke.mjs` strips
    // `--conditions react-server` on purpose, so those 49 files need the
    // opposite Node conditions from every other suite.
    assert.match(smokeAll, /npm run smoke:website-editor/,
      "nothing runs the website-editor suites");
    const gate = readFileSync(join(ROOT, "scripts/run-website-editor-smoke.mjs"), "utf-8");
    assert.match(gate, /__smoke__/, "the website-editor gate no longer reads its smoke directory");
  });

  it("every module with smoke tests is covered by one of the two commands", () => {
    const uncovered = modulesWithSmoke.filter(name =>
      name !== "website-editor" && !/!\(website-editor\)/.test(smokeAll));
    assert.deepEqual(uncovered, [],
      `these modules' smoke tests are not run by any command: ${uncovered.join(", ")}`);
  });
});
