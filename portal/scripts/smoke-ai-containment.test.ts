// AI containment — assume-breach containment, Phase 3 (seed).
//
// Three enforceable properties at the ONE adapter every AI generation passes
// through (assistants and editor workers both call requestOpenAiResponse):
//   1. the AI KILL SWITCH refuses before any provider I/O — flip it during a
//      prompt-injection or cost-runaway incident, lift it after;
//   2. a per-tenant sliding-hour QUOTA bounds runaway generation; one tenant
//      exhausting its budget does not touch another's;
//   3. external assistant proposals are HUMAN-DECIDED: submitting one creates
//      a pending record, never a task — only an explicit accept by a real
//      actor creates work. (The AI proposes; a person disposes.)
// Prompt contents never appear in security events or logs.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test, { beforeEach } from "node:test";

import {
  AiDisabledError,
  AiQuotaExceededError,
  requestOpenAiResponse,
  resetAiQuotaForTest,
} from "../src/lib/server/integrations/openaiResponses";
import { disableAi, enableAi, isAiDisabled } from "../src/lib/server/auth/securityControl";
import { clearSecurityEventsForTest, recentSecurityEvents } from "../src/lib/server/security/securityEvents";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const okFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ output: [] }), { status: 200, headers: { "content-type": "application/json" } });

const mustNotBeCalled: typeof fetch = async () => {
  throw new Error("provider fetch must not be reached");
};

function call(tenantId: string, fetchImpl: typeof fetch = okFetch) {
  return requestOpenAiResponse({
    apiKey: "test-key",
    tenantId,
    payload: { model: "gpt-test", input: "SENSITIVE-PROMPT-CANARY" },
    fetchImpl,
    timeoutMs: 2_000,
  });
}

beforeEach(() => {
  clearSecurityEventsForTest();
  resetAiQuotaForTest();
  if (isAiDisabled()) enableAi("test-reset");
  delete process.env.PORTAL_AI_CALLS_PER_HOUR;
});

test("the AI kill switch refuses before any provider I/O, and lifts", async () => {
  disableAi("incident-commander", "prompt-injection incident");
  await assert.rejects(call("agency-a", mustNotBeCalled), AiDisabledError);

  enableAi("incident-commander");
  const payload = await call("agency-a");
  assert.deepEqual(payload, { output: [] });
});

test("the per-tenant quota bounds runaway generation without touching other tenants", async () => {
  process.env.PORTAL_AI_CALLS_PER_HOUR = "2";
  await call("agency-a");
  await call("agency-a");
  await assert.rejects(call("agency-a", mustNotBeCalled), AiQuotaExceededError);

  // Another tenant still generates.
  const other = await call("agency-b");
  assert.deepEqual(other, { output: [] });

  const event = recentSecurityEvents().find(entry => entry.kind === "ai.quota-exceeded");
  assert.ok(event, "quota exhaustion must land in the event spine");
  assert.equal(event?.tenantId, "agency-a");
});

test("prompt contents never reach the event spine", async () => {
  process.env.PORTAL_AI_CALLS_PER_HOUR = "1";
  await call("agency-a");
  await assert.rejects(call("agency-a", mustNotBeCalled), AiQuotaExceededError);
  const serialised = JSON.stringify(recentSecurityEvents());
  assert.ok(!serialised.includes("SENSITIVE-PROMPT-CANARY"), "events must not carry prompt text");
});

test("kill-switch flips land in the event spine", () => {
  disableAi("ic", "drill");
  enableAi("ic");
  const kinds = recentSecurityEvents().map(event => event.kind);
  assert.ok(kinds.includes("lockdown.ai.disabled"));
  assert.ok(kinds.includes("lockdown.ai.enabled"));
});

test("external assistant proposals cannot auto-execute — submission never creates a task", () => {
  const source = readFileSync(
    join(ROOT, "src/lib/server/assistants/externalAssistantProposals.ts"),
    "utf8",
  );
  // The submit path stores a PENDING proposal and logs — it must never reach
  // for task creation. Only the decide path (a human actor accepting) may.
  const submitBody = source.slice(
    source.indexOf("export function submitExternalAssistantActionProposal"),
    source.indexOf("export function decideExternalAssistantActionProposal"),
  );
  assert.ok(submitBody.length > 0, "expected submit before decide in the module");
  assert.ok(!submitBody.includes("createAgencyTask"), "submit must not create tasks");
  assert.match(submitBody, /status: "pending"/, "a submitted proposal must start pending");

  const decideBody = source.slice(source.indexOf("export function decideExternalAssistantActionProposal"));
  assert.ok(decideBody.includes("createAgencyTask"), "acceptance (a human decision) is where a task may be born");
  assert.match(decideBody, /actorUserId/, "the decision must carry a human actor");
});
