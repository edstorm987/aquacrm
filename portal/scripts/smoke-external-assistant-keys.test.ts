import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

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
type Keys = typeof import("../src/lib/server/externalAssistantKeys");
type Gateway = typeof import("../src/lib/server/externalAssistantApi");

let storage: Storage;
let tenants: Tenants;
let keys: Keys;
let gateway: Gateway;
let agencyId = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  delete process.env.MILESYMEDIA_ASSISTANT_API_TOKEN;
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  keys = await import("../src/lib/server/externalAssistantKeys");
  gateway = await import("../src/lib/server/externalAssistantApi");
  await storage.ensureHydrated();
  agencyId = tenants.createAgency({ name: "AI key smoke", slug: "ai-key-smoke" }).id;
});

test("managed keys store only a hash and reveal different secrets", () => {
  const first = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Claude finance reader",
    modules: ["clients", "finance"],
    permissions: ["context:read", "records:read"],
    createdBy: "owner@example.test",
  });
  const second = keys.createExternalAssistantApiKey({
    agencyId,
    name: "ChatGPT search",
    modules: ["clients"],
    permissions: ["search:read"],
    createdBy: "owner@example.test",
  });

  assert.match(first.token, /^aqa_[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first.token, second.token);
  const stored = storage.getState().externalAssistantApiKeys[first.key.id] as unknown as Record<string, unknown>;
  assert.equal(stored.token, undefined);
  assert.equal(typeof stored.tokenHash, "string");
  assert.equal(keys.findExternalAssistantApiKey(first.token)?.id, first.key.id);
  assert.equal(keys.findExternalAssistantApiKey(`${first.token}wrong`), null);
});

test("authentication applies each key's actions and module scope", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Restricted client reader",
    modules: ["clients"],
    permissions: ["records:read"],
    createdBy: "owner@example.test",
  });
  const auth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/v1/records", {
    headers: { authorization: `Bearer ${created.token}` },
  }));

  assert.deepEqual(auth.modules, ["clients"]);
  assert.deepEqual(auth.permissions, ["records:read"]);
  gateway.requireExternalAssistantPermission(auth, "records:read");
  gateway.requireExternalAssistantModule(auth, "clients");
  assert.throws(() => gateway.requireExternalAssistantPermission(auth, "export:read"), /does not allow/);
  assert.throws(() => gateway.requireExternalAssistantModule(auth, "finance"), /cannot access/);
});

test("revocation immediately invalidates the bearer token", () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Temporary assistant",
    modules: ["tasks"],
    permissions: ["context:read"],
    createdBy: "owner@example.test",
  });
  assert.ok(keys.findExternalAssistantApiKey(created.token));
  const revoked = keys.revokeExternalAssistantApiKey({
    agencyId,
    keyId: created.key.id,
    revokedBy: "owner@example.test",
  });
  assert.equal(revoked.status, "revoked");
  assert.equal(keys.findExternalAssistantApiKey(created.token), null);
});
