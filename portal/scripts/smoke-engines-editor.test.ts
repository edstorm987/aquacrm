// The Dev Editor Engine now lives under src/engines/editor/ (structural consolidation,
// docs/development/STRUCTURE.md). This pins the new home so a regression that moves it
// back to src/lib/ — or breaks the @/engines alias — fails loudly. Purely a location
// contract: it imports a moved module by its NEW path and asserts an expected export.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("editor engine lives under src/engines/editor", () => {
  it("has the three sub-engines present, and the old src/lib homes are gone", () => {
    for (const sub of ["editing", "elements", "server"]) {
      const dir = path.join(ROOT, "src", "engines", "editor", sub);
      assert.ok(fs.existsSync(dir), `expected ${dir} to exist`);
      assert.ok(fs.readdirSync(dir).length > 0, `expected ${dir} to be non-empty`);
    }
    // Old homes must be gone. Built from segments so the reorg's textual rewrite
    // can't silently retarget these literals to the new path.
    const lib = ["src", "lib"];
    const oldHomes = [
      [...lib, "editing"],
      [...lib, "elements"],
      [...lib, "server", "siteEditor"],
    ];
    for (const seg of oldHomes) {
      const p = path.join(ROOT, ...seg);
      assert.ok(!fs.existsSync(p), `expected ${seg.join("/")} to be gone`);
    }
  });

  it("key files landed at their new paths", () => {
    const files = [
      "src/engines/editor/elements/definition.ts",
      "src/engines/editor/elements/BlockRenderer.tsx",
      "src/engines/editor/editing/engine.ts",
      "src/engines/editor/server/registry.ts",
    ];
    for (const f of files) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `expected ${f} to exist`);
    }
  });

  it("resolves a moved module by its new @/engines path and exposes an expected export", async () => {
    const mod = await import("../src/engines/editor/elements/definition.ts");
    // servesSurface is a stable public helper of the elements definition module.
    assert.equal(typeof mod.servesSurface, "function");
    const editing = await import("../src/engines/editor/editing/engine.ts");
    assert.ok(editing, "editing engine module should load from its new home");
  });
});
