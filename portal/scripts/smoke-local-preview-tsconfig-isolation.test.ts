import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();

test("supervised previews isolate Next's generated TypeScript includes", async () => {
  const [nextConfig, supervisor, manifest, gitignore] = await Promise.all([
    readFile(`${root}/next.config.ts`, "utf8"),
    readFile(`${root}/src/lib/server/dev/localRepositoryPreviewSupervisor.ts`, "utf8"),
    readFile(`${root}/aqua-preview.config.json`, "utf8"),
    readFile(`${root}/../.gitignore`, "utf8"),
  ]);

  assert.match(nextConfig, /tsconfigPath:\s*process\.env\.NEXT_TYPESCRIPT_CONFIG_PATH\s*\|\|\s*["']tsconfig\.json["']/);
  assert.match(supervisor, /GENERATED_CONFIG_DIRECTORY\s*=\s*["']\.aqua-preview-config["']/);
  assert.match(supervisor, /env\.NEXT_TYPESCRIPT_CONFIG_PATH\s*=\s*previewTypeScriptConfig\.environmentPath/);
  assert.match(supervisor, /entry\.generatedTypeScriptConfigPath\s*=\s*previewTypeScriptConfig\.absolutePath/);
  assert.match(supervisor, /unlinkSync\(generatedTypeScriptConfigPath\)/);
  assert.match(manifest, /"NEXT_DIST_DIR"\s*:/);
  // Unanchored since 2026-08-27: the same repository is also checked out inside
  // an isolated preview worktree, where an anchored `portal/...` rule would not
  // match the nested copy and the generated shim would show up as untracked.
  assert.match(gitignore, /^\.aqua-preview-config\/$/m);
  assert.match(gitignore, /^\.aqua-preview-worktrees\/$/m);
});
