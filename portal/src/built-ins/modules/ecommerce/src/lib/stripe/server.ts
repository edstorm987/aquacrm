// Server-only Stripe client.
//
// Lifted from `02 felicias aqua portal work/src/lib/stripe/server.ts`
// and refactored to take API keys per call (or via a small Stripe
// container) instead of reading `process.env`. Per-install config:
//
//   install.config = {
//     stripeSecretKey: "sk_test_…",
//     stripeWebhookSecret: "whsec_…",
//     ...
//   }
//
// The plugin manifest's setup wizard collects these on first install.

import "server-only";

export interface StripeKeys {
  secretKey: string;
  webhookSecret?: string;
}

export interface StripeLineItem {
  name: string;
  description?: string;
  amount: number;     // pence (£12.50 → 1250)
  currency: "gbp" | "usd" | "eur";
  quantity: number;
  images?: string[];
}

export interface CheckoutSessionInput {
  lineItems: StripeLineItem[];
  customerEmail?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  discountAmount?: number;       // pence
  idempotencyKey: string;
  expiresAt: number;
  collectShippingAddress?: boolean;
  allowedShippingCountries?: string[];
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

// Per-key cache so we don't re-construct Stripe clients for every call.
const _stripeCache = new Map<string, unknown>();

async function getStripe(secretKey: string): Promise<unknown> {
  if (!secretKey) throw new Error("Stripe secret key required.");
  const cached = _stripeCache.get(secretKey);
  if (cached) return cached;
  // Dynamic import so a missing `stripe` package doesn't crash the build.
  // `stripe` is an optional peer dep; the foundation install adds it when
  // an agency configures Stripe. The dynamic-string specifier keeps tsc
  // from resolving the module at typecheck — it's resolved at runtime.
  const stripeSpec = "stripe";
  const mod = await (
    new Function("s", "return import(s)") as (s: string) => Promise<unknown>
  )(stripeSpec).catch(() => null);
  if (!mod) throw new Error("The `stripe` package is not installed. Run: npm i stripe");
  const Stripe = (mod as { default: new (k: string, opts: { apiVersion: string }) => unknown }).default;
  const client = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
  _stripeCache.set(secretKey, client);
  return client;
}

export async function createCheckoutSession(
  keys: StripeKeys,
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = (await getStripe(keys.secretKey)) as any;

  const params: Record<string, unknown> = {
    mode: "payment",
    line_items: input.lineItems.map(li => ({
      quantity: li.quantity,
      price_data: {
        currency: li.currency,
        unit_amount: li.amount,
        product_data: {
          name: li.name,
          description: li.description,
          images: li.images && li.images.length > 0 ? li.images : undefined,
        },
      },
    })),
    customer_email: input.customerEmail,
    metadata: input.metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Tax and shipping have already been resolved and snapshotted by the
    // authoritative checkout service. Provider-side repricing would make the
    // final total impossible for the webhook to verify exactly.
    automatic_tax: { enabled: false },
    shipping_address_collection: input.collectShippingAddress
      ? { allowed_countries: input.allowedShippingCountries ?? [] }
      : undefined,
    phone_number_collection: { enabled: true },
    allow_promotion_codes: false,
    expires_at: Math.floor(input.expiresAt / 1000),
  };

  if (input.discountAmount && input.discountAmount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: input.discountAmount,
      currency: input.lineItems[0]?.currency ?? "gbp",
      duration: "once",
      name: "Cart discount",
    });
    params.discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: input.idempotencyKey,
  });
  return { id: session.id as string, url: session.url as string };
}

// Verify and parse an incoming webhook. Throws on signature mismatch.
export async function constructWebhookEvent(
  keys: StripeKeys,
  rawBody: string,
  signature: string,
): Promise<unknown> {
  if (!keys.webhookSecret) throw new Error("Stripe webhook secret not configured.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = (await getStripe(keys.secretKey)) as any;
  return stripe.webhooks.constructEvent(rawBody, signature, keys.webhookSecret);
}

// ── Billing portal ────────────────────────────────────────────────────────

export interface BillingPortalInput {
  customerId?: string;
  customerEmail?: string;
  returnUrl: string;
}

export interface BillingPortalResult {
  url: string;
}

export async function createBillingPortalSession(
  keys: StripeKeys,
  input: BillingPortalInput,
): Promise<BillingPortalResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = (await getStripe(keys.secretKey)) as any;

  let customerId = input.customerId;
  if (!customerId) {
    if (!input.customerEmail) {
      throw new Error("billing-portal: provide customerId or customerEmail");
    }
    const list = await stripe.customers.list({ email: input.customerEmail, limit: 1 });
    if (!list.data?.length) {
      throw new Error(`No Stripe customer found for ${input.customerEmail}`);
    }
    customerId = list.data[0].id as string;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: input.returnUrl,
  });
  return { url: session.url as string };
}

// Read the Stripe keys off a plugin install.config payload.
export interface InstallStripeConfig {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  defaultCurrency?: "gbp" | "usd" | "eur";
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * The Stripe keys on an install's *effective* config, or **null** when there
 * is no usable secret key.
 *
 * Null — not a throw, and never a stub — is what lets a caller ask "does this
 * client actually have Stripe?" honestly. `readStripeKeysFromInstall` is the
 * throwing variant for call sites that are already inside a Stripe operation.
 *
 * This is the canonical reader for the per-install Stripe keys the ecommerce
 * setup wizard collects. Anything that needs those keys for another plugin in
 * the same (agencyId, clientId) scope — memberships' billing, the affiliates
 * Connect driver — reads them from here rather than re-deriving the shape.
 * (`_membershipsStripeAdapter.readMembershipsStripeKeys` still carries its own
 * copy; converging it is a follow-up, not this change.)
 */
export function tryReadStripeKeysFromInstall(
  config: Record<string, unknown> | null | undefined,
): StripeKeys | null {
  const c = (config ?? {}) as InstallStripeConfig;
  const secretKey = typeof c.stripeSecretKey === "string" ? c.stripeSecretKey.trim() : "";
  if (!secretKey) return null;
  const webhookSecret = typeof c.stripeWebhookSecret === "string" ? c.stripeWebhookSecret.trim() : "";
  return {
    secretKey,
    webhookSecret: webhookSecret.length > 0 ? webhookSecret : undefined,
  };
}

export function readStripeKeysFromInstall(config: Record<string, unknown>): StripeKeys {
  const keys = tryReadStripeKeysFromInstall(config);
  if (!keys) {
    throw new Error("Stripe secret key not configured for this install. See plugin settings.");
  }
  return keys;
}
