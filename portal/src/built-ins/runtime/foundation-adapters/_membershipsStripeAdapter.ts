import "server-only";
// Real `StripePort` implementation for the memberships plugin.
//
// The memberships package deliberately does NOT import the Stripe SDK — it
// declares `StripePort` (`memberships/src/server/ports.ts`) and lets the
// foundation supply a concrete client built from the per-install keys carried
// on the **ecommerce** install (memberships `requires: ["ecommerce"]`).
//
// This file is that concrete client. It is a per-plugin wrapper, vendored the
// way this codebase vendors Stripe utilities — see
// `docs/workspace/hazards-and-duplication.md` — mirroring the proven pattern in
// `agency-finance/src/lib/stripe.ts`: a narrow `StripeClientLike` slice of the
// SDK plus an INJECTABLE client, so the mapping between the port's shapes and
// the SDK's is unit-testable without keys or a network.
//
// SAFETY: the keys are the agency's own, read from the encrypted integrations
// vault via `installConfigWithSecrets` — never hardcoded, never logged, never
// read off the browser-visible `install.config` alone.

import type {
  StripeBillingPortalInput,
  StripeBillingPortalSession,
  StripeCheckoutSession,
  StripeCheckoutSessionInput,
  StripeCustomer,
  StripeCustomerInput,
  StripePort,
  StripePrice,
  StripePriceInput,
  StripeSubscription,
  StripeSubscriptionInput,
  StripeWebhookEvent,
} from "@aqua/plugin-memberships/server";

export interface MembershipsStripeKeys {
  secretKey: string;
  webhookSecret?: string;
}

// ─── The slice of the SDK this adapter actually uses ─────────────────────
//
// Tests pass a fake implementing just these; production passes the real
// `Stripe` instance, which is structurally compatible.

interface RawStripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  pause_collection?: unknown;
  current_period_end?: number;
  trial_end?: number | null;
  metadata?: Record<string, string>;
  items?: { data?: { id?: string; price?: { id: string }; current_period_end?: number }[] };
}

interface RawStripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
}

type CallOptions = { idempotencyKey?: string };

export interface StripeClientLike {
  customers: {
    create(params: Record<string, unknown>, options?: CallOptions): Promise<{ id: string; email?: string | null }>;
    retrieve(id: string): Promise<{ id: string; email?: string | null; deleted?: boolean } | null>;
  };
  subscriptions: {
    create(params: Record<string, unknown>, options?: CallOptions): Promise<RawStripeSubscription>;
    retrieve(id: string): Promise<RawStripeSubscription | null>;
    update(id: string, params: Record<string, unknown>, options?: CallOptions): Promise<RawStripeSubscription>;
    cancel(id: string, params?: Record<string, unknown>, options?: CallOptions): Promise<RawStripeSubscription>;
  };
  checkout: {
    sessions: {
      create(params: Record<string, unknown>, options?: CallOptions): Promise<{
        id: string;
        url: string | null;
        expires_at?: number;
      }>;
    };
  };
  billingPortal: {
    sessions: { create(params: Record<string, unknown>): Promise<{ id: string; url: string }> };
  };
  prices: {
    create(
      params: Record<string, unknown>,
      options?: CallOptions,
    ): Promise<{ id: string; product: string | { id: string } }>;
  };
  webhooks: {
    constructEvent(rawBody: string, signature: string, secret: string): RawStripeEvent;
  };
}

// Per-key cache so we don't rebuild the client on every request.
const _clientCache = new Map<string, StripeClientLike>();

export async function getMembershipsStripeClient(
  secretKey: string,
  injected?: StripeClientLike,
): Promise<StripeClientLike> {
  if (injected) return injected;
  if (!secretKey) throw new Error("Stripe secret key required.");
  const cached = _clientCache.get(secretKey);
  if (cached) return cached;
  // Dynamic-string import so tsc doesn't resolve `stripe` at build time (it is
  // an optional peer dep, present only once an agency configures Stripe).
  const mod = await (
    new Function("s", "return import(s)") as (s: string) => Promise<unknown>
  )("stripe").catch(() => null);
  if (!mod) throw new Error("The `stripe` package is not installed. Run: npm i stripe");
  const Stripe = (mod as { default: new (k: string, o: { apiVersion: string }) => StripeClientLike }).default;
  const client = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
  _clientCache.set(secretKey, client);
  return client;
}

/**
 * Stripe keys off an ecommerce install's *effective* config (vault merged in).
 *
 * Returns null — not a throwing stub — when no secret key is present. Null is
 * what makes `isStripeAvailable()` honest: an install without keys reports
 * unavailable instead of passing a guard and failing three calls later.
 */
export function readMembershipsStripeKeys(
  config: Record<string, unknown> | null | undefined,
): MembershipsStripeKeys | null {
  const secretKey = config?.stripeSecretKey;
  if (typeof secretKey !== "string" || secretKey.trim().length === 0) return null;
  const webhookSecret = config?.stripeWebhookSecret;
  return {
    secretKey: secretKey.trim(),
    webhookSecret:
      typeof webhookSecret === "string" && webhookSecret.trim().length > 0
        ? webhookSecret.trim()
        : undefined,
  };
}

function subscriptionFromRaw(raw: RawStripeSubscription): StripeSubscription {
  const items = raw.items?.data ?? [];
  // `current_period_end` moved onto the subscription ITEM in recent API
  // versions; read whichever the account's version returns.
  const periodEnd =
    typeof raw.current_period_end === "number"
      ? raw.current_period_end
      : items.find(item => typeof item.current_period_end === "number")?.current_period_end;
  return {
    id: raw.id,
    customerId: typeof raw.customer === "string" ? raw.customer : (raw.customer?.id ?? ""),
    status: raw.status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
    collectionPaused: Boolean(raw.pause_collection),
    trialEnd: typeof raw.trial_end === "number" ? raw.trial_end : undefined,
    metadata: raw.metadata,
    items: items
      .map(item => item.price?.id)
      .filter((id): id is string => typeof id === "string")
      .map(priceId => ({ priceId })),
  };
}

/**
 * Build the concrete `StripePort` for one set of per-install keys.
 *
 * Every method resolves the SDK client lazily, so constructing the port is
 * synchronous — the memberships container builder needs it that way — while the
 * dynamic `stripe` import stays inside the async call.
 */
export function makeMembershipsStripePort(
  keys: MembershipsStripeKeys,
  injected?: StripeClientLike,
): StripePort {
  const client = (): Promise<StripeClientLike> => getMembershipsStripeClient(keys.secretKey, injected);

  return {
    async createCustomer(input: StripeCustomerInput): Promise<StripeCustomer> {
      const stripe = await client();
      const customer = await stripe.customers.create(
        { email: input.email, name: input.name, metadata: input.metadata },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return { id: customer.id, email: customer.email ?? undefined };
    },

    async retrieveCustomer(id: string): Promise<StripeCustomer | null> {
      const stripe = await client();
      const customer = await stripe.customers.retrieve(id).catch(() => null);
      if (!customer || customer.deleted) return null;
      return { id: customer.id, email: customer.email ?? undefined };
    },

    async createSubscription(input: StripeSubscriptionInput): Promise<StripeSubscription> {
      const stripe = await client();
      const raw = await stripe.subscriptions.create({
        customer: input.customerId,
        items: [{ price: input.priceId }],
        trial_period_days: input.trialDays && input.trialDays > 0 ? input.trialDays : undefined,
        metadata: input.metadata,
      });
      return subscriptionFromRaw(raw);
    },

    async cancelSubscription(
      id: string,
      atPeriodEnd: boolean,
      idempotencyKey?: string,
    ): Promise<StripeSubscription> {
      const stripe = await client();
      const options = idempotencyKey ? { idempotencyKey } : undefined;
      const raw = atPeriodEnd
        ? await stripe.subscriptions.update(id, { cancel_at_period_end: true }, options)
        : await stripe.subscriptions.cancel(id, undefined, options);
      return subscriptionFromRaw(raw);
    },

    async retrieveSubscription(id: string): Promise<StripeSubscription | null> {
      const stripe = await client();
      const raw = await stripe.subscriptions.retrieve(id).catch(() => null);
      return raw ? subscriptionFromRaw(raw) : null;
    },

    async pauseSubscription(id: string): Promise<StripeSubscription> {
      const stripe = await client();
      const raw = await stripe.subscriptions.update(id, {
        pause_collection: { behavior: "void" },
      });
      return subscriptionFromRaw(raw);
    },

    async resumeSubscription(id: string): Promise<StripeSubscription> {
      const stripe = await client();
      // Resume both meanings exposed by the service: paused collection and a
      // period-end cancellation the member chose to undo.
      const raw = await stripe.subscriptions.update(id, {
        pause_collection: null,
        cancel_at_period_end: false,
      });
      return subscriptionFromRaw(raw);
    },

    async changeSubscriptionPlan(args: {
      id: string;
      newPriceId: string;
      metadata: Record<string, string>;
      idempotencyKey?: string;
    }): Promise<StripeSubscription> {
      const stripe = await client();
      const current = await stripe.subscriptions.retrieve(args.id);
      if (!current) throw new Error(`Stripe subscription ${args.id} not found.`);
      const itemId = current.items?.data?.[0]?.id;
      if (!itemId) throw new Error(`Stripe subscription ${args.id} has no items to re-price.`);
      const raw = await stripe.subscriptions.update(
        args.id,
        {
          items: [{ id: itemId, price: args.newPriceId }],
          proration_behavior: "create_prorations",
          metadata: args.metadata,
        },
        args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
      );
      return subscriptionFromRaw(raw);
    },

    async createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
      const stripe = await client();
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          line_items: [{ price: input.priceId, quantity: 1 }],
          // Stripe rejects `customer` and `customer_email` together.
          customer: input.customerId,
          customer_email: input.customerId ? undefined : input.customerEmail,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: input.metadata,
          subscription_data: {
            metadata: input.metadata,
            trial_period_days: input.trialDays && input.trialDays > 0 ? input.trialDays : undefined,
          },
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      if (!session.url) throw new Error("Stripe did not return a checkout URL.");
      return {
        id: session.id,
        url: session.url,
        ...(typeof session.expires_at === "number" ? { expiresAt: session.expires_at } : {}),
      };
    },

    async createBillingPortalSession(
      input: StripeBillingPortalInput,
    ): Promise<StripeBillingPortalSession> {
      const stripe = await client();
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      });
      return { id: session.id, url: session.url };
    },

    async createPrice(input: StripePriceInput): Promise<StripePrice> {
      const stripe = await client();
      const productParams =
        typeof input.product === "string"
          ? { product: input.product }
          : {
              product_data: {
                name: input.product.name,
                description: input.product.description,
              },
            };
      const price = await stripe.prices.create(
        {
          ...productParams,
          unit_amount: input.unitAmount,
          currency: input.currency,
          recurring: { interval: input.recurring.interval },
          metadata: input.metadata,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return {
        id: price.id,
        productId: typeof price.product === "string" ? price.product : (price.product?.id ?? ""),
      };
    },

    async verifyWebhookSignature(args: {
      rawBody: string;
      signatureHeader: string;
    }): Promise<StripeWebhookEvent | null> {
      // No webhook secret configured → we cannot prove the payload came from
      // Stripe, so it does not verify. Never "trust it anyway".
      if (!keys.webhookSecret) return null;
      const stripe = await client();
      try {
        const event = stripe.webhooks.constructEvent(
          args.rawBody,
          args.signatureHeader,
          keys.webhookSecret,
        );
        return {
          id: event.id,
          type: event.type,
          data: { object: event.data?.object ?? {} },
          created: event.created,
        };
      } catch {
        return null;
      }
    },
  };
}
