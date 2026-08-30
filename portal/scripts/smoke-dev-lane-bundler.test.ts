// Which bundler each dev lane runs, and why it matters.
//
// Ed, 2026-08-29: *"this app is very very very heavy on the server, 11+ GB on
// RAM."*
//
// ── The measurement ──────────────────────────────────────────────────────
//
// Measured that day on one machine, same seven routes, same state file, cold
// start each time:
//
//   | after compiling 7 routes | webpack | turbopack |
//   | memory                   | 3.17 GB |  1.54 GB  |
//   | /portal/agency           |  9.42s  |   3.46s   |
//   | /portal/agency/settings  |  9.05s  |   1.90s   |
//   | /portal/dev-team         |  3.25s  |   0.36s   |
//
// Boot is ~0.17 GB either way, so this is not a leak in the state document
// (~1.2 MB) — it is the dev compiler holding a module graph per compiled
// route, and there are ~169 destinations. Turbopack halves the slope.
//
// ── The rule ─────────────────────────────────────────────────────────────
//
// `smoke-sandbox-protection` already states the design: *"The normal 3032 path
// intentionally uses Turbopack; webpack is retained as an explicit fallback."*
// `dev:worker` — the lane `sandbox:fork` tells you to run — was still on
// webpack, which made the lane people actually work in the slow, heavy one.
// That was inconsistency, not intent: nothing pinned it and nothing documented
// it.
//
// So: a lane whose name does NOT say webpack runs Turbopack. A lane whose name
// says webpack keeps webpack, because a fallback that quietly stopped being a
// fallback would leave nothing to fall back to.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("dev lanes run Turbopack unless they say otherwise", () => {
  it("the worker lane — the one sandbox:fork hands you — is Turbopack", () => {
    assert.match(pkg.scripts["dev:worker"], /next dev --turbopack/,
      "dev:worker is the lane people actually work in; webpack costs 2x memory here");
    assert.doesNotMatch(pkg.scripts["dev:worker"], /--webpack/);
  });

  it("every lane not named webpack uses Turbopack", () => {
    for (const [name, script] of Object.entries(pkg.scripts)) {
      if (!name.startsWith("dev")) continue;
      if (name.includes("webpack")) continue;
      // `dev:verify` is deliberately excluded below; everything else that
      // spawns a dev server must be Turbopack.
      if (name === "dev:verify" || name === "dev:sandbox:real") continue;
      if (!script.includes("next dev")) continue;
      assert.match(script, /--turbopack/, `${name} spawns a dev server but not with Turbopack`);
    }
  });
});

describe("the webpack fallbacks stay", () => {
  it("keeps an explicit webpack lane for the worker", () => {
    // A fallback nobody can reach is not a fallback. If Turbopack ever breaks
    // on this codebase, this is the way back.
    assert.match(pkg.scripts["dev:worker:webpack"], /next dev --webpack/);
  });

  it("leaves dev:verify on webpack, because the BUILD is webpack", () => {
    // `build` runs `next build --webpack`. Verifying against a different
    // bundler than the one that ships would be verifying the wrong thing.
    assert.match(pkg.scripts.build, /next build --webpack/);
    assert.match(pkg.scripts["dev:verify"], /next dev --webpack/);
  });

  it("leaves the named sandbox fallbacks alone", () => {
    // Pinned by smoke-sandbox-protection for its own reasons; asserted here so
    // a future sweep of this file does not "tidy" them.
    assert.match(pkg.scripts["dev:sandbox:webpack"], /--webpack/);
    assert.match(pkg.scripts["dev:sandbox:real"], /--webpack/);
  });
});

describe("build directories are never shared between bundlers", () => {
  it("the fork script hands out a Turbopack-specific dist dir", () => {
    // Their caches are incompatible; sharing one produces stale-build failures
    // that look like application bugs.
    const fork = readFileSync("scripts/fork-sandbox.mjs", "utf8");
    assert.match(fork, /const distDir = `\.next-\$\{name\}-turbo`;/);
  });
});
