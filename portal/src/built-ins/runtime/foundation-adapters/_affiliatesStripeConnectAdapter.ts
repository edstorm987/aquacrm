import "server-only";
// Real `StripeConnectPort` implementation for the affiliates plugin (R12).
//
// The affiliates package deliberately does NOT import the Stripe SDK — it
// declares `StripeConnectPort` (`affiliates/src/server/ports.ts`) and lets the
// foundation supply a concrete driver built from the per-install keys carried
// on the **ecommerce** install of the same (agencyId, clientId). Until this
// file existed the foundation registered no driver at all, so every Connect
// route (onboard, refresh, webhook, transfer) could only answer 422 while the
// mounted buttons still offered the action.
//
// It is the Connect twin of `_membershipsStripeAdapter.ts`: same shape, same
// injectable-client discipline, different Stripe surface (accounts /
// accountLinks / transfers / webhooks rather than customers / subscriptions).
// The two do not overlap — neither could be expressed as the other — see
// `docs/workspace/hazards-and-duplication.md`.
//
// SAFETY: the keys are the agency's own, read from the encrypted integrations
// vault via `installConfigWithSecrets` — never hardcoded, never logged, never
// read off the browser-visible `install.config` alone.

import { snapshotToStatus } from "@aqua/plugin-affiliates/server";
import type {
  StripeConnectAccountSnapshot,
  StripeConnectPort,
} from "@aqua/plugin-affiliates/server";
import type { StripeKeys } from "@aqua/plugin-ecommerce/lib/stripe/server";

// ─── The slice of the SDK this adapter actually uses ─────────────────────
//
// Tests pass a fake implementing just these; production passes the real
// `Stripe` instance, which is structurally compatible.

interface RawConnectAccount {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { disabled_reason?: string | null } | null;
}

type CallOptions = { idempotencyKey?: string };

export interface StripeConnectClientLike {
  accounts: {
    create(params: Record<string, unknown>, options?: CallOptions): Promise<RawConnectAccount>;
    retrieve(id: string): Promise<RawConnectAccount>;
  };
  accountLinks: {
    create(
      params: Record<string, unknown>,
      options?: CallOptions,
    ): Promise<{ url: string; expires_at: number }>;
  };
  transfers: {
    create(
      params: Record<string, unknown>,
      options?: CallOptions,
    ): Promise<{ id: string; created: number }>;
  };
  webhooks: {
    constructEvent(rawBody: string, signature: string, secret: string): { id: string; type: string };
  };
}

// Per-key cache so we don't rebuild the client on every request.
const _clientCache = new Map<string, StripeConnectClientLike>();

export async function getAffiliatesStripeConnectClient(
  secretKey: string,
  injected?: StripeConnectClientLike,
): Promise<StripeConnectClientLike> {
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
  const Stripe = (mod as {
    default: new (k: string, o: { apiVersion: string }) => StripeConnectClientLike;
  }).default;
  const client = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
  _clientCache.set(secretKey, client);
  return client;
}

function snapshotFromRaw(raw: RawConnectAccount): StripeConnectAccountSnapshot {
  const base = {
    accountId: raw.id,
    chargesEnabled: raw.charges_enabled === true,
    payoutsEnabled: raw.payouts_enabled === true,
    detailsSubmitted: raw.details_submitted === true,
    disabledReason: raw.requirements?.disabled_reason ?? undefined,
  };
  // The plugin owns the triplet → 3-state collapse; re-deriving it here would
  // be a second copy that could drift from the one the webhook path uses.
  return { ...base, onboardingStatus: snapshotToStatus({ ...base, onboardingStatus: "pending" }) };
}

/**
 * Build the concrete `StripeConnectPort` for one set of per-install keys.
 *
 * Every method resolves the SDK client lazily, so constructing the port is
 * synchronous — the affiliates container builder needs it that way — while the
 * dynamic `stripe` import stays inside the async call.
 */
export function makeAffiliatesStripeConnectPort(
  keys: StripeKeys,
  injected?: StripeConnectClientLike,
): StripeConnectPort {
  const client = (): Promise<StripeConnectClientLike> =>
    getAffiliatesStripeConnectClient(keys.secretKey, injected);

  return {
    async createAccount(args): Promise<{ accountId: string }> {
      const stripe = await client();
      // Express: Stripe hosts the onboarding and the affiliate's payout
      // dashboard, which is what the customer-facing panel links to.
      const account = await stripe.accounts.create(
        {
          type: "express",
          email: args.email,
          capabilities: { transfers: { requested: true } },
          metadata: {
            aquaAffiliateId: args.affiliateId,
            aquaAgencyId: args.agencyId,
            aquaClientId: args.clientId,
          },
        },
        // One connected account per affiliate, even if the customer
        // double-clicks: Stripe collapses retries carrying this key.
        { idempotencyKey: `affiliate-account:${args.clientId}:${args.affiliateId}` },
      );
      return { accountId: account.id };
    },

    async createOnboardingLink(args): Promise<{ url: string; expiresAt: number }> {
      const stripe = await client();
      const link = await stripe.accountLinks.create({
        account: args.accountId,
        return_url: args.returnUrl,
        refresh_url: args.refreshUrl,
        type: "account_onboarding",
      });
      // Stripe reports `expires_at` in SECONDS; the port is in milliseconds.
      return { url: link.url, expiresAt: link.expires_at * 1000 };
    },

    async retrieveAccount(accountId): Promise<StripeConnectAccountSnapshot> {
      const stripe = await client();
      const raw = await stripe.accounts.retrieve(accountId);
      return snapshotFromRaw(raw);
    },

    async createTransfer(args): Promise<{ transferId: string; created: number }> {
      const stripe = await client();
      const transfer = await stripe.transfers.create(
        {
          amount: args.amountCents,
          currency: args.currency,
          destination: args.destinationAccountId,
          description: args.description,
          transfer_group: args.transferGroup,
        },
        // Derived from the payout id by the caller — this is what stops a
        // double-click, a retry, or a re-run from paying an affiliate twice.
        { idempotencyKey: args.idempotencyKey },
      );
      // Stripe reports `created` in SECONDS; the port is in milliseconds.
      return { transferId: transfer.id, created: transfer.created * 1000 };
    },

    async verifyWebhookSignature(args): Promise<boolean> {
      // No webhook secret configured, or no signature header → we cannot prove
      // the payload came from Stripe, so it does not verify. Never "trust it
      // anyway": an unverified account.updated would let anyone flip an
      // affiliate to payouts-enabled.
      if (!keys.webhookSecret || !args.signature) return false;
      const stripe = await client();
      try {
        stripe.webhooks.constructEvent(args.rawBody, args.signature, keys.webhookSecret);
        return true;
      } catch {
        return false;
      }
    },
  };
}
