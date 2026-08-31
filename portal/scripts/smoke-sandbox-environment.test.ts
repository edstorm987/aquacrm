import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

// `import.meta.dirname` is undefined when this file is loaded through tsx's
// CJS transform, which threw before a single assertion ran. `import.meta.url`
// is populated in both loaders.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function runInFreshMemoryProcess(code: string): string {
  const script = `void (async () => {\n${code}\n})().catch((error) => { console.error(error); process.exitCode = 1; });`;
  return execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: "--conditions react-server",
      PORTAL_BACKEND: "memory",
    },
  }).trim();
}

test("live, empty, demo and snapshot realms cannot observe one another's writes", () => {
  const output = runInFreshMemoryProcess([
    "const { default: s } = await import('./src/server/storage.ts');",
    "await s.ensureHydrated();",
    "s.mutate(state => { state.agencies.live = { id: 'live', name: 'Live', slug: 'live', status: 'active', createdAt: 1, updatedAt: 1 }; });",
    "const seen = {};",
    "for (const realm of ['sandbox-empty-test', 'sandbox-demo-test', 'sandbox-snapshot-test']) {",
    "  await s.runInDataRealm(realm, async () => {",
    "    await s.ensureHydrated();",
    "    seen[realm + ':before'] = Object.keys(s.getState().agencies);",
    "    s.mutate(state => { state.agencies[realm] = { id: realm, name: realm, slug: realm, status: 'active', createdAt: 1, updatedAt: 1 }; });",
    "    await s.flushPendingWrites();",
    "    seen[realm + ':after'] = Object.keys(s.getState().agencies);",
    "  });",
    "}",
    "seen.live = Object.keys(s.getState().agencies);",
    "console.log(JSON.stringify(seen));",
  ].join("\n"));

  const seen = JSON.parse(output) as Record<string, string[]>;
  assert.deepEqual(seen.live, ["live"]);
  for (const realm of ["sandbox-empty-test", "sandbox-demo-test", "sandbox-snapshot-test"]) {
    assert.deepEqual(seen[`${realm}:before`], []);
    assert.deepEqual(seen[`${realm}:after`], [realm]);
  }
});

test("a sandbox realm blocks shared outbound provider adapters", () => {
  const output = runInFreshMemoryProcess([
    "const { default: s } = await import('./src/server/storage.ts');",
    "const { default: p } = await import('./src/lib/server/sandbox/providerPolicy.ts');",
    "let live = 'blocked';",
    "p.assertLiveProviderAccess('probe'); live = 'allowed';",
    "let sandbox = 'allowed';",
    "await s.runInDataRealm('sandbox-provider-test', async () => {",
    "  try { p.assertLiveProviderAccess('probe'); } catch (error) { sandbox = error.name; }",
    "});",
    "console.log(JSON.stringify({ live, sandbox }));",
  ].join("\n"));

  assert.deepEqual(JSON.parse(output), {
    live: "allowed",
    sandbox: "SandboxProviderBlockedError",
  });
});

test("read-only sandbox cookies reject mutations but can change environment", () => {
  const token = `${Buffer.from(JSON.stringify({ sandbox: { access: "read-only" } })).toString("base64url")}.test-signature`;
  const request = (path: string, method = "POST") => new NextRequest(`http://localhost:3032${path}`, {
    method,
    headers: { cookie: `lk_session_v1=${token}` },
  });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(proxy(request("/api/portal/tasks", method)).status, 403);
  }
  assert.equal(proxy(request("/api/auth/sandbox-mode", "POST")).status, 200);
  assert.equal(proxy(request("/api/portal/calendar/google/callback", "GET")).status, 403);
});

test("Settings and legacy controls converge on the canonical sandbox endpoint", () => {
  const settings = read("src/app/portal/agency/settings/SettingsTabs.tsx");
  const panel = read("src/app/portal/agency/settings/SandboxModePanel.tsx");
  const canonicalRoute = read("src/app/api/auth/sandbox-mode/route.ts");
  const showcaseRoute = read("src/app/api/auth/showcase-mode/route.ts");
  const devRoute = read("src/app/api/auth/dev-mode/route.ts");
  const privacy = read("src/components/chrome/PrivacyModeControl.tsx");
  const requestHelper = read("src/lib/client/sandboxModeRequest.ts");

  assert.match(settings, /id: "environment", label: "Environment"/);
  // The `#showcase` bookmark must still open Environment. Asserted as the
  // ALIAS ENTRY rather than the old inline `hash === "showcase" ? …` ternary:
  // that expression moved into `LEGACY_TAB_ALIASES` on 2026-08-29 when three
  // retired tab ids needed the same treatment. Matching the expression would
  // fail on a refactor while a real regression — dropping the alias — passed.
  assert.match(settings, /showcase: "environment"/);
  assert.match(panel, /Empty workspace/);
  assert.match(panel, /Demo data/);
  assert.match(panel, /Production snapshot/);
  assert.match(panel, /requestSandboxMode/);
  assert.match(canonicalRoute, /enterSandboxEnvironment/);
  assert.match(canonicalRoute, /exitSandboxEnvironment/);
  assert.match(showcaseRoute, /enterSandboxEnvironment/);
  assert.match(devRoute, /enterSandboxEnvironment/);
  assert.match(privacy, /\/api\/auth\/sandbox-mode/);
  assert.match(requestHelper, /AbortController/);
  assert.match(requestHelper, /SANDBOX_MODE_REQUEST_TIMEOUT_MS/);
  assert.match(requestHelper, /\/api\/auth\/sandbox-mode/);
});

test("non-governor portal entry derives a safe persona and hides persona controls", () => {
  const topbar = read("src/components/chrome/Topbar.tsx");
  const privacy = read("src/components/chrome/PrivacyModeControl.tsx");
  const directEntry = read("src/components/chrome/SafeSandboxEntry.tsx");
  const switcher = read("src/components/chrome/SandboxModeSwitcher.tsx");
  const team = read("src/app/portal/team/layout.tsx");
  const freelancer = read("src/app/portal/freelancer/layout.tsx");
  const customerLayout = read("src/app/portal/customer/layout.tsx");
  const customerChrome = read("src/app/portal/customer/_CustomerPortalChrome.tsx");

  assert.match(topbar, /role !== "lead"/);
  assert.doesNotMatch(privacy, /persona:\s*"owner"/);
  assert.doesNotMatch(directEntry, /persona:/);
  assert.match(team, /<Topbar/);
  assert.match(freelancer, /<SafeSandboxEntry/);
  assert.match(customerLayout, /safeSandboxEntry=/);
  assert.match(customerChrome, /<SafeSandboxEntry/);
  assert.match(switcher, /canSwitchPersona/);
  assert.match(switcher, /environment\.governor === true/);
  assert.match(switcher, /environment\.dataset === "demo" && canSwitchPersona/);
});

test("session payload carries a server-minted environment and storage never accepts a browser realm id", () => {
  const types = read("src/server/types.ts");
  const service = read("src/lib/server/sandbox/sandboxEnvironment.ts");
  const route = read("src/app/api/auth/sandbox-mode/route.ts");
  const storage = read("src/server/storage.ts");
  const dataRealm = read("src/server/dataRealm.ts");

  assert.match(types, /interface SandboxSessionEnvironment/);
  assert.match(types, /sandbox\?: SandboxSessionEnvironment/);
  assert.match(service, /sandboxRealmIdFor\(identity\.agency\.id, input\.dataset\)/);
  assert.doesNotMatch(route, /body\?\.realmId|body\.realmId/);
  assert.match(dataRealm, /AsyncLocalStorage<DataRealmContext>/);
  assert.match(dataRealm, /explicit: boolean/);
  assert.match(storage, /if \(preserveExplicitRealm && hasExplicitDataRealm\(\)\) return getActiveDataRealmId\(\)/);
  assert.match(storage, /workUnitAsyncStorage\.getStore\(\)/);
  assert.match(storage, /const realmId = enterSignedRequestRealm\(options\?\.preserveExplicitRealm === true\)/);
  assert.match(service, /preserveExplicitRealm: true/);
  assert.match(storage, /enterDataRealm/);
  assert.match(storage, /verifySessionToken/);
});

test("request-selected realms cannot masquerade as explicit seed scopes", () => {
  const output = runInFreshMemoryProcess([
    "const { default: d } = await import('./src/server/dataRealm.ts');",
    "d.enterDataRealm('sandbox-request-one');",
    "const request = { id: d.getActiveDataRealmId(), explicit: d.hasExplicitDataRealm() };",
    "const scoped = await d.runInDataRealm('sandbox-seed-scope', async () => ({ id: d.getActiveDataRealmId(), explicit: d.hasExplicitDataRealm() }));",
    "const restored = { id: d.getActiveDataRealmId(), explicit: d.hasExplicitDataRealm() };",
    "console.log(JSON.stringify({ request, scoped, restored }));",
  ].join("\n"));

  assert.deepEqual(JSON.parse(output), {
    request: { id: "sandbox-request-one", explicit: false },
    scoped: { id: "sandbox-seed-scope", explicit: true },
    restored: { id: "sandbox-request-one", explicit: false },
  });
});

test("a signed request realm survives hydration for subsequent synchronous domain reads", () => {
  const output = runInFreshMemoryProcess([
    "const asyncHooks = await import('node:async_hooks');",
    "globalThis.AsyncLocalStorage = asyncHooks.AsyncLocalStorage;",
    "const { default: s } = await import('./src/server/storage.ts');",
    "const authModule = await import('./src/lib/server/auth/sessionToken.ts');",
    "const auth = authModule.default ?? authModule;",
    "const nextStoreModule = await import('next/dist/server/app-render/work-unit-async-storage.external.js');",
    "const nextStore = nextStoreModule.workUnitAsyncStorage ?? nextStoreModule.default.workUnitAsyncStorage;",
    "const now = Math.floor(Date.now() / 1000);",
    "const token = auth.signSessionPayload({ userId: 'sandbox-owner', email: 'owner@example.test', role: 'agency-owner', agencyId: 'sandbox-agency', agencyIds: ['sandbox-agency'], activeAgencyId: 'sandbox-agency', sandbox: { realmId: 'sandbox-request-propagation', dataset: 'demo', access: 'writable', persona: 'owner', returnUserId: 'live-owner', returnAgencyId: 'live-agency', enteredAt: Date.now() }, isDemo: true, sessionRev: 0, iat: now, exp: now + 60 });",
    "const requestStore = { type: 'request', cookies: { get: name => name === 'lk_session_v1' ? { name, value: token } : undefined } };",
    "const seen = await nextStore.run(requestStore, async () => { const hydration = s.ensureHydrated(); const beforeAwait = s.getActiveDataRealmId(); await hydration; return { beforeAwait, realm: s.getActiveDataRealmId(), backendRealm: s.getBackendInfo().realmId }; });",
    "console.log(JSON.stringify(seen));",
  ].join("\n"));

  assert.deepEqual(JSON.parse(output), {
    beforeAwait: "sandbox-request-propagation",
    realm: "sandbox-request-propagation",
    backendRealm: "sandbox-request-propagation",
  });
});

test("a signed Sandbox session cannot spend a live OpenAI credential", () => {
  const output = runInFreshMemoryProcess([
    "const asyncHooks = await import('node:async_hooks');",
    "globalThis.AsyncLocalStorage = asyncHooks.AsyncLocalStorage;",
    "const { default: s } = await import('./src/server/storage.ts');",
    "const authModule = await import('./src/lib/server/auth/sessionToken.ts');",
    "const auth = authModule.default ?? authModule;",
    "const openAiModule = await import('./src/lib/server/integrations/openaiResponses.ts');",
    "const openAi = openAiModule.default ?? openAiModule;",
    "const nextStoreModule = await import('next/dist/server/app-render/work-unit-async-storage.external.js');",
    "const nextStore = nextStoreModule.workUnitAsyncStorage ?? nextStoreModule.default.workUnitAsyncStorage;",
    "const now = Math.floor(Date.now() / 1000);",
    "const token = auth.signSessionPayload({ userId: 'sandbox-owner', email: 'owner@example.test', role: 'agency-owner', agencyId: 'sandbox-agency', agencyIds: ['sandbox-agency'], activeAgencyId: 'sandbox-agency', sandbox: { realmId: 'sandbox-signed-provider-fence', dataset: 'demo', access: 'writable', persona: 'owner', returnUserId: 'live-owner', returnAgencyId: 'live-agency', enteredAt: Date.now() }, isDemo: true, sessionRev: 0, iat: now, exp: now + 60 });",
    "const requestStore = { type: 'request', cookies: { get: name => name === 'lk_session_v1' ? { name, value: token } : undefined } };",
    "const seen = await nextStore.run(requestStore, async () => {",
    "  await s.ensureHydrated();",
    "  let fetchCalls = 0; let errorName = '';",
    "  try { await openAi.requestOpenAiResponse({ apiKey: 'live-looking-key', payload: { model: 'test', input: 'must not send' }, fetchImpl: async () => { fetchCalls += 1; return new Response('{}', { status: 200 }); } }); } catch (error) { errorName = error.name; }",
    "  return { realm: s.getActiveDataRealmId(), fetchCalls, errorName };",
    "});",
    "console.log(JSON.stringify(seen));",
  ].join("\n"));

  assert.deepEqual(JSON.parse(output), {
    realm: "sandbox-signed-provider-fence",
    fetchCalls: 0,
    errorName: "SandboxProviderBlockedError",
  });
});
