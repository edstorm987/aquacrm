// Shopify Storefront API wrapper.
//
// Lifted from `02 felicias aqua portal work/src/lib/shopify.ts` and
// generalised: domain + access token come from per-install config rather
// than env vars (since each client may connect to a different Shopify store).

export interface ShopifyConfig {
  domain: string;                // e.g. "luvandker.myshopify.com"
  storefrontAccessToken: string;
}

export async function shopifyFetch<T>(
  config: ShopifyConfig,
  args: { query: string; variables?: Record<string, unknown> },
): Promise<{ status: number; body: T }> {
  if (!config.domain || !config.storefrontAccessToken) {
    throw new Error("shopifyFetch: domain and storefrontAccessToken required.");
  }
  const endpoint = `https://${config.domain}/api/2024-01/graphql.json`;
  const result = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": config.storefrontAccessToken,
    },
    body: JSON.stringify({
      ...(args.query && { query: args.query }),
      ...(args.variables && { variables: args.variables }),
    }),
  });
  const body = (await result.json()) as { errors?: { message: string }[] } & T;
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors[0]?.message ?? "Shopify Storefront error");
  }
  return { status: result.status, body: body as T };
}

// Storefront cart create — returns a Shopify-hosted checkout URL the
// customer is redirected to. Useful when an agency wires their client
// to Shopify Checkout instead of Stripe Checkout.
export async function createShopifyCart(config: ShopifyConfig): Promise<{ id: string; checkoutUrl: string }> {
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
  );
  return body.data.cartCreate.cart;
}

export async function addLineToShopifyCart(
  config: ShopifyConfig,
  cartId: string,
  variantId: string,
  quantity: number,
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
  );
  return body.data.cartLinesAdd.cart;
}
