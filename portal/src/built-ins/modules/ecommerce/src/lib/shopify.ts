// Shopify Storefront API wrapper.
//
// Lifted from `02 felicias aqua portal work/src/lib/shopify.ts` and
// generalised: domain + access token come from per-install config rather
// than env vars (since each client may connect to a different Shopify store).

import { withRemoteOperationDeadline, type RemoteOperationOutcome } from "@/lib/server/remoteOperation";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";
import { brokeredFetch } from "@/lib/server/net/outboundBroker";

export interface ShopifyConfig {
  domain: string;                // e.g. "luvandker.myshopify.com"
  storefrontAccessToken: string;
  /** Tenant scope for the egress broker's audit trail + destination policy. */
  agencyId?: string;
}

export interface ShopifyRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  outcome?: RemoteOperationOutcome;
}

export async function shopifyFetch<T>(
  config: ShopifyConfig,
  args: { query: string; variables?: Record<string, unknown> },
  options: ShopifyRequestOptions = {},
): Promise<{ status: number; body: T }> {
  if (!config.domain || !config.storefrontAccessToken) {
    throw new Error("shopifyFetch: domain and storefrontAccessToken required.");
  }
  assertLiveProviderAccess("Shopify Storefront");
  const endpoint = `https://${config.domain}/api/2024-01/graphql.json`;
  const { result, body } = await withRemoteOperationDeadline({
    operation: "Shopify Storefront request",
    budget: options.outcome === "read" || (!options.outcome && !isGraphqlMutation(args.query))
      ? "providerRead"
      : "providerWrite",
    outcome: options.outcome ?? (isGraphqlMutation(args.query) ? "non-idempotent-write" : "read"),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  }, async () => {
    // Through the audited egress broker (assume-breach containment, Phase 0-D
    // completion): `config.domain` is per-install TENANT DATA — re-pointing it
    // at a private/loopback/metadata address would exfiltrate the storefront
    // token and reach the internal network. The broker rejects unsafe
    // destinations, pins the vetted address against DNS rebinding, and never
    // forwards the token across an origin-changing redirect.
    const response = await brokeredFetch({
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": config.storefrontAccessToken,
      },
      body: JSON.stringify({
        ...(args.query && { query: args.query }),
        ...(args.variables && { variables: args.variables }),
      }),
      timeoutMs: options.timeoutMs ?? 15_000,
      tenantId: config.agencyId,
      purpose: "shopify.storefront",
    });
    const body = JSON.parse(response.bodyText || "{}") as { errors?: { message: string }[] } & T;
    return { result: { status: response.status }, body };
  });
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors[0]?.message ?? "Shopify Storefront error");
  }
  return { status: result.status, body: body as T };
}

// Storefront cart create — returns a Shopify-hosted checkout URL the
// customer is redirected to. Useful when an agency wires their client
// to Shopify Checkout instead of Stripe Checkout.
export async function createShopifyCart(
  config: ShopifyConfig,
  options: ShopifyRequestOptions = {},
): Promise<{ id: string; checkoutUrl: string }> {
  const query = /* GraphQL */ `
    mutation cartCreate {
      cartCreate {
        cart { id checkoutUrl }
      }
    }
  `;
  const { body } = await shopifyFetch<{ data: { cartCreate: { cart: { id: string; checkoutUrl: string } } } }>(
    config,
    { query },
    { ...options, outcome: "non-idempotent-write" },
  );
  return body.data.cartCreate.cart;
}

export async function addLineToShopifyCart(
  config: ShopifyConfig,
  cartId: string,
  variantId: string,
  quantity: number,
  options: ShopifyRequestOptions = {},
): Promise<{ id: string; checkoutUrl: string }> {
  const query = /* GraphQL */ `
    mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { id checkoutUrl }
      }
    }
  `;
  const { body } = await shopifyFetch<{ data: { cartLinesAdd: { cart: { id: string; checkoutUrl: string } } } }>(
    config,
    { query, variables: { cartId, lines: [{ merchandiseId: variantId, quantity }] } },
    { ...options, outcome: "non-idempotent-write" },
  );
  return body.data.cartLinesAdd.cart;
}

function isGraphqlMutation(query: string): boolean {
  return /(?:^|\n)\s*mutation\b/i.test(query);
}
