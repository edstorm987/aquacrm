import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("external assistant gateway is bearer-authenticated and tenant-scoped", () => {
  const gateway = read("src/lib/server/externalAssistantApi.ts");
  assert.match(gateway, /MILESYMEDIA_ASSISTANT_API_TOKEN/);
  assert.match(gateway, /MILESYMEDIA_ASSISTANT_AGENCY_ID/);
  assert.match(gateway, /timingSafeEqual/);
  assert.match(gateway, /agencyId/);
  assert.match(gateway, /rateLimit/);
});

test("external assistant data is sanitised before leaving the portal", () => {
  const gateway = read("src/lib/server/externalAssistantApi.ts");
  assert.match(gateway, /SECRET_KEY/);
  assert.match(gateway, /\[redacted\]/);
  assert.match(gateway, /STORED_FILE_KEY/);
  assert.match(gateway, /\[stored file\]/);
  assert.doesNotMatch(gateway, /state\.assistant/);
});

test("read-only context, records, search, and export routes exist", () => {
  const context = read("src/app/api/v1/assistant/context/route.ts");
  const records = read("src/app/api/v1/records/route.ts");
  const record = read("src/app/api/v1/records/[recordId]/route.ts");
  const search = read("src/app/api/v1/search/route.ts");
  const exportRoute = read("src/app/api/v1/export/route.ts");
  for (const source of [context, records, record, exportRoute]) {
    assert.match(source, /authenticateExternalAssistant/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  }
  assert.match(search, /authenticateExternalAssistant/);
  assert.match(search, /export async function POST/);
  assert.match(exportRoute, /recordsToCsv/);
});

test("OpenAPI contract and reusable model-independent skill are shipped", () => {
  const openapi = read("src/app/api/v1/openapi.json/route.ts");
  const skill = read("assistant-integrations/milesymedia-api/SKILL.md");
  assert.match(openapi, /Milesymedia Business Assistant API/);
  assert.match(openapi, /bearerAuth/);
  assert.match(openapi, /read-only/i);
  assert.match(skill, /MILESYMEDIA_API_BASE_URL/);
  assert.match(skill, /GET \/assistant\/context/);
  assert.match(skill, /This API is read-only/);
});
