import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

// Load the real issuance boundary over a storage double whose in-memory
// mutation succeeds but durable flush fails. This is the exact split that a
// synchronous registry write cannot expose by itself.
const securityControl = {
  globalEpoch: 0,
  tenantEpochs: {},
  userEpochs: {},
  suspendedUsers: {},
  sessions: {},
};
const state = { securityControl };
const storageId = require.resolve("../src/server/storage");
require.cache[storageId] = {
  id: storageId,
  filename: storageId,
  loaded: true,
  paths: [],
  children: [],
  exports: {
    LIVE_DATA_REALM_ID: "live",
    ensureHydrated: async () => {},
    flushPendingWrites: async () => { throw new Error("durable registry unavailable"); },
    getState: () => state,
    mutate: (fn: (draft: typeof state) => void) => fn(state),
    runInDataRealm: (_realmId: string, operation: () => unknown) => operation(),
  },
} as never;

const usersId = require.resolve("../src/server/users");
require.cache[usersId] = {
  id: usersId,
  filename: usersId,
  loaded: true,
  paths: [],
  children: [],
  exports: { getUserById: () => null },
} as never;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const auth = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");

test("a real response credential is refused when its registry row cannot flush durably", async () => {
  await assert.rejects(
    auth.issueSessionForResponse({
      userId: "durable-user",
      email: "durable@example.test",
      role: "agency-owner",
      agencyId: "durable-agency",
      issuedVia: "test",
    }),
    { name: "SecurityControlUnavailableError" },
  );
  assert.equal(Object.keys(securityControl.sessions).length, 1, "the test must reach the in-memory/durable split");
});

test("demo and sandbox flags cannot create an unregistered credential on a hosted app", () => {
  const previousRailway = process.env.RAILWAY_PROJECT_ID;
  const previousSecret = process.env.PORTAL_SESSION_SECRET;
  process.env.RAILWAY_PROJECT_ID = "hosted-test";
  process.env.PORTAL_SESSION_SECRET = "hosted-test-secret-that-is-at-least-32-characters";
  try {
    const hostedDemo = auth.verifyToken(auth.issueSession({
      userId: "hosted-demo",
      email: "hosted-demo@example.test",
      role: "agency-owner",
      agencyId: "demo-agency",
      isDemo: true,
    }));
    assert.equal(hostedDemo?.sr, 1);

    const publicShowcase = auth.verifyToken(auth.issueSession({
      userId: "public-showcase",
      email: "showcase@example.test",
      role: "agency-owner",
      agencyId: "showcase-agency",
      isDemo: true,
      publicShowcase: true,
    }));
    assert.equal(publicShowcase?.sr, undefined, "the anonymous proxy-write-blocked showcase is the explicit exception");
  } finally {
    if (previousRailway === undefined) delete process.env.RAILWAY_PROJECT_ID;
    else process.env.RAILWAY_PROJECT_ID = previousRailway;
    if (previousSecret === undefined) delete process.env.PORTAL_SESSION_SECRET;
    else process.env.PORTAL_SESSION_SECRET = previousSecret;
  }
});

function sourceFiles(root: string, out: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test("HTTP session mints cannot bypass the awaited persistence boundary", () => {
  const sourceRoot = join(process.cwd(), "src");
  const directMintAllowlist = new Set([
    "src/lib/server/auth/auth.ts", // the primitive and awaited wrapper
    "src/app/dev/route.ts", // devModeStatus(): non-production + file/memory only
    "src/app/api/auth/dev-mode/route.ts", // canUseDevMode(): same four local-only gates
    "src/app/showcase/route.ts", // anonymous publicShowcase:true; proxy-enforced read-only
  ]);
  const directMints = sourceFiles(sourceRoot)
    .filter(path => !path.includes(`${join("src", "archive")}`))
    .filter(path => {
      const source = readFileSync(path, "utf8");
      return /import\s*\{[^;]*\bissueSession\b[^;]*\}\s*from\s*["']@\/lib\/server\/auth\/auth["'];/s.test(source);
    })
    .map(path => relative(process.cwd(), path).split("\\").join("/"))
    .sort();
  assert.deepEqual(
    directMints,
    [...directMintAllowlist].filter(path => path !== "src/lib/server/auth/auth.ts").sort(),
  );

  const dev = readFileSync(join(sourceRoot, "app/dev/route.ts"), "utf8");
  assert.match(dev, /devModeStatus\(\)/);
  assert.match(dev, /isDemo:\s*true/);
  const devMode = readFileSync(join(sourceRoot, "app/api/auth/dev-mode/route.ts"), "utf8");
  assert.match(devMode, /canUseDevMode\(\)/);
  assert.match(devMode, /isDemo:\s*true/);
  const showcase = readFileSync(join(sourceRoot, "app/showcase/route.ts"), "utf8");
  assert.match(showcase, /publicShowcase:\s*true/);

  const funnelAdapter = readFileSync(
    join(sourceRoot, "built-ins/runtime/foundation-adapters/leadFunnelPorts.ts"),
    "utf8",
  );
  assert.match(funnelAdapter, /issueSessionForResponse as foundationIssueSession/);
  assert.match(funnelAdapter, /return await foundationIssueSession\(/);

  const implementation = readFileSync(join(sourceRoot, "lib/server/auth/auth.ts"), "utf8");
  const boundary = implementation.slice(
    implementation.indexOf("export async function issueSessionForResponse"),
    implementation.indexOf("export function verifyToken"),
  );
  assert.match(boundary, /await flushPendingWrites\(\)/);
  assert.ok(
    boundary.indexOf("await flushPendingWrites()") < boundary.lastIndexOf("return token"),
    "a required token must not return before the durable flush",
  );
});
