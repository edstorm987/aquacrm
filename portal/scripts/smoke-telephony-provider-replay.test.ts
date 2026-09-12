import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";

import {
  buildOutboundCommunicationFingerprint,
  OUTBOUND_COMMUNICATION_REPLAY_RETENTION_MS,
  outboundOperationRecordId,
  OutboundCommunicationReplayConflictError,
  pruneExpiredOutboundCommunicationOperations,
  runReplayProtectedOutboundOperation,
} from "../src/lib/server/telephony/outboundCommunicationReplay";
import { getState, mutate, reset } from "../src/server/storage";
import type { OutboundCommunicationOperationResult } from "../src/server/types";

const AGENCY = "agency-replay-a";
const OPERATION = "outbound-operation-00000001";
const SUCCESS: OutboundCommunicationOperationResult = {
  successful: true,
  via: "twilio",
  externalProviderId: "CA-provider-one",
};

function callInput(overrides: Partial<{
  agencyId: string;
  clientId: string;
  operationId: string;
  recipient: string;
  senderId: string;
  note: string;
  contactId: string;
  prospectId: string;
}> = {}) {
  const agencyId = overrides.agencyId ?? AGENCY;
  const clientId = overrides.clientId ?? "client-a";
  const operationId = overrides.operationId ?? OPERATION;
  const recipient = overrides.recipient ?? "+447700900123";
  const senderId = overrides.senderId ?? "connection:twilio-a:call";
  const contactId = overrides.contactId ?? "contact-a";
  const prospectId = overrides.prospectId ?? "prospect-a";
  const payload = { contactId, prospectId, note: overrides.note ?? "" };
  return {
    agencyId,
    clientId,
    channel: "twilio-call" as const,
    operationId,
    senderId,
    subjectReferences: { contactId, prospectId },
    requestFingerprint: buildOutboundCommunicationFingerprint({
      agencyId,
      clientId,
      channel: "call",
      recipient,
      senderId,
      payload,
    }),
  };
}

beforeEach(async () => {
  await reset();
});

describe("durable outbound provider replay", () => {
  it("serialises two concurrent requests and calls Twilio once", async () => {
    let providerCalls = 0;
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const release = new Promise<void>(resolve => { releaseProvider = resolve; });
    const started = new Promise<void>(resolve => { providerStarted = resolve; });
    const execute = async () => {
      providerCalls += 1;
      providerStarted();
      await release;
      return SUCCESS;
    };

    const first = runReplayProtectedOutboundOperation(callInput(), execute);
    await started;
    const second = runReplayProtectedOutboundOperation(callInput(), execute);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(providerCalls, 1, "the second tab entered the provider while the first held admission");
    releaseProvider();

    const results = await Promise.all([first, second]);
    assert.equal(providerCalls, 1);
    assert.deepEqual(results.map(result => result.replayed).sort(), [false, true]);
    assert.ok(results.every(result => result.result.successful));
    assert.ok(results.every(result => result.result.externalProviderId === "CA-provider-one"));
    const operations = Object.values(getState().outboundCommunicationOperations);
    assert.equal(operations.length, 1);
    assert.equal(operations[0]?.status, "succeeded");
    assert.deepEqual(operations[0]?.subjectReferences, {
      contactId: "contact-a",
      prospectId: "prospect-a",
    });
    assert.equal(
      operations[0]?.expiresAt,
      (operations[0]?.createdAt ?? 0) + OUTBOUND_COMMUNICATION_REPLAY_RETENTION_MS,
    );
  });

  it("rejects the same logical id with another recipient, sender or payload", async () => {
    let providerCalls = 0;
    await runReplayProtectedOutboundOperation(callInput(), async () => {
      providerCalls += 1;
      return SUCCESS;
    });

    for (const changed of [
      callInput({ recipient: "+447700900999" }),
      callInput({ senderId: "connection:twilio-b:call" }),
      callInput({ note: "different provider payload" }),
      callInput({ clientId: "client-b" }),
    ]) {
      await assert.rejects(
        runReplayProtectedOutboundOperation(changed, async () => {
          providerCalls += 1;
          return SUCCESS;
        }),
        OutboundCommunicationReplayConflictError,
      );
    }
    assert.equal(providerCalls, 1, "a changed replay reached the provider");
  });

  it("keeps a provider exception unknown and never retries it blindly", async () => {
    let providerCalls = 0;
    const first = await runReplayProtectedOutboundOperation(callInput(), async () => {
      providerCalls += 1;
      throw new Error("socket closed after request write");
    });
    assert.equal(first.result.successful, false);
    assert.equal(first.result.outcomeUnknown, true);
    assert.equal(first.result.retry, "reconcile-first");
    assert.equal(getState().outboundCommunicationOperations[Object.keys(getState().outboundCommunicationOperations)[0]!]?.status, "unknown");

    const replay = await runReplayProtectedOutboundOperation(callInput(), async () => {
      providerCalls += 1;
      return SUCCESS;
    });
    assert.equal(providerCalls, 1, "an unknown outcome was sent again");
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.successful, false);
    assert.equal(replay.result.outcomeUnknown, true);
  });

  it("fails a stranded durable admission closed after a process loss", async () => {
    const input = callInput();
    const id = outboundOperationRecordId(input.agencyId, input.channel, input.operationId);
    mutate(state => {
      state.outboundCommunicationOperations[id] = {
        id,
        agencyId: input.agencyId,
        clientId: input.clientId,
        channel: input.channel,
        operationId: input.operationId,
        requestFingerprint: input.requestFingerprint,
        senderId: input.senderId,
        subjectReferences: input.subjectReferences,
        status: "admitted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    let providerCalls = 0;
    const replay = await runReplayProtectedOutboundOperation(input, async () => {
      providerCalls += 1;
      return SUCCESS;
    });
    assert.equal(providerCalls, 0, "a process-loss admission was sent again");
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.outcomeUnknown, true);
    assert.equal(getState().outboundCommunicationOperations[id]?.status, "unknown");
  });

  it("returns a durable SMTP result on exact replay without sending again", async () => {
    const agencyId = AGENCY;
    const clientId = "client-a";
    const senderId = "connection:smtp-a:email";
    const operationId = "smtp-operation-000000000001";
    const input = {
      agencyId,
      clientId,
      channel: "smtp-email" as const,
      operationId,
      senderId,
      subjectReferences: { contactId: "contact-a" },
      requestFingerprint: buildOutboundCommunicationFingerprint({
        agencyId,
        clientId,
        channel: "email",
        recipient: "person@example.com",
        senderId,
        payload: { subject: "Hello", message: "Exact body", contactId: "contact-a" },
      }),
    };
    let providerCalls = 0;
    const execute = async (): Promise<OutboundCommunicationOperationResult> => {
      providerCalls += 1;
      return { successful: true, via: "smtp", externalProviderId: "smtp-message-one" };
    };
    const first = await runReplayProtectedOutboundOperation(input, execute);
    const replay = await runReplayProtectedOutboundOperation(input, execute);
    assert.equal(providerCalls, 1);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.externalProviderId, "smtp-message-one");
  });

  it("scopes the same client operation id independently per agency", async () => {
    let providerCalls = 0;
    const execute = async () => {
      providerCalls += 1;
      return SUCCESS;
    };
    await runReplayProtectedOutboundOperation(callInput({ agencyId: "agency-one" }), execute);
    await runReplayProtectedOutboundOperation(callInput({ agencyId: "agency-two" }), execute);
    assert.equal(providerCalls, 2);
    assert.equal(Object.keys(getState().outboundCommunicationOperations).length, 2);
  });

  it("prunes only expired replay records within the requested agency boundary", async () => {
    const expired = callInput({ agencyId: "agency-expiry-a", operationId: "expiry-operation-00000001" });
    const fresh = callInput({ agencyId: "agency-expiry-a", operationId: "expiry-operation-00000002" });
    const foreign = callInput({ agencyId: "agency-expiry-b", operationId: "expiry-operation-00000003" });
    await runReplayProtectedOutboundOperation(expired, async () => SUCCESS);
    await runReplayProtectedOutboundOperation(fresh, async () => SUCCESS);
    await runReplayProtectedOutboundOperation(foreign, async () => SUCCESS);

    const now = Date.now();
    const expiredId = outboundOperationRecordId(expired.agencyId, expired.channel, expired.operationId);
    const freshId = outboundOperationRecordId(fresh.agencyId, fresh.channel, fresh.operationId);
    const foreignId = outboundOperationRecordId(foreign.agencyId, foreign.channel, foreign.operationId);
    mutate(state => {
      state.outboundCommunicationOperations[expiredId]!.expiresAt = now - 1;
      state.outboundCommunicationOperations[freshId]!.expiresAt = now + 1_000;
      state.outboundCommunicationOperations[foreignId]!.expiresAt = now - 1;
    });

    assert.equal(await pruneExpiredOutboundCommunicationOperations({
      agencyId: expired.agencyId,
      now,
    }), 1);
    assert.equal(getState().outboundCommunicationOperations[expiredId], undefined);
    assert.ok(getState().outboundCommunicationOperations[freshId]);
    assert.ok(getState().outboundCommunicationOperations[foreignId], "agency-scoped pruning crossed tenants");

    assert.equal(await pruneExpiredOutboundCommunicationOperations({ now }), 1);
    assert.equal(getState().outboundCommunicationOperations[foreignId], undefined);
    assert.ok(getState().outboundCommunicationOperations[freshId]);
  });
});

describe("route and client wiring", () => {
  it("carries stable client operation ids and preserves unknown outcomes", () => {
    const callRoute = readFileSync("src/app/api/portal/telephony/call/route.ts", "utf8");
    const emailRoute = readFileSync("src/app/api/portal/telephony/email/route.ts", "utf8");
    const callControl = readFileSync("src/components/telephony/CallControls.tsx", "utf8");
    const emailControl = readFileSync("src/components/telephony/EmailControls.tsx", "utf8");
    const smtp = readFileSync("src/lib/server/email/transactionalEmail.ts", "utf8");
    const inboxCron = readFileSync("src/app/api/cron/inbox/route.ts", "utf8");

    assert.match(callControl, /logicalCallRef[\s\S]*?crypto\.randomUUID\(\)[\s\S]*?logicalCallId/,
      "calls do not retain one client-generated operation id across an ambiguous retry");
    assert.match(callRoute, /logicalCallId[\s\S]*?runReplayProtectedOutboundOperation\([\s\S]*?channel: "twilio-call"/,
      "Twilio is not behind durable replay admission");
    assert.match(callRoute, /idempotencyKey: `outreach-call:\$\{logicalCallId\}:\$\{logicalCallFingerprint\}`/,
      "a successful call replay can duplicate its activity entry");
    assert.match(callRoute, /subjectReferences:[\s\S]*?prospectId: resolvedProspectId[\s\S]*?contactId: verifiedContactId/,
      "Twilio replay admission lacks exact acquisition subject lineage");
    assert.match(callRoute, /action: "call\.initiated"[\s\S]*?prospectId: resolvedProspectId[\s\S]*?contactId: verifiedContactId/,
      "call activity lacks exact acquisition subject lineage");
    assert.match(emailRoute, /emailProvider === "smtp"[\s\S]*?runReplayProtectedOutboundOperation\([\s\S]*?channel: "smtp-email"/,
      "SMTP is not behind durable replay admission");
    assert.match(emailRoute, /subjectReferences:[\s\S]*?prospectId: resolvedProspectId[\s\S]*?contactId: verifiedContactId/,
      "SMTP replay admission lacks exact acquisition subject lineage");
    assert.match(emailRoute, /action: "outreach\.email\.sent"[\s\S]*?prospectId: resolvedProspectId[\s\S]*?contactId: verifiedContactId/,
      "email activity lacks exact acquisition subject lineage");
    assert.match(emailControl, /response\.status < 500 \|\| result\?\.retry === "safe"[\s\S]*?logicalSendRef\.current = null/,
      "SMTP ambiguous or post-provider failures lose the operation id needed for safe replay");
    assert.match(smtp, /withRemoteOperationDeadline\([\s\S]*?operation: "SMTP email delivery"[\s\S]*?outcome: "non-idempotent-write"/,
      "SMTP timeouts are still presented as definitive failure");
    assert.match(emailRoute, /status: result\.outcomeUnknown \? 503 : 502/,
      "the email route hides an ambiguous provider outcome");
    assert.match(callRoute, /result\.outcomeUnknown \? 503 : 502/,
      "the call route hides an ambiguous provider outcome");
    assert.match(inboxCron, /pruneExpiredOutboundCommunicationOperations\(\)/,
      "idle tenants have no scheduled replay-retention pruning path");
  });
});
