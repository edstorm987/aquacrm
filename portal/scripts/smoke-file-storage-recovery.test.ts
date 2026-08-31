import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dirname` is undefined when this file is loaded through tsx's
// CJS transform, which threw before a single assertion ran. `import.meta.url`
// is populated in both loaders.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(code: string, dataFile: string): string {
  const script = `void (async () => {\n${code}\n})().catch((error) => { console.error(error); process.exitCode = 1; });`;
  return execFileSync("npx", ["tsx", "-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: "--conditions react-server",
      PORTAL_BACKEND: "file",
      PORTAL_DATA_FILE: dataFile,
      PORTAL_ALLOW_SHARED_STATE: "1",
    },
  }).trim();
}

test("file persistence atomically stores an acknowledged mutation", () => {
  const dir = mkdtempSync(join(tmpdir(), "aqua-file-store-"));
  const file = join(dir, "state.json");
  const output = run([
    "const { default: s } = await import('./src/server/storage.ts');",
    "await s.ensureHydrated();",
    "s.mutate(state => { state.agencies.atomic = { id: 'atomic', name: 'Atomic', slug: 'atomic', status: 'active', createdAt: 1, updatedAt: 1 }; });",
    "await s.flushPendingWrites();",
    "console.log(JSON.stringify(s.getBackendInfo()));",
  ].join("\n"), file);

  const stored = JSON.parse(readFileSync(file, "utf8")) as { agencies?: Record<string, unknown> };
  assert.ok(stored.agencies?.atomic);
  assert.equal(JSON.parse(output).writable, true);
  assert.deepEqual(readdirSync(dir).filter(name => name.endsWith(".tmp")), []);
});

test("a failed file write is reported and disables further acknowledgement", () => {
  const dir = mkdtempSync(join(tmpdir(), "aqua-file-failure-"));
  const file = join(dir, "state.json");
  const output = run([
    "const fs = await import('node:fs');",
    "const { default: s } = await import('./src/server/storage.ts');",
    "await s.ensureHydrated();",
    `fs.mkdirSync(${JSON.stringify(file)});`,
    "s.mutate(state => { state.agencies.failed = { id: 'failed', name: 'Failed', slug: 'failed', status: 'active', createdAt: 1, updatedAt: 1 }; });",
    "let message = '';",
    "try { await s.flushPendingWrites(); } catch (error) { message = error instanceof Error ? error.message : String(error); }",
    "console.log(JSON.stringify({ message, info: s.getBackendInfo() }));",
  ].join("\n"), file);

  const result = JSON.parse(output) as { message: string; info: { writable: boolean } };
  assert.match(result.message, /EISDIR|directory|not writable/i);
  assert.equal(result.info.writable, false);
});

test("malformed file state fails closed and is never overwritten", () => {
  const dir = mkdtempSync(join(tmpdir(), "aqua-file-corrupt-"));
  const file = join(dir, "state.json");
  const corrupt = "{ this is not valid portal state";
  writeFileSync(file, corrupt, "utf8");

  const output = run([
    "const { default: s } = await import('./src/server/storage.ts');",
    "let hydrateError = '';",
    "try { await s.ensureHydrated(); } catch (error) { hydrateError = error instanceof Error ? error.message : String(error); }",
    "s.mutate(state => { state.agencies.shouldNotLand = { id: 'x', name: 'x', slug: 'x', status: 'active', createdAt: 1, updatedAt: 1 }; });",
    "let flushError = '';",
    "try { await s.flushPendingWrites(); } catch (error) { flushError = error instanceof Error ? error.message : String(error); }",
    "console.log(JSON.stringify({ hydrateError, flushError, info: s.getBackendInfo() }));",
  ].join("\n"), file);

  const result = JSON.parse(output) as { hydrateError: string; flushError: string; info: { writable: boolean } };
  assert.match(result.hydrateError, /file state could not be loaded/i);
  assert.match(result.flushError, /Unexpected token|JSON|not valid/i);
  assert.equal(result.info.writable, false);
  assert.equal(readFileSync(file, "utf8"), corrupt);
});
