import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The shared dev sandbox must survive the test suite.
//
// This exists because it did not. `.data/portal-state.json` is the ONE dev
// server's state, the file backend is the default, and its default path is
// exactly that file — so every smoke file that did not pin
// `PORTAL_BACKEND=memory` (about three quarters of them) flushed its own seeded
// state over Ed's workspace. Running the full suite, which the project contract
// REQUIRES before calling a behaviour change done, emptied it: 0 agencies,
// 0 clients, 0 users. Restored from a worker's fork on 2026-08-20.
//
// These are the two guarantees that stop it recurring.

// fileURLToPath, not `.pathname` — this project lives under a path with spaces,
// and a raw pathname keeps them percent-encoded.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHARED = join(ROOT, ".data", "portal-state.json");

test("a test process resolves to memory, never the shared state file", async () => {
  const { getBackendInfo } = await import("../src/server/storage");
  const info = getBackendInfo();
  assert.equal(info.kind, "memory", `a test must run on memory — got ${info.kind}`);
  assert.doesNotMatch(
    JSON.stringify(info),
    /portal-state\.json/,
    `a test must never bind the shared sandbox — got: ${JSON.stringify(info)}`,
  );
});

test("the shared sandbox is opt-in, not opt-out", () => {
  const source = readFileSync(join(ROOT, "src/server/storage.ts"), "utf8");
  // Inferring which processes are "safe" was the wrong shape — node:test children
  // were covered but a plain `npx tsx scripts/foo.ts` was not, and several of
  // those create tenants. The rule is now positive: say you are the dev server,
  // or name your own file, or you get memory.
  assert.match(source, /PORTAL_ALLOW_SHARED_STATE/, "the opt-in env var is gone");
  assert.match(source, /function mayTouchSharedState\(\)/);
  const guards = source.match(/if \(!mayTouchSharedState\(\)\) return memoryBackend;/g) ?? [];
  assert.equal(guards.length, 1, "exactly one guard, on the file backend");
  // It must sit with the file backend, NOT at the top of pickBackend — up there
  // it also swallowed an explicit supabase/postgres choice.
  const guardAt = source.indexOf("if (!mayTouchSharedState()) return memoryBackend;");
  const fileReturnAt = source.indexOf("return fileBackend;");
  assert.ok(guardAt > 0 && fileReturnAt > guardAt && fileReturnAt - guardAt < 400,
    "the guard must sit immediately before `return fileBackend`");

  // And every shared-state server must actually opt in, or the sandbox stops
  // persisting. The normal 3032 path intentionally uses Turbopack; webpack is
  // retained as an explicit fallback instead of being silently required by a
  // stale smoke assertion.
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  for (const name of ["dev:sandbox", "dev:sandbox:webpack", "dev:sandbox:real"]) {
    assert.match(pkg.scripts[name], /PORTAL_ALLOW_SHARED_STATE=1/, `${name} must opt in to the shared sandbox`);
  }
  assert.match(pkg.scripts["dev:sandbox"], /NEXT_DIST_DIR=\.next-dev-turbo-3032/, "dev:sandbox must isolate Turbopack output");
  assert.match(pkg.scripts["dev:sandbox"], /next dev --turbopack/, "dev:sandbox must use the intended Turbopack dev compiler");
  for (const name of ["dev:sandbox:webpack", "dev:sandbox:real"]) {
    assert.match(pkg.scripts[name], /NEXT_DIST_DIR=\.next-dev-3032/, `${name} must isolate webpack output`);
    assert.match(pkg.scripts[name], /next dev --webpack/, `${name} must remain an explicit webpack fallback`);
    assert.doesNotMatch(pkg.scripts[name], /--turbopack/, `${name} must not stop being a webpack fallback`);
  }
});

/**
 * Read the tenant slugs out of the shared sandbox.
 *
 * Byte-identity is the WRONG assertion here: the founder's dev server is
 * legitimately opted in (PORTAL_ALLOW_SHARED_STATE=1) and writes as he clicks
 * around, so a byte comparison fails for an innocent reason and cries wolf at
 * every worker. What must never happen is a TEST or a script putting a tenant
 * in there — which is exactly what leaked five fixture agencies on 2026-08-20.
 */
function tenantSlugs(): string[] {
  try {
    const state = JSON.parse(readFileSync(SHARED, "utf8")) as { agencies?: Record<string, { slug?: string }> };
    return Object.values(state.agencies ?? {}).map(a => a.slug ?? "").sort();
  } catch {
    return [];
  }
}

test("a plain tsx script — not just a test — cannot reach the shared sandbox", () => {
  const before = tenantSlugs();
  const probe = [
    "import('./src/server/storage.ts').then(async s => {",
    "  await s.ensureHydrated();",
    "  s.mutate(st => { st.agencies['pollute-probe'] = { id: 'pollute-probe', slug: 'pollute-probe' }; });",
    "  await s.flushPendingWrites();",
    "}).catch(() => {});",
  ].join("");
  const env = { ...process.env, NODE_OPTIONS: "--conditions react-server" };
  delete env.NODE_TEST_CONTEXT;
  delete env.PORTAL_DATA_FILE;
  delete env.PORTAL_ALLOW_SHARED_STATE;
  delete env.PORTAL_BACKEND;
  execFileSync(process.execPath, ["--import", "tsx", "-e", probe], { cwd: ROOT, env, stdio: "ignore" });
  assert.deepEqual(tenantSlugs(), before, "a plain script wrote a tenant into the shared sandbox");
});

test("running a smoke file leaves the shared sandbox byte-identical", () => {
  // The real proof, end to end: take the file's size + mtime, run a smoke file
  // that does NOT pin the backend, and require the file to be untouched.
  const before = tenantSlugs();

  execFileSync(
    process.execPath,
    ["--import", "tsx", "--test", "scripts/smoke-client-match.test.ts"],
    { cwd: ROOT, env: { ...process.env, NODE_OPTIONS: "--conditions react-server" }, stdio: "ignore" },
  );

  assert.deepEqual(
    tenantSlugs(),
    before,
    "a smoke file put a tenant into the founder's sandbox — the guard has a hole",
  );
});
