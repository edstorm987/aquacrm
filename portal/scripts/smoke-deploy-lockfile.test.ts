// The lockfile must be able to build on the platform we deploy to.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// Five of eight Vercel deployments failed, across two pull requests, with no
// visible cause. The local build passed every time — including a deliberately
// cacheless `rm -rf .next && npm run build` — so the failure was written off
// three times as "not ours", and the deploy logs need an authentication this
// session does not have.
//
// The local build passed for a reason that had nothing to do with the code.
// `lightningcss` and `@tailwindcss/oxide` ship their native binaries as
// per-platform OPTIONAL dependencies, and `package-lock.json` was generated on
// a Mac, so it recorded `lightningcss-darwin-arm64` and
// `@tailwindcss/oxide-darwin-arm64` and NO Linux build at all. `npm install`
// installs what the lockfile records, so on Linux both packages arrive without
// their binding.
//
// It kept working locally because a Linux binary happened to be sitting in the
// REPOSITORY ROOT's `node_modules`, one directory above `portal/`. Node's
// resolver walks up parent directories, found it there, and every local build
// was quietly satisfied by a file no deployment would ever have. Vercel's Root
// Directory is `portal`, so there is no parent to walk up to:
//
//     Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
//       node_modules/lightningcss/node/index.js
//       ← @tailwindcss/node ← @tailwindcss/postcss ← next's CSS config
//
// Reproduced by checking out `portal/` alone and running Vercel's own
// `npm install --legacy-peer-deps && npm run build`: it failed on the first CSS
// module, and passed once the Linux builds were declared. `@tailwindcss/oxide`
// even names the npm bug behind it (npm/cli#4828) in its own error text.
//
// ── What this pins ───────────────────────────────────────────────────────
//
// Not the two package names — the RULE. Any dependency that ships per-platform
// native binaries must have its Linux x64 build recorded in the lockfile. A new
// native dependency added from a Mac fails here rather than six deployments
// later, and the local build cannot mask it: this reads the lockfile, not
// `node_modules`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type LockPackage = {
  version?: string;
  os?: string[];
  optionalDependencies?: Record<string, string>;
};

const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as {
  packages: Record<string, LockPackage>;
};

const recorded = new Set(Object.keys(lock.packages).map(key => key.replace("node_modules/", "")));

/** A dependency name that encodes a platform, e.g. `lightningcss-darwin-arm64`. */
const PLATFORM_SUFFIXED = /-(linux|darwin|win32|freebsd|android)(-|$)/;
/** The build platform Vercel uses, and the one this repository deploys to. */
const DEPLOY_TARGET = /-linux-x64(-gnu)?$/;

describe("the lockfile can build where we deploy", () => {
  it("finds the lockfile at all", () => {
    // A lockfile this failed to parse would make every assertion below
    // vacuously true — the failure mode the whole file exists to avoid.
    assert.ok(
      Object.keys(lock.packages).length > 100,
      `expected a full dependency tree, read ${Object.keys(lock.packages).length} entries`,
    );
  });

  it("records a Linux x64 build for every native dependency", () => {
    const missing: string[] = [];
    for (const [key, entry] of Object.entries(lock.packages)) {
      for (const dependency of Object.keys(entry.optionalDependencies ?? {})) {
        if (!PLATFORM_SUFFIXED.test(dependency)) continue;
        if (!DEPLOY_TARGET.test(dependency)) continue;
        if (recorded.has(dependency)) continue;
        missing.push(`${key.replace("node_modules/", "") || "(root)"} → ${dependency}`);
      }
    }

    assert.deepEqual(
      missing,
      [],
      "these packages ship a Linux x64 native binary that the lockfile does not record, "
      + "so `npm install` on Linux will leave them without a binding and the build will fail "
      + `where it deploys even though it passes here:\n  ${missing.join("\n  ")}\n`
      + "Add the named package to `optionalDependencies` in package.json at the same version as "
      + "its parent, then re-run `npm install --legacy-peer-deps`.",
    );
  });

  it("keeps the macOS builds too, so a Mac checkout is unaffected", () => {
    // The fix must not trade one platform for the other. Both are `optional`
    // with an `os` constraint, so each machine installs only what it can use.
    for (const name of ["lightningcss-darwin-arm64", "@tailwindcss/oxide-darwin-arm64"]) {
      assert.ok(recorded.has(name), `${name} was dropped from the lockfile`);
    }
  });

  it("pins each native binary to its parent's exact version", () => {
    // A native binding is compiled against one release of its own package. A
    // caret range here would let `npm install` pair 1.32.0 with a 1.33 binary,
    // which fails at load with the same "cannot find native binding" message
    // this test exists to prevent — but only on the deploy machine.
    const pairs: [string, string][] = [
      ["lightningcss", "lightningcss-linux-x64-gnu"],
      ["@tailwindcss/oxide", "@tailwindcss/oxide-linux-x64-gnu"],
    ];
    for (const [parent, binary] of pairs) {
      const parentVersion = lock.packages[`node_modules/${parent}`]?.version;
      const binaryVersion = lock.packages[`node_modules/${binary}`]?.version;
      assert.ok(parentVersion, `${parent} is not in the lockfile`);
      assert.equal(binaryVersion, parentVersion, `${binary} must match ${parent}@${parentVersion}`);
    }

    // …and declared exactly, not as a range, in package.json itself.
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      optionalDependencies?: Record<string, string>;
    };
    for (const [name, range] of Object.entries(manifest.optionalDependencies ?? {})) {
      assert.match(range, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly, not "${range}"`);
    }
  });

  it("still builds from portal/ alone — the thing Vercel actually does", () => {
    // Vercel's Root Directory is `portal`, so the parent `node_modules` that
    // masked this for months does not exist there. Nothing in the build may
    // depend on a path outside this directory.
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
      installCommand?: string;
      buildCommand?: string;
    };
    assert.equal(vercel.installCommand, "npm install --legacy-peer-deps");
    assert.equal(vercel.buildCommand, "npm run build");
    // If the install command ever gains `--no-optional`, every native binding
    // disappears again and this whole file is defeated.
    assert.doesNotMatch(vercel.installCommand ?? "", /--no-optional|--omit=optional/);
  });
});
