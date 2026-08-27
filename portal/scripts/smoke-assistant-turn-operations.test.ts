import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantTurnConflictError,
  beginAssistantTurn,
  completeAssistantTurn,
  createAssistantThread,
  deleteAssistantThread,
  getAssistantWorkspace,
  recordAssistantTurnFailure,
  recordAssistantTurnProviderResult,
} from "../src/lib/server/assistants/assistantStore";

const agencyId = `assistant-turns-${process.pid}`;
const userId = "owner-user";

test("failed Advisor turns retry one durable intent and commit memory only with the answer", () => {
  const first = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_failure_001",
    message: "Remember that our target is 10",
    skillId: "executive-radar",
    memoryContent: "our target is 10",
    now: 1_000,
  });
  assert.equal(first.claimed, true);
  assert.equal(getAssistantWorkspace(agencyId, userId).threads.length, 0);
  assert.equal(getAssistantWorkspace(agencyId, userId).memories.length, 0);

  const failed = recordAssistantTurnFailure(agencyId, userId, first.operation.id, first.attempt, "provider unavailable", 2_000);
  assert.equal(failed?.operation.status, "failed");
  assert.equal(getAssistantWorkspace(agencyId, userId).threads.length, 0);
  assert.equal(getAssistantWorkspace(agencyId, userId).memories.length, 0);

  const retry = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_failure_001",
    message: "Remember that our target is 10",
    skillId: "executive-radar",
    memoryContent: "our target is 10",
    now: 3_000,
  });
  assert.equal(retry.operation.threadId, first.operation.threadId);
  assert.equal(retry.operation.userMessageId, first.operation.userMessageId);
  assert.equal(retry.attempt, 2);
  assert.equal(recordAssistantTurnProviderResult(agencyId, userId, retry.operation.id, retry.attempt, "I will use that target.", 4_000)?.accepted, true);

  const completed = completeAssistantTurn(agencyId, userId, retry.operation.id, 5_000);
  assert.equal(completed?.completedNow, true);
  assert.deepEqual(completed?.thread.messages.map(message => message.role), ["user", "assistant"]);
  assert.equal(getAssistantWorkspace(agencyId, userId).memories[0]?.content, "our target is 10");

  const replay = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_failure_001",
    message: "Remember that our target is 10",
    skillId: "executive-radar",
    memoryContent: "our target is 10",
    now: 6_000,
  });
  assert.equal(replay.operation.status, "completed");
  assert.equal(completeAssistantTurn(agencyId, userId, replay.operation.id, 7_000)?.completedNow, false);
  const workspace = getAssistantWorkspace(agencyId, userId);
  assert.equal(workspace.threads.length, 1);
  assert.equal(workspace.threads[0]?.messages.length, 2);
  assert.equal(workspace.memories.length, 1);
  assert.throws(() => beginAssistantTurn(agencyId, userId, {
    operationId: "turn_failure_001",
    message: "A different question",
    skillId: "executive-radar",
  }), AssistantTurnConflictError);
});

test("leases reject overlapping generation and ignore a late stale provider result", () => {
  const first = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_lease_002",
    message: "What should I do next?",
    skillId: "executive-radar",
    now: 10_000,
  });
  const overlap = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_lease_002",
    message: "What should I do next?",
    skillId: "executive-radar",
    now: 20_000,
  });
  assert.equal(overlap.claimed, false);
  const recovered = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_lease_002",
    message: "What should I do next?",
    skillId: "executive-radar",
    now: 71_000,
  });
  assert.equal(recovered.claimed, true);
  assert.equal(recovered.attempt, 2);
  assert.equal(recordAssistantTurnProviderResult(agencyId, userId, first.operation.id, first.attempt, "late old answer", 72_000)?.accepted, false);
  assert.equal(recordAssistantTurnProviderResult(agencyId, userId, recovered.operation.id, recovered.attempt, "current answer", 73_000)?.accepted, true);
  assert.equal(completeAssistantTurn(agencyId, userId, recovered.operation.id, 74_000)?.assistantMessage.content, "current answer");
});

test("deleting a conversation cancels its unfinished turn instead of resurrecting it", () => {
  const thread = createAssistantThread(agencyId, userId, "Temporary");
  const claim = beginAssistantTurn(agencyId, userId, {
    operationId: "turn_cancel_003",
    threadId: thread.id,
    message: "Review this thread",
    skillId: "executive-radar",
  });
  assert.throws(() => beginAssistantTurn(agencyId, userId, {
    operationId: "turn_overlap_004",
    threadId: thread.id,
    message: "Start another answer",
    skillId: "executive-radar",
  }), /Another turn is already active/);
  deleteAssistantThread(agencyId, userId, thread.id);
  assert.equal(recordAssistantTurnProviderResult(agencyId, userId, claim.operation.id, claim.attempt, "should be discarded"), null);
  assert.equal(getAssistantWorkspace(agencyId, userId).threads.some(item => item.id === thread.id), false);
});
