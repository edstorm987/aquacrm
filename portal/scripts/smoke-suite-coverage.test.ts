import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error — .mjs sibling, no d.ts; the shapes are asserted below.
import { discoverCanonicalTests, EXCLUDED_MODULES } from "./run-canonical-suite.mjs";

// `import.meta.dirname` is undefined when this file is loaded through tsx's
// CJS transform, which threw before a single assertion ran. `import.meta.url`
// is populated in both loaders.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A test file that no command runs is not a test — it is a comment that costs
 * nothing to be wrong.
 *
 * Found on 2026-08-29: 14 module `__smoke__` files had never been in
 * `smoke:all`, which named exactly one of them by hand. One had been failing
 * silently for weeks. The hand-written list was the defect.
 *
 * The FIX at the time was a shell glob (`scripts/*.test.ts` +
 * `!(website-editor)/…`), and this test guarded that glob's literal text. On
 * 2026-09-08 the glob itself became the defect: the `!(...)` extglob is off by
 * default in a non-interactive bash, where it is a hard SYNTAX ERROR — so
 * `smoke:all` died before any test ran on CI. Discovery moved into Node
 * (scripts/run-canonical-suite.mjs), which fails CLOSED on zero discovery. This
 * test now guards the ENUMERATOR'S ACTUAL COVERAGE — the real invariant ("no
 * test file is silently skipped") — instead of a brittle package.json string.
 */
describe("every smoke test is actually in a suite", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const smokeAll: string = pkg.scripts["smoke:all"];
  const discovery = discoverCanonicalTests(ROOT) as {
    scriptTests: string[];
    moduleTests: string[];
    includedModules: string[];
    problems: string[];
  };
  const discoveredBasenames = new Set(
    [...discovery.scriptTests, ...discovery.moduleTests].map(p => p.split("/").slice(-1)[0]),
  );

  const scriptTests = readdirSync(join(ROOT, "scripts")).filter(file => file.endsWith(".test.ts"));
  const nonSmokeScriptTests = scriptTests.filter(file => !file.startsWith("smoke-"));
  const MODULES = join(ROOT, "src/built-ins/modules");
  const modulesWithSmoke = readdirSync(MODULES, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => {
      try {
        return readdirSync(join(MODULES, entry.name, "src/__smoke__")).some(file => file.endsWith(".test.ts"));
      } catch {
        return false;
      }
    })
    .map(entry => entry.name);

  it("discovery fails closed rather than silently finding nothing", () => {
    assert.deepEqual(discovery.problems, [], `discovery reported: ${discovery.problems.join("; ")}`);
    assert.ok(discovery.scriptTests.length >= 550, `expected the scripts suites, found ${discovery.scriptTests.length}`);
    assert.ok(discovery.moduleTests.length >= 10, `expected the module smokes, found ${discovery.moduleTests.length}`);
  });

  it("the enumerator discovers EVERY scripts test — including non-smoke-prefixed names", () => {
    // These are exactly the files the old narrow `scripts/smoke-*.test.ts` glob
    // silently skipped; the enumerator uses `*.test.ts`, so all must appear.
    assert.deepEqual(nonSmokeScriptTests.sort(), [
      "attention-protection.test.ts",
      "client-aqua-health.test.ts",
      "client-marketing-service.test.ts",
      "client-workspace-navigation.test.ts",
      "company-health.test.ts",
      "hiring-capacity.test.ts",
      "inbox-attention-thread.test.ts",
    ]);
    const missing = scriptTests.filter(file => !discoveredBasenames.has(file));
    assert.deepEqual(missing, [], `these scripts tests are not discovered by the enumerator: ${missing.join(", ")}`);
  });

  it("the enumerator discovers every non-website-editor module's smoke suite", () => {
    assert.ok(modulesWithSmoke.length >= 10, `expected module smoke suites, found ${modulesWithSmoke.length}`);
    assert.ok(modulesWithSmoke.includes("website-editor"));
    assert.ok(modulesWithSmoke.includes("email-sender"));
    const expected = modulesWithSmoke.filter(name => name !== "website-editor").sort();
    assert.deepEqual(discovery.includedModules.map((m: string) => m.replace(/\(\d+\)$/, "")).sort(), expected);
  });

  it("website-editor is excluded from the enumerator because its own gate runs it", () => {
    // Not an oversight: `run-website-editor-smoke.mjs` strips
    // `--conditions react-server` on purpose, so those 49 files need the
    // opposite Node conditions from every other suite.
    assert.ok((EXCLUDED_MODULES as Set<string>).has("website-editor"));
    assert.ok(!discovery.moduleTests.some((p: string) => p.includes("/website-editor/")));
    assert.match(smokeAll, /npm run smoke:website-editor/, "nothing runs the website-editor suites");
    const gate = readFileSync(join(ROOT, "scripts/run-website-editor-smoke.mjs"), "utf-8");
    assert.match(gate, /__smoke__/, "the website-editor gate no longer reads its smoke directory");
  });

  it("smoke:all runs the deterministic enumerator, then the website-editor gate", () => {
    assert.match(smokeAll, /run-canonical-suite\.mjs/, "smoke:all no longer runs the canonical enumerator");
    assert.match(smokeAll, /&&\s*npm run smoke:website-editor/, "smoke:all no longer chains the website-editor gate");
    // The enumerator forces the in-memory backend itself; assert it at the source.
    const enumerator = readFileSync(join(ROOT, "scripts/run-canonical-suite.mjs"), "utf-8");
    assert.match(enumerator, /PORTAL_BACKEND.*memory/, "the enumerator must default to the in-memory backend");
    assert.match(enumerator, /process\.exit\(2\)/, "the enumerator must fail closed on empty discovery");
  });
});
