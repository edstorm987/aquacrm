import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

test("port 3032 uses Turbopack with a dedicated persistent cache", () => {
  const scripts = packageJson.scripts ?? {};
  for (const name of ["dev", "dev:sandbox"]) {
    assert.match(scripts[name] ?? "", /NEXT_DIST_DIR=\.next-dev-turbo-3032/);
    assert.match(scripts[name] ?? "", /next dev --turbopack -p 3032/);
  }
});

test("Webpack remains an explicit development fallback and production build contract", () => {
  const scripts = packageJson.scripts ?? {};
  for (const name of ["dev:webpack", "dev:sandbox:webpack"]) {
    assert.match(scripts[name] ?? "", /NEXT_DIST_DIR=\.next-dev-3032/);
    assert.match(scripts[name] ?? "", /next dev --webpack -p 3032/);
  }
  assert.match(scripts.build ?? "", /next build --webpack/);
});

test("Turbopack is rooted at the real project path", () => {
  const source = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
  assert.match(source, /turbopack:\s*\{\s*root:\s*APP_ROOT/);
});
