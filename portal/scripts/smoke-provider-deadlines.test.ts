import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addLineToShopifyCart, shopifyFetch } from "../src/built-ins/modules/ecommerce/src/lib/shopify";
import { sendResendEmail } from "../src/lib/server/email/resendEmail";
import { attachDomain } from "../src/lib/server/integrations/vercelDomain.impl";
import { stripeHttpRequest } from "../src/lib/server/integrations/stripeHttp";
import { requestOpenAiResponse } from "../src/lib/server/integrations/openaiResponses";
import { RemoteOperationError, type RemoteOperationEvent } from "../src/lib/server/remoteOperation";
import { SandboxProviderBlockedError } from "../src/lib/server/sandbox/providerPolicy";
import { runInDataRealm } from "../src/server/dataRealm";

const ORIGINAL_FETCH = globalThis.fetch;

test("Resend exits on deadline and reports late idempotent delivery as unknown", async () => {
  let providerAccepted = false;
  let providerSignal: AbortSignal | null = null;
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>(resolve => {
    providerSignal = init?.signal as AbortSignal;
    setTimeout(() => {
      providerAccepted = true;
      resolve(new Response(JSON.stringify({ id: "late-email" }), { status: 200 }));
    }, 25);
  })) as typeof fetch;

  try {
    const result = await sendResendEmail({
      apiKey: "test-key",
      from: "Aqua <aqua@example.com>",
      to: "client@example.com",
      subject: "Hello",
      text: "Hello",
      html: "<p>Hello</p>",
      idempotencyKey: "email-operation-1",
      timeoutMs: 5,
    });

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Expected a timeout result.");
    assert.equal(result.code, "REMOTE_OPERATION_TIMEOUT");
    assert.equal(result.outcomeUnknown, true);
    assert.equal(result.retry, "same-operation-key");
    assert.equal(providerSignal?.aborted, true);
    assert.equal(providerAccepted, false);
    await delay(30);
    assert.equal(providerAccepted, true, "the simulated provider accepted after the local deadline");
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test("a pre-cancelled Resend request never reaches the provider", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendResendEmail({
      apiKey: "test-key",
      from: "aqua@example.com",
      to: "client@example.com",
      subject: "Hello",
      text: "Hello",
      html: "<p>Hello</p>",
      idempotencyKey: "email-operation-2",
      signal: controller.signal,
      timeoutMs: 50,
    });

    assert.equal(called, false);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Expected an aborted result.");
    assert.equal(result.code, "REMOTE_OPERATION_ABORTED");
    assert.equal(result.outcomeUnknown, false);
    assert.equal(result.retry, "safe");
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test("Vercel attach exits a never-settling adapter with idempotent recovery guidance", async () => {
  let providerSignal: AbortSignal | null = null;
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
    providerSignal = init?.signal as AbortSignal;
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  try {
    const result = await attachDomain(
      { token: "token", projectId: "project" },
      "example.com",
      { timeoutMs: 5 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.outcomeUnknown, true);
    assert.equal(result.retry, "same-operation-key");
    assert.match(result.error ?? "", /outcome is unknown/i);
    assert.equal(providerSignal?.aborted, true);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test("Shopify query timeout is safe to retry", async () => {
  globalThis.fetch = (() => new Promise<Response>(() => undefined)) as typeof fetch;
  try {
    const error = await rejectionOf(shopifyFetch(
      { domain: "store.myshopify.com", storefrontAccessToken: "token" },
      { query: "query Products { products(first: 1) { nodes { id } } }" },
      { timeoutMs: 5 },
    ));
    assert.ok(error instanceof RemoteOperationError);
    assert.equal(error.outcome, "read");
    assert.equal(error.outcomeUnknown, false);
    assert.equal(error.retry, "safe");
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test("Shopify cart mutation timeout requires reconciliation before retry", async () => {
  globalThis.fetch = (() => new Promise<Response>(() => undefined)) as typeof fetch;
  try {
    const error = await rejectionOf(addLineToShopifyCart(
      { domain: "store.myshopify.com", storefrontAccessToken: "token" },
      "cart-1",
      "variant-1",
      1,
      { timeoutMs: 5 },
    ));
    assert.ok(error instanceof RemoteOperationError);
    assert.equal(error.outcome, "non-idempotent-write");
    assert.equal(error.outcomeUnknown, true);
    assert.equal(error.retry, "reconcile-first");
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test("Stripe POST carries its durable key and exits a late response as same-key retry", async () => {
  let providerSignal: AbortSignal | null = null;
  let idempotencyKey: string | null = null;
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
    providerSignal = init?.signal as AbortSignal;
    idempotencyKey = new Headers(init?.headers).get("idempotency-key");
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  try {
    const error = await rejectionOf(stripeHttpRequest({
      secretKey: "sk_test",
      path: "/v1/checkout/sessions",
      method: "POST",
      form: new URLSearchParams({ mode: "payment" }),
      idempotencyKey: "commercial-checkout-operation-1",
      outcome: "idempotent-write",
      timeoutMs: 5,
    }));
    assert.ok(error instanceof RemoteOperationError);
    assert.equal(error.outcomeUnknown, true);
    assert.equal(error.retry, "same-operation-key");
    assert.equal(idempotencyKey, "commercial-checkout-operation-1");
    assert.equal(providerSignal?.aborted, true);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test("the commercial handler uses the bounded Stripe client and stable operation keys", () => {
  const source = readFileSync(
    new URL("../src/built-ins/modules/leads-pipeline/src/api/handlers.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /stripeHttpRequest/);
  assert.match(source, /commercial-checkout:/);
  assert.match(source, /commercial-installments-complete:/);
  assert.doesNotMatch(source, /fetch\([^\n]*api\.stripe\.com/);
});

test("OpenAI generation settles on deadline even when the provider adapter ignores cancellation", async () => {
  let providerSignal: AbortSignal | null = null;
  const events: RemoteOperationEvent[] = [];
  const error = await rejectionOf(requestOpenAiResponse({
    apiKey: "test-key",
    payload: { model: "test-model", input: "hello" },
    timeoutMs: 5,
    fetchImpl: ((_url: RequestInfo | URL, init?: RequestInit) => {
      providerSignal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch,
    onEvent: event => events.push(event),
  }));

  assert.ok(error instanceof RemoteOperationError);
  assert.equal(error.budget, "aiGeneration");
  assert.equal(error.outcome, "non-idempotent-write");
  assert.equal(error.outcomeUnknown, true);
  assert.equal(error.retry, "reconcile-first");
  assert.equal(providerSignal?.aborted, true);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, "timed-out");
  assert.equal(events[0]?.budget, "aiGeneration");
  assert.equal(events[0]?.outcomeUnknown, true);
  assert.equal(events[0]?.retry, "reconcile-first");
  assert.ok((events[0]?.durationMs ?? 0) >= 4);
});

test("sandbox realms block OpenAI and Shopify at their shared network boundaries", async () => {
  let fetchCalls = 0;
  const fetchImpl = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ output_text: "must not run" }), { status: 200 });
  }) as typeof fetch;

  await runInDataRealm("sandbox-provider-boundary-test", async () => {
    const openAiError = await rejectionOf(requestOpenAiResponse({
      apiKey: "live-looking-openai-key",
      payload: { model: "test-model", input: "do not send" },
      fetchImpl,
    }));
    assert.ok(openAiError instanceof SandboxProviderBlockedError);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const shopifyError = await rejectionOf(shopifyFetch(
        { domain: "store.myshopify.com", storefrontAccessToken: "live-looking-shopify-token" },
        { query: "query Products { products(first: 1) { nodes { id } } }" },
      ));
      assert.ok(shopifyError instanceof SandboxProviderBlockedError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  assert.equal(fetchCalls, 0);
});

test("OpenAI requests enforce no-store and emit a successful duration without leaking credentials", async () => {
  let authorization = "";
  let requestBody = "";
  const events: Array<{ status: string; durationMs: number; operation: string }> = [];
  const payload = await requestOpenAiResponse({
    apiKey: "private-test-key",
    payload: { model: "test-model", input: "hello", store: true },
    timeoutMs: 50,
    fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ output_text: "done" }), { status: 200 });
    }) as typeof fetch,
    onEvent: event => events.push(event),
  });

  assert.equal(payload.output_text, "done");
  assert.equal(authorization, "Bearer private-test-key");
  assert.equal(JSON.parse(requestBody).store, false);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, "succeeded");
  assert.equal(events[0]?.operation.includes("private-test-key"), false);
  assert.ok((events[0]?.durationMs ?? -1) >= 0);
});

test("integration connection tests use the hard-settling shared provider deadline", () => {
  const source = readFileSync(
    new URL("../src/lib/server/integrations/integrationConnections.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /withRemoteOperationDeadline/);
  assert.match(source, /timeoutMs:\s*TEST_TIMEOUT_MS/);
  assert.match(source, /signal => testProvider/);
  assert.doesNotMatch(source, /const controller = new AbortController\(\);\s*const timeout = setTimeout/);
});

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("Expected the promise to reject.");
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
