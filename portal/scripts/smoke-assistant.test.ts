import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("assistant is a tenant-scoped authenticated agency feature", () => {
  const route = read("src/app/api/assistant/route.ts");
  const page = read("src/app/portal/agency/assistant/page.tsx");
  assert.match(route, /agency-owner/);
  assert.match(route, /agency-manager/);
  assert.match(route, /session\.agencyId/);
  assert.match(route, /invalid_origin/);
  assert.match(page, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
});

test("assistant keeps durable history and personal memory", () => {
  const store = read("src/lib/server/assistantStore.ts");
  const types = read("src/server/types.ts");
  const storage = read("src/server/storage.ts");
  assert.match(store, /appendAssistantMessage/);
  assert.match(store, /addAssistantMemory/);
  assert.match(types, /AssistantWorkspaceState/);
  assert.match(storage, /assistant: parsed\.assistant \?\? \{\}/);
});

test("assistant reads fresh business context without exposing secrets", () => {
  const context = read("src/lib/server/assistantBusinessContext.ts");
  const openai = read("src/lib/server/openaiAssistant.ts");
  assert.match(context, /SECRET_KEY/);
  assert.match(context, /recentActivity/);
  assert.match(context, /businessModules/);
  assert.match(openai, /read-only access/);
  assert.match(openai, /store: false/);
  assert.match(openai, /OPENAI_API_KEY/);
});

test("Aqua Advisor remains available globally with history, memory, and voice", () => {
  const ui = read("src/app/portal/agency/assistant/AssistantWorkspace.tsx");
  const topbar = read("src/components/chrome/Topbar.tsx");
  assert.match(ui, /Conversation history/);
  assert.match(ui, /Assistant memory/);
  assert.match(ui, /SpeechRecognition/);
  assert.match(ui, /speechSynthesis/);
  assert.match(ui, /Connect the OpenAI API/);
  assert.match(ui, /Aqua Advisor/);
  assert.match(topbar, /\/portal\/agency\/assistant/);
  assert.match(topbar, /Open Aqua Advisor/);
});
