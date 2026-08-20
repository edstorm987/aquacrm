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
type Keys = typeof import("../src/lib/server/assistants/externalAssistantKeys");
type Gateway = typeof import("../src/lib/server/assistants/externalAssistantApi");
type Mcp = typeof import("../src/lib/server/assistants/externalAssistantMcp");

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
  keys = await import("../src/lib/server/assistants/externalAssistantKeys");
  gateway = await import("../src/lib/server/assistants/externalAssistantApi");
  mcp = await import("../src/lib/server/assistants/externalAssistantMcp");
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

// ─── The Dev Team "API & MCP" page (src/app/portal/dev-team/api) ────────────
//
// The page renders the MCP block from the LIVE server rather than restating it:
// `initialize` for the negotiated protocol version, and
// `listExternalAssistantMcpTools()` per key for the real tool list. Both
// derivations are behavioural contracts, so they are asserted here rather than
// grepped for in the page source.

test("a key's tool list is identical whether derived from its stored summary or a live bearer request", async () => {
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Dev Team page probe",
    modules: ["clients", "tasks"],
    permissions: ["advisor:read", "records:read", "actions:propose"],
    createdBy: "owner@example.test",
  });

  // What the real transport produces (token → auth → tools).
  const bearerAuth = await gateway.authenticateExternalAssistant(new Request("https://aqua-crm.test/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${created.token}` },
  }));

  // What the page produces: the plaintext token is unrecoverable, so the page
  // rebuilds the auth from the STORED SUMMARY. If these ever diverge, the page
  // would show a scope the key does not actually have.
  const summary = keys.listExternalAssistantApiKeys(agencyId).find(key => key.id === created.key.id);
  assert.ok(summary, "the created key is listed for its agency");
  const summaryAuth = {
    agencyId,
    tokenFingerprint: summary.fingerprint,
    keyId: summary.id,
    keyName: summary.name,
    modules: summary.modules.filter(gateway.isExternalAssistantModule),
    permissions: summary.permissions,
    managed: true,
  };

  const fromBearer = mcp.listExternalAssistantMcpTools(bearerAuth).map(tool => tool.name).sort();
  const fromSummary = mcp.listExternalAssistantMcpTools(summaryAuth).map(tool => tool.name).sort();
  assert.deepEqual(fromSummary, fromBearer);
  assert.deepEqual(fromBearer, [
    "aqua_advisor_context",
    "aqua_get_record",
    "aqua_list_action_proposals",
    "aqua_list_records",
    "aqua_propose_action",
  ].sort());

  // The page's read-only badge comes from the tool's own annotation, and the
  // one non-read-only tool is the proposal path — never a record write.
  const proposeTool = mcp.listExternalAssistantMcpTools(bearerAuth).find(tool => tool.name === "aqua_propose_action");
  assert.equal(proposeTool?.annotations.readOnlyHint, false);
  assert.equal(
    mcp.listExternalAssistantMcpTools(bearerAuth)
      .filter(tool => tool.annotations.readOnlyHint === false).length,
    1,
    "exactly one non-read-only tool exists",
  );
});

test("the page reads the protocol version and server identity from the live handshake", async () => {
  // A zero-scope auth: `initialize` must answer without needing any grant,
  // which is what lets the page show the handshake before a key exists.
  const emptyAuth = {
    agencyId,
    tokenFingerprint: "",
    keyName: "",
    modules: [],
    permissions: [],
    managed: true,
  };
  const handshake = await mcp.handleExternalAssistantMcpRequest(emptyAuth, {
    jsonrpc: "2.0",
    id: "dev-team-api-page",
    method: "initialize",
    params: {},
  }) as { result: { protocolVersion: string; serverInfo: { name: string; version: string }; instructions: string } };

  assert.equal(handshake.result.protocolVersion, "2025-11-25");
  assert.equal(handshake.result.serverInfo.name, "aquacrm-business-assistant");
  assert.ok(handshake.result.instructions.length > 0);
  assert.equal(mcp.listExternalAssistantMcpTools(emptyAuth).length, 0, "no grant ⇒ no tools");

  // The page probes older revisions the same way a client negotiates: a
  // supported version is echoed back, an unsupported one falls back to latest.
  const echoed = async (version: string) => {
    const response = await mcp.handleExternalAssistantMcpRequest(emptyAuth, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: version },
    }) as { result: { protocolVersion: string } };
    return response.result.protocolVersion;
  };
  assert.equal(await echoed("2025-06-18"), "2025-06-18");
  assert.equal(await echoed("2025-03-26"), "2025-03-26");
  assert.equal(await echoed("2024-11-05"), "2025-11-25", "an unsupported revision negotiates down to latest");
});

test("the Dev Team gate is strictly narrower than the external-AI endpoint it mounts", async () => {
  // The decision behind mounting `ExternalAiConnectionPanel` (whose endpoint is
  // gated to owner/manager) inside Dev Team (gated founder + Dev Mode) with NO
  // wrapper. Hermetic: `effectiveRole` reads no env, so nothing is mutated here.
  const { effectiveRole } = await import("../src/lib/server/auth/effectiveRole");
  const roles = [
    "agency-owner", "agency-manager", "agency-staff",
    "client-owner", "client-staff", "freelancer", "end-customer", "lead",
  ] as const;
  const founders = roles.filter(role => effectiveRole({ role } as never).isFounder);
  assert.deepEqual(founders, ["agency-owner"], "only agency-owner is a Founder");

  // `devDocsAccessible` = canUseDevMode() && isFounder, so anyone who reaches
  // the page is an agency-owner — which the endpoint already admits.
  const devDocs = require("node:fs").readFileSync("src/lib/server/dev/devDocs.ts", "utf8");
  assert.match(devDocs, /canUseDevMode\(\) && effectiveRole\(session\)\.isFounder/);
  const endpoint = require("node:fs").readFileSync("src/app/api/portal/settings/external-ai/route.ts", "utf8");
  assert.match(endpoint, /ALLOWED_ROLES = new Set\(\["agency-owner", "agency-manager"\]\)/);

  // And the surface re-asserts the gate itself rather than inheriting the
  // layout's. API & MCP is now a VIEW of the Tools section: the body lives in
  // `api/_Section.tsx` and still gates itself, while the rendering mode belongs
  // to the route that mounts it — so assert each where it now lives.
  const page = require("node:fs").readFileSync("src/app/portal/dev-team/api/_Section.tsx", "utf8");
  assert.match(page, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
  assert.match(page, /if \(!devDocsAccessible\(session\)\) notFound\(\)/);
  const host = require("node:fs").readFileSync("src/app/portal/dev-team/tools/page.tsx", "utf8");
  assert.match(host, /export const dynamic = "force-dynamic"/, "the Tools route must never be statically cached");
  assert.match(host, /ApiSection/, "the Tools route still mounts the API & MCP view");
});

test("a revoked key contributes no granted tools, and its tool list is not shown as live scope", () => {
  // Both found in browser verification, not by reading code: with two revoked
  // keys and none active the page header read "0 active keys · 14 granted
  // tools", and the revoked key's tools rendered exactly like a live key's.
  // Authentication rejects a revoked token before any tool is reached, so its
  // scope is hypothetical — the UI has to say which it is.
  const fs = require("node:fs");
  const page = fs.readFileSync("src/app/portal/dev-team/api/_Section.tsx", "utf8").replace(/\s+/g, " ");
  assert.match(
    page,
    /\.filter\(key => key\.status === "active"\) \.reduce\(\(sum, key\) => sum \+ key\.tools\.length, 0\)/,
    "the granted-tools pill must exclude revoked and expired keys",
  );
  const panel = fs.readFileSync("src/app/portal/dev-team/api/_McpConnectPanel.tsx", "utf8");
  assert.match(panel, /selected\.status !== "active" \?/, "a non-active key must be labelled, not rendered as live scope");
  assert.match(panel, /it grants nothing/);
});

test("the page's setup-document download describes the selected key's real scope, without a token", async () => {
  // Brief item: offer `buildExternalAssistantSetupDocument` as a download. What
  // matters is WHICH scope it describes — a document claiming access a key does
  // not have sends someone to debug a connection that was never going to work.
  const setup = await import("../src/lib/integrations/externalAssistantSetup");
  const created = keys.createExternalAssistantApiKey({
    agencyId,
    name: "Docs download probe",
    modules: ["clients", "finance"],
    permissions: ["advisor:read", "records:read"],
    createdBy: "owner@example.test",
  });
  const summary = keys.listExternalAssistantApiKeys(agencyId).find(key => key.id === created.key.id)!;

  const origin = "https://crm.example.com";
  const document = setup.buildExternalAssistantSetupDocument({
    assistantName: summary.name,
    workspace: agencyId,
    apiBaseUrl: `${origin}/api/v1`,
    openApiUrl: `${origin}/api/v1/openapi.json`,
    mcpUrl: `${origin}/api/mcp`,
    modules: summary.modules,
    permissions: summary.permissions,
    // No token: the plaintext is unrecoverable once revealed, so the page's
    // download can never carry one.
  });

  assert.match(document, /MCP server URL: https:\/\/crm\.example\.com\/api\/mcp/);
  assert.match(document, /Modules: clients, finance/);
  assert.match(document, /Permissions: advisor:read, records:read/);

  // The placeholder, never a real secret.
  assert.match(document, /Authorization: Bearer YOUR_PRIVATE_TOKEN/);
  assert.doesNotMatch(document, /aqa_[A-Za-z0-9_-]{20,}/, "a downloaded setup file must not contain a live token");

  // This key has no actions:propose, so the document must not promise write access.
  assert.doesNotMatch(document, /proposal inbox submission enabled/);

  // And the filename is derived from the key's name, not a fixed string.
  assert.equal(setup.externalAssistantSetupFilename(summary.name), "aquacrm-docs-download-probe-setup.md");

  // The page wires exactly this builder to the selected key's scope.
  const panel = require("node:fs").readFileSync("src/app/portal/dev-team/api/_McpConnectPanel.tsx", "utf8");
  assert.match(panel, /buildExternalAssistantSetupDocument\(\{/);
  assert.match(panel, /modules: selected\?\.modules \?\? \[\]/);
  assert.match(panel, /permissions: selected\?\.permissions \?\? \[\]/);
});
