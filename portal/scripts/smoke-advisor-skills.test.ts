import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Advisor skills are deny-by-default recipes with no destructive database access", () => {
  const catalogue = read("src/lib/advisor/advisorSkills.ts");
  assert.match(catalogue, /rawDatabaseAccess: false/);
  assert.match(catalogue, /destructiveMutations: false/);
  assert.match(catalogue, /allowedMutations: \["task\.create"\]/);
  assert.match(catalogue, /approval: "always"/);
  assert.match(catalogue, /maxRecords: 1/);
  assert.doesNotMatch(catalogue, /delete\.|update\.|raw-query|sql/i);
});

test("custom skills can only compose a fixed safe recipe", () => {
  const service = read("src/lib/server/assistants/advisorSkillsService.ts");
  const settings = read("src/server/agencySettings.ts");
  const route = read("src/app/api/portal/advisor/skills/route.ts");
  assert.match(service, /ADVISOR_SKILL_RECIPES\[input\.recipeId\]/);
  assert.match(service, /Built-in skills can be disabled, but not deleted/);
  assert.match(settings, /cleanCustomAdvisorSkills/);
  assert.match(settings, /slice\(0, 24\)/);
  // Was `requireRole(["agency-owner","agency-manager"])`. Replaced 2026-08-27
  // (issue #182) by an ELEMENT requirement, which is strictly stronger: a role
  // check passes a manager whose element access has been narrowed, and the AI
  // then answers from data the UI hides from them.
  assert.match(route, /requireAssistantElement\("workspace\.overview"\)/);
  assert.match(route, /requireAssistantElement\("workspace\.settings", "manage"\)/,
    "editing an Advisor skill is configuration and must need more than reading one");
  // `agency-manager` no longer appears: the gate is an element, not a role list.
  assert.doesNotMatch(route, /requireRole\(/,
    "the Advisor skills route is back on a role check");
  assert.match(route, /invalid_origin/);
  assert.match(route, /rateLimit/);
});

test("model calls receive skill-scoped projections instead of raw workspace storage", () => {
  const scoped = read("src/lib/server/assistants/advisorSkillContext.ts");
  const assistantRoute = read("src/app/api/assistant/route.ts");
  const model = read("src/lib/server/assistants/openaiAssistant.ts");
  const skills = read("src/lib/server/assistants/advisorSkillsService.ts");
  assert.match(scoped, /scopedIssues/);
  assert.match(scoped, /scopedSignals/);
  assert.match(scoped, /skill\.maxRecords/);
  assert.doesNotMatch(scoped, /getState|pluginData|businessModules/);
  assert.match(assistantRoute, /resolveAdvisorSkill/);
  assert.match(assistantRoute, /skillContext\.serialized/);
  assert.doesNotMatch(assistantRoute, /workspaceContext\.serialized/);
  assert.match(model, /advisorSkillInstruction/);
  assert.match(skills, /Do not act outside this manifest/);
  assert.match(model, /separate bounded server action plus explicit human approval/);
});

test("the Advisor UI exposes skill safety, creation, controls and deliberate runs", () => {
  const ui = read("src/app/portal/agency/assistant/AssistantWorkspace.tsx");
  assert.match(ui, /Advisor skills/);
  assert.match(ui, /Deny by default/);
  assert.match(ui, /Maximum power, bounded impact/);
  assert.match(ui, /Create bounded skill/);
  assert.match(ui, /Run skill/);
  assert.match(ui, /Raw DB access/);
  assert.match(ui, /Confirm delete/);
});
