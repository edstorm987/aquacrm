// Standalone portal perf/source smoke.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FOUNDER_SEED = readFileSync(join(ROOT, "src/lib/server/seeds/founderSeed.ts"), "utf8");

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

  it("perf baseline resolves build output when the workspace path contains spaces", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "aqua perf baseline "));
    const fixtureScript = join(fixtureRoot, "scripts", "perf-baseline.mjs");
    const fixtureChunk = join(fixtureRoot, ".next", "static", "chunks", "fixture.js");
    const chunkSource = "export const fixture = true;\n";

    try {
      mkdirSync(dirname(fixtureScript), { recursive: true });
      mkdirSync(dirname(fixtureChunk), { recursive: true });
      writeFileSync(fixtureScript, readFileSync(join(ROOT, "scripts", "perf-baseline.mjs"), "utf8"));
      writeFileSync(fixtureChunk, chunkSource);

      const stdout = execFileSync(process.execPath, [fixtureScript, "--no-build"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const baseline = JSON.parse(stdout);

      assert.equal(baseline.totals.staticChunksBytes, Buffer.byteLength(chunkSource));
      assert.equal(baseline.topChunks[0]?.file, ".next/static/chunks/fixture.js");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("retired public static apps are not shipped", () => {
    assert.equal(existsSync(join(ROOT, "public", "aquacrm-site")), true);
    for (const folder of ["incubator", "_marketing"]) {
      assert.equal(existsSync(join(ROOT, "public", folder)), false, `${folder} should live outside this portal app`);
    }
  });
});

// ─── Bundle split (2026-08-19) ─────────────────────────────────────────────
//
// Two load-timing changes with no behaviour change: the website-editor block
// library is no longer statically imported by its registry, and React Flow's
// stylesheet no longer ships on every route. Both are invisible at runtime and
// so both are easy to undo by accident — these guards make the undo loud.

describe("Perf — bundle split guards", () => {
  const REGISTRY = readFileSync(
    join(ROOT, "src/built-ins/modules/website-editor/src/components/blockRegistry.ts"),
    "utf8",
  );
  const GLOBALS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
  const CANVAS = readFileSync(join(ROOT, "src/app/portal/agency/automations/_AutomationsCanvas.tsx"), "utf8");

  it("the block registry loads all 78 block components lazily", () => {
    // A single static import here re-couples the whole block library to every
    // route that reads the registry — which is what made the editor and sites
    // routes the heaviest in the app.
    const staticImports = REGISTRY.match(/^import \w+ from "\.\/blocks\//gm) ?? [];
    assert.deepEqual(staticImports, [], "blockRegistry.ts is statically importing block components again");

    const loaders = REGISTRY.match(/lazyBlock\(\(\) => import\("\.\/blocks\/\w+"\)/g) ?? [];
    assert.equal(loaders.length, 78, `expected 78 lazy block loaders, found ${loaders.length}`);
    assert.match(REGISTRY, /import \{ lazyBlock \} from "\.\/lazyBlock"/);
  });

  it("lazyBlock keeps each block behind its own Suspense boundary", () => {
    // Without a per-block boundary a block suspending on first paint blanks the
    // nearest ancestor boundary — in the editor, the entire canvas.
    const helper = readFileSync(
      join(ROOT, "src/built-ins/modules/website-editor/src/components/lazyBlock.tsx"),
      "utf8",
    );
    assert.match(helper, /lazy\(load\)/);
    assert.match(helper, /<Suspense fallback=\{null\}>/);
    assert.match(helper, /LazyBlock\.displayName = `LazyBlock\(\$\{name\}\)`/);
  });

  it("React Flow's stylesheet is scoped to the automations canvas", () => {
    // It used to be line 1 of globals.css, so every route paid for it.
    // Matched on the @import, not the mention — globals.css carries a comment
    // on this line explaining where the stylesheet went.
    assert.doesNotMatch(GLOBALS, /@import\s+"@xyflow\/react/, "globals.css is importing React Flow CSS on every route again");
    assert.match(CANVAS, /import "@xyflow\/react\/dist\/style\.css"/);
  });

  it("the automations canvas is the only surface that renders React Flow", () => {
    // If a second surface starts using React Flow it needs the stylesheet too —
    // which no longer arrives for free from globals.css.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const source = readFileSync(full, "utf8");
        // `import type { … } from "@xyflow/react"` is erased at compile time,
        // so it costs nothing and needs no CSS.
        if (/^import (?!type )[^;]*from "@xyflow\/react"/m.test(source)) {
          offenders.push(full.slice(ROOT.length + 1));
        }
      }
    };
    walk(join(ROOT, "src"));
    assert.deepEqual(offenders, ["src/app/portal/agency/automations/_AutomationsCanvas.tsx"]);
  });

  it("every React Flow override in globals.css still outranks the base sheet", () => {
    // The base sheet's selectors are single-class. The overrides only kept
    // winning after the move because each is at least two selectors deep, so
    // load order stopped mattering. A bare `.react-flow__x { … }` here would
    // silently lose to whichever sheet loads last.
    const bare = GLOBALS.split("\n")
      .map(line => line.trim())
      .filter(line => /^\.react-flow__/.test(line));
    assert.deepEqual(bare, [], "globals.css has an unscoped .react-flow__ override that depends on load order");
  });
});
