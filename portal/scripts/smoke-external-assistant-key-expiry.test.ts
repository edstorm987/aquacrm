// An EXPIRED external-assistant key must grant nothing.
//
// The suite covered revocation and never expiry, and "active" is implemented
// twice with different code: `findExternalAssistantApiKey` delegates to
// `keyStatus` (revokedAt, then expiresAt), while `authenticateExternalAssistant`
// re-derives the same rule inline for its `hasManagedKeys` check. Two copies,
// one test between them.
//
// The Dev Console's API view tells the reader, in as many words, that a
// non-active key "grants nothing: every call with it is rejected at
// authentication, before any tool is reached". Nothing in the suite backed that
// claim for the expired half — so simplifying the filter to `!key.revokedAt`
// (the shape already written inline in `externalAssistantApi.ts`) would leave a
// 30-day key authenticating forever while the screen renders an "expired"
// badge, with 1,900+ tests still green.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

// `server-only` throws outside a server bundle; stub it the way this file's
// sibling (smoke-external-assistant-keys) already does.
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Keys = typeof import("../src/lib/server/assistants/externalAssistantKeys");
type Gateway = typeof import("../src/lib/server/assistants/externalAssistantApi");

let storage: Storage;
let tenants: Tenants;
let keys: Keys;
let gateway: Gateway;
let agencyId = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  // No legacy env credential here: with one configured, EVERY bearer request
  // authenticates as the legacy key and the expiry question never gets asked.
  delete process.env.MILESYMEDIA_ASSISTANT_API_TOKEN;
  delete process.env.AQUACRM_ASSISTANT_API_TOKEN;
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  keys = await import("../src/lib/server/assistants/externalAssistantKeys");
  gateway = await import("../src/lib/server/assistants/externalAssistantApi");
  await storage.ensureHydrated();
  agencyId = tenants.createAgency({ name: "Key expiry smoke", slug: "key-expiry-smoke" }).id;
  process.env.AQUACRM_ASSISTANT_AGENCY_ID = agencyId;
});

function bearer(token: string): Request {
  return new Request("https://aqua-crm.test/api/v1/records", {
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Reach into stored state to move a key's expiry — no writer exposes this. */
function setExpiry(keyId: string, expiresAt: number) {
  storage.mutate(state => {
    state.externalAssistantApiKeys[keyId].expiresAt = expiresAt;
  });
}

test("a key with a future expiry resolves and authenticates", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Thirty day reader",
    modules: ["clients"],
    permissions: ["records:read"],
    createdBy: "owner@example.test",
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
  assert.equal(keys.findExternalAssistantApiKey(created.token)?.id, created.key.id);
  assert.equal(keys.listExternalAssistantApiKeys(agencyId).find(key => key.id === created.key.id)?.status, "active");

  const auth = await gateway.authenticateExternalAssistant(bearer(created.token));
  assert.equal(auth.keyId, created.key.id, "it really does authenticate while it is live");
});

test("the moment it expires it resolves to nothing and is rejected at authentication", async () => {
  const expiring = keys.createExternalAssistantApiKey({
    agencyId,
    name: "About to lapse",
    modules: ["clients"],
    permissions: ["records:read"],
    createdBy: "owner@example.test",
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  // A second, unrelated key stays active on purpose. Without it the whole API
  // reports itself unconfigured (503) and the 401 we are actually testing for
  // would never be reached — the test would pass for the wrong reason.
  const stillLive = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Still live",
    modules: ["clients"],
    permissions: ["records:read"],
    createdBy: "owner@example.test",
  });
  assert.ok(keys.findExternalAssistantApiKey(expiring.token), "live before the clock moves");

  setExpiry(expiring.key.id, Date.now() - 1_000);

  // Definition 1: the lookup.
  assert.equal(keys.findExternalAssistantApiKey(expiring.token), null, "an expired key resolves to nothing");
  assert.equal(
    keys.listExternalAssistantApiKeys(agencyId).find(key => key.id === expiring.key.id)?.status,
    "expired",
    "…and the screen's badge agrees",
  );

  // Definition 2: the gateway's own inline re-derivation. This is the claim the
  // Dev Console prints — "every call with it is rejected at authentication".
  await assert.rejects(
    () => gateway.authenticateExternalAssistant(bearer(expiring.token)),
    (error: unknown) => {
      const typed = error as { status?: number; code?: string };
      assert.equal(typed.status, 401, "401 unauthorized — not 503 assistant_api_not_configured");
      assert.equal(typed.code, "unauthorized");
      return true;
    },
  );

  // …while the unexpired sibling is untouched, so this is expiry and not an
  // outage.
  const auth = await gateway.authenticateExternalAssistant(bearer(stillLive.token));
  assert.equal(auth.keyId, stillLive.key.id);
});

test("an expired key cannot be rotated back into service", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Lapsed and rotated",
    modules: ["tasks"],
    permissions: ["context:read"],
    createdBy: "owner@example.test",
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  setExpiry(created.key.id, Date.now() - 1_000);
  assert.throws(
    () => keys.rotateExternalAssistantApiKey({ agencyId, keyId: created.key.id, createdBy: "owner@example.test" }),
    /api_key_not_active/,
    "rotation asks the same active rule",
  );
});

test("an expiry in the past is refused at creation", () => {
  assert.throws(
    () => keys.createExternalAssistantApiKey({
      agencyId,
      name: "Born expired",
      modules: ["clients"],
      permissions: ["records:read"],
      createdBy: "owner@example.test",
      expiresAt: Date.now() - 1,
    }),
    /invalid_expiry/,
  );
});
