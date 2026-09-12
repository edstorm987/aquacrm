// Anonymous provider errors must never disclose tenant configuration detail.
// Hermetic: arbitrary signatures, local empty configs, no provider/network use.

process.env.PORTAL_BACKEND ??= "memory";
process.env.STRIPE_SECRET_KEY = "";
process.env.STRIPE_WEBHOOK_SECRET = "";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { stripeWebhookHandler as financeWebhook } from "../src/built-ins/modules/agency-finance/src/api/handlers-stripe";
import { stripeWebhookHandler as ecommerceWebhook } from "../src/built-ins/modules/ecommerce/src/api/handlers";
import { commercialStripeWebhookHandler as commercialWebhook } from "../src/built-ins/modules/leads-pipeline/src/api/handlers";
import { stripeWebhookHandler as affiliatesWebhook } from "../src/built-ins/modules/affiliates/src/api/handlers";
import { stripeWebhookHandler as membershipsWebhook } from "../src/built-ins/modules/memberships/src/api/handlers";
import {
  clearAffiliatesFoundation,
  registerAffiliatesFoundation,
} from "../src/built-ins/modules/affiliates/src/server/foundationAdapter";
import {
  clearMembershipsFoundation,
  registerMembershipsFoundation,
} from "../src/built-ins/modules/memberships/src/server/foundationAdapter";
import {
  publicWebhookProcessingFailed,
  publicWebhookUnavailable,
  logPluginDispatcherFlushFailure,
} from "../src/lib/server/portal/publicWebhookResponse";
import {
  activateIntegrationConnection,
  resolveIntegrationValues,
  saveIntegrationConnection,
} from "../src/lib/server/integrations/integrationConnections";
import type { PluginCtx } from "../src/built-ins/runtime/_types";

function context(
  pluginId: string,
  clientScoped = false,
  config: Record<string, unknown> = {},
): PluginCtx {
  const clientId = clientScoped ? `client_${pluginId}` : undefined;
  return {
    agencyId: `agency_${pluginId}`,
    clientId,
    actor: "anonymous",
    install: {
      id: `install_${pluginId}`,
      pluginId,
      agencyId: `agency_${pluginId}`,
      clientId,
      version: "1.0.0",
      status: "enabled",
      config,
      features: {},
      installedAt: Date.now(),
      updatedAt: Date.now(),
    },
    storage: {} as PluginCtx["storage"],
    services: {} as PluginCtx["services"],
  } as PluginCtx;
}

function signedLookingRequest(): Request {
  return new Request("https://portal.example.test/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=not-a-real-signature" },
    body: "{}",
  });
}

function signedStripeRequest(rawBody: string, secret: string): Request {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return new Request("https://portal.example.test/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: rawBody,
  });
}

async function publicError(response: Response) {
  const body = await response.json() as { ok?: boolean; error?: string; retryable?: boolean };
  assert.equal(body.ok, false);
  assert.ok(
    body.error === "webhook_refused" || body.error === "webhook_unavailable" || body.error === "webhook_processing_failed",
    `unexpected public error: ${body.error}`,
  );
  assert.doesNotMatch(JSON.stringify(body), /secret|configured|configuration|install|agency|client|stripe package/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.retryable, response.status >= 500 ? true : undefined);
  return body;
}

function bodyProbeRequest(signature: boolean): { request: Request; wasBodyRead: () => boolean } {
  let bodyRead = false;
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("stripe-signature", "t=1,v1=not-a-real-signature");
  return {
    request: {
      method: "POST",
      url: "https://portal.example.test/webhook",
      headers,
      get body() {
        bodyRead = true;
        throw new Error("body must not be read");
      },
    } as unknown as Request,
    wasBodyRead: () => bodyRead,
  };
}

before(() => {
  clearAffiliatesFoundation();
  clearMembershipsFoundation();
});

describe("public webhook errors are generic", { concurrency: false }, () => {
  const handlers = [
    ["Finance", financeWebhook, context("agency-finance", false, { stripeSecretKey: "sk_test_without_webhook" })],
    ["Ecommerce", ecommerceWebhook, context("ecommerce", true)],
    ["Commercial", commercialWebhook, context("leads-pipeline")],
    ["Affiliates Connect", affiliatesWebhook, context("affiliates", true)],
    ["Memberships", membershipsWebhook, context("memberships", true)],
  ] as const;

  it("uses one retryable missing-configuration contract across all five handlers", async () => {
    for (const [label, handler, ctx] of handlers) {
      const probe = bodyProbeRequest(true);
      const response = await handler(probe.request, ctx as never);
      assert.equal(response.status, 503, `${label} status`);
      assert.equal((await publicError(response)).error, "webhook_unavailable", `${label} error`);
      assert.equal(probe.wasBodyRead(), false, `${label} must reject absent local configuration before body access`);
    }
  });

  it("keeps missing signatures generic, non-retryable and body-free across all five handlers", async () => {
    for (const [label, handler, ctx] of handlers) {
      const probe = bodyProbeRequest(false);
      const response = await handler(probe.request, ctx as never);
      assert.equal(response.status, 400, `${label} status`);
      assert.equal((await publicError(response)).error, "webhook_refused", `${label} error`);
      assert.equal(probe.wasBodyRead(), false, `${label} must reject a missing signature before body access`);
    }
  });

  it("treats a Memberships Stripe port without a webhook secret as unavailable", async () => {
    registerMembershipsFoundation({
      tenant: {} as never,
      user: {} as never,
      activity: {} as never,
      events: {} as never,
      pluginInstalls: {} as never,
      stripeFor: () => ({ verifyWebhookSignature: async () => null } as never),
      stripeWebhookAvailable: () => false,
    });
    try {
      const probe = bodyProbeRequest(true);
      const response = await membershipsWebhook(probe.request, context("memberships-secretless", true) as never);
      assert.equal(response.status, 503);
      assert.equal((await publicError(response)).error, "webhook_unavailable");
      assert.equal(probe.wasBodyRead(), false);
    } finally {
      clearMembershipsFoundation();
    }
  });

  it("keeps invalid signatures generic and non-retryable with local configured verifiers", async () => {
    const secretConfig = { stripeSecretKey: "sk_test_hermetic", stripeWebhookSecret: "whsec_hermetic" };
    const commercialCtx = context("leads-pipeline-configured");
    const connection = saveIntegrationConnection({
      agencyId: commercialCtx.agencyId,
      provider: "stripe",
      label: "Hermetic invalid-signature fixture",
      values: { secretKey: "sk_test_hermetic", webhookSecret: "whsec_hermetic" },
      actorUserId: "test-actor",
    });
    activateIntegrationConnection({
      agencyId: commercialCtx.agencyId,
      connectionId: connection.id,
      actorUserId: "test-actor",
      allowUntested: true,
    });

    registerAffiliatesFoundation({
      tenant: {} as never,
      user: {} as never,
      activity: {} as never,
      events: {} as never,
      pluginInstalls: {} as never,
      ecommerceOrders: {} as never,
      stripeConnectFor: () => ({ verifyWebhookSignature: async () => false } as never),
    });
    registerMembershipsFoundation({
      tenant: {} as never,
      user: {} as never,
      activity: {} as never,
      events: {} as never,
      pluginInstalls: {} as never,
      stripeFor: () => ({ verifyWebhookSignature: async () => null } as never),
      stripeWebhookAvailable: () => true,
    });

    const configured = [
      ["Finance", financeWebhook, context("agency-finance-configured", false, secretConfig)],
      ["Ecommerce", ecommerceWebhook, context("ecommerce-configured", true, secretConfig)],
      ["Commercial", commercialWebhook, commercialCtx],
      ["Affiliates Connect", affiliatesWebhook, context("affiliates-configured", true)],
      ["Memberships", membershipsWebhook, context("memberships-configured", true)],
    ] as const;
    try {
      for (const [label, handler, ctx] of configured) {
        const response = await handler(signedLookingRequest(), ctx as never);
        assert.equal(response.status, 400, `${label} status`);
        assert.equal((await publicError(response)).error, "webhook_refused", `${label} error`);
      }
    } finally {
      clearAffiliatesFoundation();
      clearMembershipsFoundation();
    }
  });

  it("contains Affiliates verifier resolution and invocation throws", async () => {
    const sensitive = "provider echoed whsec_affiliates_sensitive for client_secret_scope";
    const logs: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logs.push(args); };
    try {
      for (const mode of ["resolution", "invocation"] as const) {
        registerAffiliatesFoundation({
          tenant: {} as never,
          user: {} as never,
          activity: {} as never,
          events: {} as never,
          pluginInstalls: {} as never,
          ecommerceOrders: {} as never,
          stripeConnectFor: () => {
            if (mode === "resolution") throw new Error(sensitive);
            return {
              verifyWebhookSignature: async () => { throw new Error(sensitive); },
            } as never;
          },
        });
        const response = await affiliatesWebhook(signedLookingRequest(), context(`affiliates-${mode}`, true) as never);
        assert.equal(response.status, 503, `${mode} status`);
        assert.equal((await publicError(response)).error, "webhook_processing_failed", `${mode} error`);
      }
    } finally {
      clearAffiliatesFoundation();
      console.error = original;
    }
    assert.doesNotMatch(JSON.stringify(logs), /whsec_affiliates_sensitive|client_secret_scope|message|stack|cause/i);
  });

  it("contains Commercial storage/domain throws after signature verification", async () => {
    const ctx = context("leads-pipeline-mutation-throw");
    const webhookSecret = "whsec_commercial_hermetic";
    const connection = saveIntegrationConnection({
      agencyId: ctx.agencyId,
      provider: "stripe",
      label: "Hermetic mutation-throw fixture",
      values: { secretKey: "sk_test_commercial_hermetic", webhookSecret },
      actorUserId: "test-actor",
    });
    activateIntegrationConnection({
      agencyId: ctx.agencyId,
      connectionId: connection.id,
      actorUserId: "test-actor",
      allowUntested: true,
    });
    const sensitive = "storage leaked tenant_client_secret and provider response";
    ctx.storage = {
      get: async () => { throw new Error(sensitive); },
    } as never;
    const rawBody = JSON.stringify({
      id: "evt_commercial_mutation_throw",
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_commercial_mutation_throw",
        amount_total: 1_200,
        mode: "payment",
        metadata: { agencyId: ctx.agencyId, partyKind: "lead", partyId: "lead_mutation_throw" },
      } },
    });
    const logs: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logs.push(args); };
    let response: Response;
    try {
      response = await commercialWebhook(signedStripeRequest(rawBody, webhookSecret), ctx as never);
    } finally {
      console.error = original;
    }
    assert.equal(response.status, 500);
    assert.equal((await publicError(response)).error, "webhook_processing_failed");
    assert.doesNotMatch(JSON.stringify(logs), /tenant_client_secret|provider response|message|stack|cause/i);
  });

  it("contains Commercial vault/decryption failures before body access", async () => {
    const ctx = context("leads-pipeline-vault-throw");
    const priorVaultKey = process.env.PORTAL_VAULT_ENCRYPTION_KEY;
    const original = console.error;
    const logs: unknown[][] = [];
    let rawResolverMessage = "";
    try {
      process.env.PORTAL_VAULT_ENCRYPTION_KEY = "commercial-webhook-original-vault-key-at-least-32-chars";
      const connection = saveIntegrationConnection({
        agencyId: ctx.agencyId,
        provider: "stripe",
        label: "Hermetic wrong-vault fixture",
        values: {
          secretKey: "sk_test_commercial_wrong_vault",
          webhookSecret: "whsec_commercial_wrong_vault",
        },
        actorUserId: "test-actor",
      });
      activateIntegrationConnection({
        agencyId: ctx.agencyId,
        connectionId: connection.id,
        actorUserId: "test-actor",
        allowUntested: true,
      });
      process.env.PORTAL_VAULT_ENCRYPTION_KEY = "commercial-webhook-different-vault-key-at-least-32-chars";
      try {
        resolveIntegrationValues(ctx.agencyId, "stripe");
        assert.fail("wrong vault key should make the active connection unreadable");
      } catch (error) {
        rawResolverMessage = error instanceof Error ? error.message : String(error);
      }
      assert.ok(rawResolverMessage, "fixture did not capture the real resolver error");

      const unsigned = bodyProbeRequest(false);
      const unsignedResponse = await commercialWebhook(unsigned.request, ctx as never);
      assert.equal(unsignedResponse.status, 400, "missing signature must win over the broken vault");
      assert.equal((await publicError(unsignedResponse)).error, "webhook_refused");
      assert.equal(unsigned.wasBodyRead(), false);

      console.error = (...args: unknown[]) => { logs.push(args); };
      const signed = bodyProbeRequest(true);
      const response = await commercialWebhook(signed.request, ctx as never);
      assert.equal(response.status, 503);
      assert.equal((await publicError(response)).error, "webhook_unavailable");
      assert.equal(signed.wasBodyRead(), false, "resolver failure must return before webhook body access");
    } finally {
      console.error = original;
      if (priorVaultKey === undefined) delete process.env.PORTAL_VAULT_ENCRYPTION_KEY;
      else process.env.PORTAL_VAULT_ENCRYPTION_KEY = priorVaultKey;
    }
    const serializedLogs = JSON.stringify(logs);
    assert.doesNotMatch(serializedLogs, new RegExp(rawResolverMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(serializedLogs, /wrong_vault|commercial-webhook-(?:original|different)-vault-key|message|stack|cause/i);
  });

  it("keeps dispatcher flush-failure logging to fixed vocabulary", () => {
    const sensitiveName = "ProviderFlushSecretName";
    const sensitive = "flush exposed tenant secret and provider response";
    const error = new Error(sensitive);
    let mutableFieldReads = 0;
    for (const field of ["name", "message", "stack", "cause"] as const) {
      Object.defineProperty(error, field, {
        configurable: true,
        get() {
          mutableFieldReads += 1;
          return field === "cause" ? new Error(sensitive) : sensitiveName;
        },
      });
    }
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      logPluginDispatcherFlushFailure(error);
    } finally {
      console.error = original;
    }
    assert.deepEqual(logged, [[
      "[plugin-dispatcher] persistence failed",
      { failureCategory: "operational_error" },
    ]]);
    assert.equal(mutableFieldReads, 0);
    assert.doesNotMatch(JSON.stringify(logged), /ProviderFlushSecretName|tenant secret|provider response|message|stack|cause/i);

    const dispatcher = readFileSync("src/app/api/portal/[module]/[...rest]/route.ts", "utf8");
    const flushCatch = dispatcher.slice(dispatcher.indexOf("await flushPendingWrites();"), dispatcher.indexOf("return response;"));
    assert.match(flushCatch, /catch \(error\)[\s\S]*logPluginDispatcherFlushFailure\(error\)/);
    assert.doesNotMatch(flushCatch, /error\.(?:name|message|stack|cause)|console\.error/);
  });

  it("logs only a fixed failure category, never mutable Error fields", () => {
    const sensitiveName = "TenantSecretFailureName";
    const sensitiveMessage = "provider echoed sk_test_sensitive";
    const error = new Error(sensitiveMessage);
    let nameReads = 0;
    Object.defineProperty(error, "name", {
      configurable: true,
      get() {
        nameReads += 1;
        return sensitiveName;
      },
    });
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      publicWebhookUnavailable("stripe-finance", "configuration", error);
      publicWebhookProcessingFailed("stripe-memberships", "apply", error);
      publicWebhookProcessingFailed("stripe-ecommerce", "apply", {
        name: sensitiveName,
        message: sensitiveMessage,
        stack: sensitiveMessage,
      });
    } finally {
      console.error = original;
    }

    assert.deepEqual(
      logged.map(entry => entry[1]),
      [
        { failureCategory: "operational_error" },
        { failureCategory: "operational_error" },
        { failureCategory: "non_error" },
      ],
    );
    assert.equal(nameReads, 0, "logging must not read mutable Error.name");
    const serialized = JSON.stringify(logged);
    assert.doesNotMatch(serialized, new RegExp(sensitiveName));
    assert.doesNotMatch(serialized, /sk_test_sensitive|message|stack|failureClass/);
  });
});
