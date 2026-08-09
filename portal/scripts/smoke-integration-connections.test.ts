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
type Connections = typeof import("../src/lib/server/integrationConnections");

let storage: Storage;
let tenants: Tenants;
let connections: Connections;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "integration-smoke-vault-key-longer-than-thirty-two-characters";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  connections = await import("../src/lib/server/integrationConnections");
  await storage.ensureHydrated();
  await storage.reset();
});

test("integration secrets are encrypted at rest and redacted from browser records", () => {
  const agency = tenants.createAgency({ name: "Integration Smoke", slug: "integration-smoke" });
  const saved = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "resend",
    label: "Workspace email",
    values: {
      apiKey: "re_super_secret_test_value",
      fromEmail: "hello@example.com",
      fromName: "Example",
      notifyTo: "owner@example.com",
    },
    actorUserId: "owner",
  });

  assert.deepEqual(saved.config, {
    fromEmail: "hello@example.com",
    fromName: "Example",
    notifyTo: "owner@example.com",
  });
  assert.deepEqual(saved.configuredSecretFields, ["apiKey"]);
  assert.equal("encryptedSecrets" in saved, false);
  assert.doesNotMatch(JSON.stringify(storage.getState()), /re_super_secret_test_value/);
  assert.equal(
    connections.resolveIntegrationValues(agency.id, "resend", { includeEnvironmentFallback: false }).apiKey,
    "re_super_secret_test_value",
  );
});

test("client-scoped credentials override the workspace default and blank edits preserve secrets", () => {
  const agency = tenants.createAgency({ name: "Scoped Integration", slug: "scoped-integration" });
  const firstClient = tenants.createClient(agency.id, { name: "First Client" });
  const secondClient = tenants.createClient(agency.id, { name: "Second Client" });
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "openai",
    values: { apiKey: "sk-workspace", model: "gpt-5-mini" },
    actorUserId: "owner",
  });
  const clientConnection = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "openai",
    clientId: firstClient.id,
    label: "First Client AI",
    values: { apiKey: "sk-client", model: "gpt-5" },
    actorUserId: "owner",
  });
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    connectionId: clientConnection.id,
    provider: "openai",
    clientId: firstClient.id,
    label: "First Client AI edited",
    values: { apiKey: "", model: "gpt-5.1" },
    actorUserId: "owner",
  });

  assert.equal(connections.resolveIntegrationValues(agency.id, "openai", { clientId: firstClient.id }).apiKey, "sk-client");
  assert.equal(connections.resolveIntegrationValues(agency.id, "openai", { clientId: firstClient.id }).model, "gpt-5.1");
  assert.equal(connections.resolveIntegrationValues(agency.id, "openai", { clientId: secondClient.id }).apiKey, "sk-workspace");
});

test("connections can be tested without exposing secrets and revoked completely", async () => {
  const agency = tenants.createAgency({ name: "Connection Test", slug: "connection-test" });
  const saved = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "github",
    values: { token: "github_pat_private", owner: "example" },
    actorUserId: "owner",
  });
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer github_pat_private");
    return Response.json({ login: "example" });
  }) as typeof fetch;
  const tested = await connections.testIntegrationConnection(agency.id, saved.id, { userId: "owner" }, fetchImpl);
  assert.equal(tested.status, "connected");
  assert.equal(tested.lastTestStatus, "passed");
  assert.match(tested.lastTestMessage ?? "", /example/);
  assert.doesNotMatch(JSON.stringify(tested), /github_pat_private/);

  connections.revokeIntegrationConnection({ agencyId: agency.id, connectionId: saved.id, actorUserId: "owner" });
  assert.equal(connections.listIntegrationConnections(agency.id).length, 0);
  assert.equal(connections.resolveIntegrationValues(agency.id, "github", { includeEnvironmentFallback: false }).token, undefined);
});
