import assert from "node:assert/strict";
import test from "node:test";

import {
  RemoteOperationDefinitiveError,
  RemoteOperationError,
  isRemoteOperationError,
  withRemoteOperationDeadline,
} from "../src/lib/server/remoteOperation";

test("a completed operation receives a live composed signal", async () => {
  const result = await withRemoteOperationDeadline({
    operation: "Provider read",
    budget: "providerRead",
    outcome: "read",
    timeoutMs: 50,
  }, async signal => {
    assert.equal(signal.aborted, false);
    return "done";
  });

  assert.equal(result, "done");
});

test("the deadline settles even when an adapter ignores its abort signal", async () => {
  let receivedSignal: AbortSignal | undefined;
  const error = await rejectionOf(withRemoteOperationDeadline({
    operation: "Stalled read",
    budget: "storageRead",
    outcome: "read",
    timeoutMs: 10,
  }, signal => {
    receivedSignal = signal;
    return new Promise<never>(() => undefined);
  }));

  assert.ok(isRemoteOperationError(error));
  assert.equal(error.code, "REMOTE_OPERATION_TIMEOUT");
  assert.equal(error.outcomeUnknown, false);
  assert.equal(error.retry, "safe");
  assert.equal(receivedSignal?.aborted, true);
});

test("an idempotent write timeout requires the same operation key", async () => {
  const error = await rejectionOf(withRemoteOperationDeadline({
    operation: "Email send",
    budget: "providerWrite",
    outcome: "idempotent-write",
    timeoutMs: 5,
  }, () => new Promise<never>(() => undefined)));

  assert.ok(error instanceof RemoteOperationError);
  assert.equal(error.outcomeUnknown, true);
  assert.equal(error.retry, "same-operation-key");
  assert.match(error.message, /outcome is unknown/i);
});

test("a non-idempotent write timeout refuses a blind retry", async () => {
  const error = await rejectionOf(withRemoteOperationDeadline({
    operation: "Cart mutation",
    budget: "providerWrite",
    outcome: "non-idempotent-write",
    timeoutMs: 5,
  }, () => new Promise<never>(() => undefined)));

  assert.ok(error instanceof RemoteOperationError);
  assert.equal(error.outcomeUnknown, true);
  assert.equal(error.retry, "reconcile-first");
  assert.match(error.message, /reconcile with the provider/i);
});

test("a raw failure after a non-idempotent write starts has an unknown outcome", async () => {
  const cause = new Error("socket reset");
  const events: Array<{ status: string; outcomeUnknown?: boolean; retry?: string }> = [];
  const error = await rejectionOf(withRemoteOperationDeadline({
    operation: "Phone call",
    budget: "providerWrite",
    outcome: "non-idempotent-write",
    timeoutMs: 50,
    onEvent: event => events.push(event),
  }, async () => {
    throw cause;
  }));

  assert.ok(error instanceof RemoteOperationError);
  assert.equal(error.code, "REMOTE_OPERATION_FAILED");
  assert.equal(error.kind, "failed");
  assert.equal(error.outcomeUnknown, true);
  assert.equal(error.retry, "reconcile-first");
  assert.equal(error.cause, cause);
  assert.match(error.message, /socket reset/);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, "failed");
  assert.equal(events[0]?.outcomeUnknown, true);
  assert.equal(events[0]?.retry, "reconcile-first");
});

test("a raw read failure remains the provider error and a definitive refusal stays known", async () => {
  const readFailure = new Error("read socket reset");
  const readError = await rejectionOf(withRemoteOperationDeadline({
    operation: "Provider read",
    budget: "providerRead",
    outcome: "read",
    timeoutMs: 50,
  }, async () => {
    throw readFailure;
  }));
  assert.equal(readError, readFailure);

  const refusal = new RemoteOperationDefinitiveError("provider rejected request");
  const refusalError = await rejectionOf(withRemoteOperationDeadline({
    operation: "Provider write",
    budget: "providerWrite",
    outcome: "non-idempotent-write",
    timeoutMs: 50,
  }, async () => {
    throw refusal;
  }));
  assert.equal(refusalError, refusal);
});

test("pre-aborted callers never start the remote operation", async () => {
  const controller = new AbortController();
  controller.abort();
  let started = false;
  const error = await rejectionOf(withRemoteOperationDeadline({
    operation: "Cancelled write",
    budget: "storageWrite",
    outcome: "non-idempotent-write",
    signal: controller.signal,
    timeoutMs: 50,
  }, async () => {
    started = true;
  }));

  assert.equal(started, false);
  assert.ok(error instanceof RemoteOperationError);
  assert.equal(error.kind, "aborted");
  assert.equal(error.outcomeUnknown, false);
  assert.equal(error.retry, "safe");
});

test("caller cancellation aborts in-flight work with typed unknown outcome", async () => {
  const controller = new AbortController();
  let providerSignal: AbortSignal | undefined;
  const pending = withRemoteOperationDeadline({
    operation: "Provider write",
    budget: "providerWrite",
    outcome: "non-idempotent-write",
    signal: controller.signal,
    timeoutMs: 100,
  }, signal => {
    providerSignal = signal;
    return new Promise<never>(() => undefined);
  });
  await Promise.resolve();
  controller.abort();
  const error = await rejectionOf(pending);

  assert.ok(error instanceof RemoteOperationError);
  assert.equal(error.code, "REMOTE_OPERATION_ABORTED");
  assert.equal(error.outcomeUnknown, true);
  assert.equal(error.retry, "reconcile-first");
  assert.equal(providerSignal?.aborted, true);
});

test("invalid timeout overrides fail before the operation starts", async () => {
  let started = false;
  const error = await rejectionOf(withRemoteOperationDeadline({
    operation: "Invalid budget",
    budget: "providerRead",
    outcome: "read",
    timeoutMs: 0,
  }, async () => {
    started = true;
  }));

  assert.equal(started, false);
  assert.ok(error instanceof TypeError);
});

test("duration instrumentation cannot change a successful provider outcome", async () => {
  const events: Array<{ status: string; durationMs: number; timeoutMs: number }> = [];
  const result = await withRemoteOperationDeadline({
    operation: "Instrumented read",
    budget: "providerRead",
    outcome: "read",
    timeoutMs: 50,
    onEvent: event => events.push(event),
  }, async () => "done");

  assert.equal(result, "done");
  assert.deepEqual(events.map(event => event.status), ["succeeded"]);
  assert.equal(events[0]?.timeoutMs, 50);
  assert.ok((events[0]?.durationMs ?? -1) >= 0);

  const stillDone = await withRemoteOperationDeadline({
    operation: "Broken observer",
    budget: "providerRead",
    outcome: "read",
    timeoutMs: 50,
    onEvent: () => { throw new Error("telemetry sink unavailable"); },
  }, async () => "still-done");
  assert.equal(stillDone, "still-done");
});

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("Expected the promise to reject.");
}
