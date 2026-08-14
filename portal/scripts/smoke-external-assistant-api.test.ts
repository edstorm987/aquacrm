import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildExternalAssistantSetupDocument,
  externalAssistantSetupFilename,
} from "../src/lib/externalAssistantSetup";

const read = (path: string) => readFileSync(path, "utf8");

test("external assistant gateway is bearer-authenticated and tenant-scoped", () => {
  const gateway = read("src/lib/server/externalAssistantApi.ts");
  const keys = read("src/lib/server/externalAssistantKeys.ts");
  assert.match(gateway, /MILESYMEDIA_ASSISTANT_API_TOKEN/);
  assert.match(gateway, /MILESYMEDIA_ASSISTANT_AGENCY_ID/);
  assert.match(gateway, /timingSafeEqual/);
  assert.match(gateway, /findExternalAssistantApiKey/);
  assert.match(gateway, /agencyId/);
  assert.match(gateway, /rateLimit/);
  assert.match(keys, /randomBytes\(32\)/);
  assert.match(keys, /tokenHash/);
  assert.match(keys, /createHash\("sha256"\)/);
});

test("owners can manage multiple scoped keys without persisting plaintext secrets", () => {
  const route = read("src/app/api/portal/settings/external-ai/route.ts");
  const keys = read("src/lib/server/externalAssistantKeys.ts");
  const storage = read("src/server/storage.ts");
  const types = read("src/server/types.ts");
  const ui = read("src/app/portal/agency/settings/ExternalAiConnectionPanel.tsx");

  assert.match(route, /action === "create"/);
  assert.match(route, /action === "rotate"/);
  assert.match(route, /export async function DELETE/);
  assert.match(keys, /external_ai\.key_created/);
  assert.match(keys, /external_ai\.key_rotated/);
  assert.match(keys, /external_ai\.key_revoked/);
  assert.match(storage, /externalAssistantApiKeys: parsed\.externalAssistantApiKeys \?\? \{\}/);
  assert.match(types, /externalAssistantApiKeys: Record<string, ExternalAssistantApiKey>/);
  assert.doesNotMatch(types, /interface ExternalAssistantApiKey[\s\S]*?\n\s+token:/);
  assert.match(ui, /Generate key/);
  assert.match(ui, /Copy this key now/);
  assert.match(ui, /Rotate/);
  assert.match(ui, /Revoke/);
});

test("managed key permissions and modules are enforced at every data route", () => {
  const context = read("src/app/api/v1/assistant/context/route.ts");
  const advisor = read("src/app/api/v1/advisor/context/route.ts");
  const records = read("src/app/api/v1/records/route.ts");
  const record = read("src/app/api/v1/records/[recordId]/route.ts");
  const search = read("src/app/api/v1/search/route.ts");
  const exportRoute = read("src/app/api/v1/export/route.ts");

  assert.match(context, /requireExternalAssistantPermission\(auth, "context:read"\)/);
  assert.match(advisor, /requireExternalAssistantPermission\(auth, "advisor:read"\)/);
  assert.match(advisor, /buildExternalAdvisorContext/);
  for (const source of [records, record]) {
    assert.match(source, /requireExternalAssistantPermission\(auth, "records:read"\)/);
    assert.match(source, /requireExternalAssistantModule/);
  }
  assert.match(search, /requireExternalAssistantPermission\(auth, "search:read"\)/);
  assert.match(search, /allowedModules/);
  assert.match(exportRoute, /requireExternalAssistantPermission\(auth, "export:read"\)/);
  assert.match(exportRoute, /auth\.modules/);
});

test("external assistant data is sanitised before leaving the portal", () => {
  const gateway = read("src/lib/server/externalAssistantApi.ts");
  assert.match(gateway, /SECRET_KEY/);
  assert.match(gateway, /\[redacted\]/);
  assert.match(gateway, /STORED_FILE_KEY/);
  assert.match(gateway, /\[stored file\]/);
  assert.doesNotMatch(gateway, /state\.assistant/);
});

test("business records stay read-only while proposals use an isolated approval route", () => {
  const context = read("src/app/api/v1/assistant/context/route.ts");
  const advisor = read("src/app/api/v1/advisor/context/route.ts");
  const records = read("src/app/api/v1/records/route.ts");
  const record = read("src/app/api/v1/records/[recordId]/route.ts");
  const search = read("src/app/api/v1/search/route.ts");
  const exportRoute = read("src/app/api/v1/export/route.ts");
  for (const source of [context, advisor, records, record, exportRoute]) {
    assert.match(source, /authenticateExternalAssistant/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  }
  assert.match(search, /authenticateExternalAssistant/);
  assert.match(search, /export async function POST/);
  assert.match(exportRoute, /recordsToCsv/);
  const proposals = read("src/app/api/v1/actions/proposals/route.ts");
  assert.match(proposals, /requireExternalAssistantPermission\(auth, "actions:propose"\)/);
  assert.match(proposals, /submitExternalAssistantActionProposal/);
  assert.doesNotMatch(proposals, /createAgencyTask|updateAgencyTask|deleteAgencyTask/);
});

test("OpenAPI contract and reusable model-independent skill are shipped", () => {
  const openapi = read("src/app/api/v1/openapi.json/route.ts");
  const skill = read("assistant-integrations/milesymedia-api/SKILL.md");
  assert.match(openapi, /AquaCRM Business Assistant API/);
  assert.match(openapi, /getAquaCrmAdvisorContext/);
  assert.match(openapi, /bearerAuth/);
  assert.match(openapi, /read-only/i);
  assert.match(skill, /AQUACRM_API_BASE_URL/);
  assert.match(skill, /AQUACRM_MCP_URL/);
  assert.match(skill, /GET \/assistant\/context/);
  assert.match(skill, /business records remain read-only/i);
  assert.match(skill, /aqua_propose_action/);
});

test("assistant setup prompt and downloadable handoff are available in settings", () => {
  const setup = read("src/lib/externalAssistantSetup.ts");
  const ui = read("src/app/portal/agency/settings/ExternalAiConnectionPanel.tsx");

  assert.match(setup, /buildExternalAssistantSetupPrompt/);
  assert.match(setup, /buildExternalAssistantSetupDocument/);
  assert.match(setup, /GET \/assistant\/context/);
  assert.match(setup, /aqua_advisor_context/);
  assert.match(setup, /MCP server URL/);
  assert.match(setup, /Never reveal, repeat, log, or place the bearer token/);
  assert.match(setup, /normal chat or document upload cannot make API requests by itself/i);
  assert.match(ui, /Copy setup prompt/);
  assert.match(ui, /Download setup guide/);
  assert.match(ui, /Download complete setup file/);
  assert.match(ui, /MCP server/);

  const document = buildExternalAssistantSetupDocument({
    assistantName: "Ed's private assistant",
    workspace: "milesymedia",
    apiBaseUrl: "https://aqua-crm.com/api/v1",
    openApiUrl: "https://aqua-crm.com/api/v1/openapi.json",
    modules: ["clients", "finance"],
    permissions: ["context:read", "records:read"],
    token: "aqa_test_token",
    generatedAt: new Date("2026-08-08T12:00:00.000Z"),
  });
  assert.match(document, /Authorization: Bearer aqa_test_token/);
  assert.match(document, /Modules: clients, finance/);
  assert.match(document, /getAquaCrmAdvisorContext/);
  assert.match(document, /MCP server URL: https:\/\/aqua-crm\.com\/api\/mcp/);
  assert.equal(externalAssistantSetupFilename("Ed's private assistant"), "aquacrm-ed-s-private-assistant-setup.md");
});
