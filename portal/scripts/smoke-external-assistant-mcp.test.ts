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
type Mcp = typeof import("../src/lib/server/externalAssistantMcp");

let storage: Storage;
let tenants: Tenants;
let keys: Keys;
let gateway: Gateway;
let mcp: Mcp;
let agencyId = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  delete process.env.AQUACRM_ASSISTANT_API_TOKEN;
  delete process.env.MILESYMEDIA_ASSISTANT_API_TOKEN;
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  keys = await import("../src/lib/server/externalAssistantKeys");
  gateway = await import("../src/lib/server/externalAssistantApi");
  mcp = await import("../src/lib/server/externalAssistantMcp");
  await storage.ensureHydrated();
  agencyId = tenants.createAgency({ name: "MCP assistant smoke", slug: "mcp-assistant-smoke" }).id;
});

test("a separately authenticated assistant negotiates MCP and sees only granted tools", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "External Advisor peer",
    modules: ["clients", "tasks", "company"],
    permissions: ["advisor:read", "context:read", "records:read", "search:read"],
    createdBy: "owner@example.test",
  });
  const auth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${created.token}` },
  }));

  const initialized = await mcp.handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  }) as { result: { protocolVersion: string; capabilities: { tools: unknown } } };
  assert.equal(initialized.result.protocolVersion, "2025-06-18");
  assert.ok(initialized.result.capabilities.tools);

  const listed = await mcp.handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  }) as { result: { tools: Array<{ name: string; inputSchema: { properties?: { module?: { enum?: string[] } } } }> } };
  const names = listed.result.tools.map(tool => tool.name);
  assert.deepEqual(names, ["aqua_advisor_context", "aqua_workspace_context", "aqua_list_records", "aqua_get_record", "aqua_search"]);
  assert.deepEqual(listed.result.tools.find(tool => tool.name === "aqua_list_records")?.inputSchema.properties?.module?.enum, ["clients", "tasks", "company"]);

  const advisor = await mcp.handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "aqua_advisor_context", arguments: {} },
  }) as { result: { isError: boolean; structuredContent: { advisor: { role: string; readOnly: boolean; scope: { modules: string[] } } } } };
  assert.equal(advisor.result.isError, false);
  assert.equal(advisor.result.structuredContent.advisor.role, "advisor-peer");
  assert.equal(advisor.result.structuredContent.advisor.readOnly, true);
  assert.deepEqual(advisor.result.structuredContent.advisor.scope.modules, ["clients", "tasks", "company"]);
});

test("MCP record and workspace tools return structured read-only results", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Clients-only MCP",
    modules: ["clients"],
    permissions: ["context:read", "records:read"],
    createdBy: "owner@example.test",
  });
  const auth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${created.token}` },
  }));
  const tools = mcp.listExternalAssistantMcpTools(auth).map(tool => tool.name);
  assert.deepEqual(tools, ["aqua_workspace_context", "aqua_list_records", "aqua_get_record"]);

  const response = await mcp.handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: "records",
    method: "tools/call",
    params: { name: "aqua_list_records", arguments: { module: "clients", limit: 10 } },
  }) as { result: { isError: boolean; structuredContent: { ok: boolean; module: string; records: unknown[] } } };
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.ok, true);
  assert.equal(response.result.structuredContent.module, "clients");
  assert.ok(Array.isArray(response.result.structuredContent.records));
});

test("MCP keeps notifications stateless and denied tools unavailable", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Context-only MCP",
    modules: ["company"],
    permissions: ["context:read"],
    createdBy: "owner@example.test",
  });
  const auth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/mcp", {
    headers: { authorization: `Bearer ${created.token}` },
  }));
  assert.equal(await mcp.handleExternalAssistantMcpRequest(auth, { jsonrpc: "2.0", method: "notifications/initialized" }), null);

  const denied = await mcp.handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "aqua_advisor_context", arguments: {} },
  }) as { error: { code: number; message: string } };
  assert.equal(denied.error.code, -32602);
  assert.match(denied.error.message, /unavailable tool/);
});

test("the HTTP MCP route enforces bearer auth and origin checks before tools run", () => {
  const route = require("node:fs").readFileSync("src/app/api/mcp/route.ts", "utf8");
  assert.match(route, /authenticateExternalAssistant\(request\)/);
  assert.match(route, /validateOrigin\(request\)/);
  assert.match(route, /handleExternalAssistantMcpRequest/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /status: 202/);
});
