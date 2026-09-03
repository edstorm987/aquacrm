import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("assistant is a tenant-scoped authenticated agency feature", () => {
  const route = read("src/app/api/assistant/route.ts");
  const page = read("src/app/portal/agency/assistant/page.tsx");
  assert.match(route, /agency-owner/);
  assert.match(route, /agency-manager/);
  assert.match(route, /requireAssistantElement\("workspace\.overview"\)/);
  assert.match(route, /actor\.resourceAgencyId/);
  assert.match(route, /invalid_origin/);
  assert.match(page, /requireAssistantElement\("workspace\.overview"\)/);
  assert.match(page, /actor\.resourceAgencyId/);
});

test("assistant keeps durable history and personal memory", () => {
  const store = read("src/lib/server/assistants/assistantStore.ts");
  const route = read("src/app/api/assistant/route.ts");
  const types = read("src/server/types.ts");
  const storage = read("src/server/storage.ts");
  assert.match(store, /appendAssistantMessage/);
  assert.match(store, /addAssistantMemory/);
  assert.match(types, /AssistantWorkspaceState/);
  assert.match(storage, /assistant: parsed\.assistant \?\? \{\}/);
  assert.match(store, /beginAssistantTurn/);
  assert.match(store, /recordAssistantTurnProviderResult/);
  assert.match(store, /completeAssistantTurn/);
  assert.match(route, /operationId/);
  assert.match(route, /withAssistantTransaction/);
  assert.match(route, /assistant_turn_failed/);
  assert.match(route, /assistant_turn_persistence_failed/);
  const ui = read("src/app/portal/agency/assistant/AssistantWorkspace.tsx");
  assert.match(ui, /pendingTurnRef/);
  assert.match(ui, /crypto\.randomUUID/);
  assert.match(ui, /turnOperations/);
});

test("assistant reads fresh skill-scoped context without exposing secrets", () => {
  const context = read("src/lib/server/assistants/assistantBusinessContext.ts");
  const skillContext = read("src/lib/server/assistants/advisorSkillContext.ts");
  const route = read("src/app/api/assistant/route.ts");
  const openai = read("src/lib/server/assistants/openaiAssistant.ts");
  const openaiWire = read("src/lib/server/integrations/openaiResponses.ts");
  assert.match(context, /SECRET_KEY/);
  assert.match(context, /recentActivity/);
  assert.match(context, /businessModules/);
  assert.match(skillContext, /skill\.maxRecords/);
  assert.match(route, /buildAdvisorSkillContext/);
  assert.doesNotMatch(route, /workspaceContext\.serialized/);
  assert.match(openai, /advisorSkillInstruction/);
  assert.match(openai, /requestOpenAiResponse/);
  assert.match(openaiWire, /store: false/);
  assert.match(openaiWire, /withRemoteOperationDeadline/);
  assert.match(openai, /OPENAI_API_KEY/);
});

test("Aqua Advisor remains available globally with history, memory, and voice", () => {
  const ui = read("src/app/portal/agency/assistant/AssistantWorkspace.tsx");
  const topbar = read("src/components/chrome/Topbar.tsx");
  const drawer = read("src/components/chrome/GlobalAdvisorDrawer.tsx");
  const styles = read("src/app/globals.css");
  const control = read("src/components/chrome/AdvisorDrawerControl.tsx");
  const agencyLayout = read("src/app/portal/agency/layout.tsx");
  const journeyPage = read("src/app/portal/clients/page.tsx");
  const clientLayout = read("src/app/portal/clients/[clientId]/layout.tsx");
  assert.match(ui, /Conversation history/);
  assert.match(ui, /Assistant memory/);
  assert.match(ui, /SpeechRecognition/);
  assert.match(ui, /speechSynthesis/);
  assert.match(ui, /Connect the OpenAI API/);
  assert.match(ui, /Aqua Advisor/);
  assert.match(topbar, /\/portal\/agency\/assistant/);
  assert.match(topbar, /Open Aqua Advisor/);
  assert.match(drawer, /aria-modal="false"/);
  assert.match(drawer, /pointer-events-none/);
  assert.match(drawer, /createPortal/);
  assert.match(drawer, /setPortalRoot\(document\.body\)/);
  assert.match(drawer, /openRef\.current/);
  // The notice is now templated on the assistant's name (the drawer is reskinned
  // per assistant — e.g. the Dev Team's Librarian), and DEFAULTS to the Advisor
  // so every agency/clients caller is unchanged.
  assert.match(drawer, /\$\{assistantName\} reply is ready/);
  assert.match(drawer, /assistantName = "Aqua Advisor"/);
  assert.match(drawer, /aria-live="polite"/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /aqua-advisor:open/);
  assert.match(drawer, /mm-advisor-drawer/);
  assert.match(styles, /\.mm-advisor-drawer\s*\{\s*width: 100%;\s*max-width: none;/);
  assert.match(styles, /@media \(min-width: 640px\)[\s\S]*?\.mm-advisor-drawer\s*\{[\s\S]*?width: min\(520px, calc\(100vw - 6rem\)\);/);
  assert.match(control, /assistantBusinessContextForActor\(actor\)/);
  assert.match(control, /resolveBusinessRadarAccessForActor\(actor\)/);
  assert.match(agencyLayout, /AdvisorDrawerControl/);
  assert.match(journeyPage, /AdvisorDrawerControl/);
  assert.match(clientLayout, /AdvisorDrawerControl/);
});
