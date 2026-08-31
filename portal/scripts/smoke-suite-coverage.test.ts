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
 *
 * The hand-written list was the defect: adding a module meant remembering to
 * edit `package.json`, and nothing enforced it. `smoke:all` now globs, and this
 * test guards the glob.
 */
describe("every smoke test is actually in a suite", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const smokeAll: string = pkg.scripts["smoke:all"];
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

  it("smoke:all globs the module suites instead of naming them by hand", () => {
    assert.match(smokeAll, /src\/built-ins\/modules\/!\(website-editor\)\/src\/__smoke__\/\*\.test\.ts/,
      "smoke:all no longer globs the module smoke suites — a new module's tests would never run");
    assert.match(smokeAll, /scripts\/smoke-\*\.test\.ts/,
      "smoke:all no longer runs the scripts suite");
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
