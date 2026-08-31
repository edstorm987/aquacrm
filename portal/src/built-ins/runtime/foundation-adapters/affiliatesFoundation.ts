import "server-only";
// Affiliates plugin foundation registration.
//
// Cross-plugin port: `ecommerceOrders.getOrder(...)` reads from the
// ecommerce plugin's container and projects to AffiliateOrderProjection.
// See `_crossPluginPorts.ts` for the projection shape.
//
// `stripeConnectFor({ agencyId, clientId })` returns a real Stripe Connect
// driver built from the per-install Stripe keys carried on the **ecommerce**
// install in that same scope — one Stripe account per client, one place to
// configure it, exactly as memberships resolves its billing keys. The keys are
// read through `installConfigWithSecrets`, i.e. out of the encrypted
// integrations vault, never off the browser-visible `install.config` alone.
//
// When there is no enabled ecommerce install in that scope, or it carries no
// secret key, the factory returns **null**. That null is the honest answer:
// `isStripeConnectAvailable()` then reports false, the mounted "Set up payouts
// via Stripe" and "Process via Stripe" controls say so instead of offering an
// action that can only 422, and manual mark-paid stays the supported route.

import { registerAffiliatesFoundation } from "@aqua/plugin-affiliates/server";
import type { StripeConnectPort } from "@aqua/plugin-affiliates/server";
import { tryReadStripeKeysFromInstall } from "@aqua/plugin-ecommerce/lib/stripe/server";
import type { StripeKeys } from "@aqua/plugin-ecommerce/lib/stripe/server";
import { installConfigWithSecrets } from "@/lib/server/plugins/pluginSecretConfig";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";
import { ecommerceOrdersPortForAffiliates } from "./_crossPluginPorts";
import {
  makeAffiliatesStripeConnectPort,
  type StripeConnectClientLike,
} from "./_affiliatesStripeConnectAdapter";

// Affiliate payouts ride the client's own Stripe account — the same platform
// key that takes the customer's money sends the affiliate's commission.
const ECOMMERCE_PLUGIN_ID = "ecommerce";

/**
 * The Stripe keys affiliates would use for this scope, or null when the client
 * has no configured Stripe.
 *
 * Exported so a caller (and the smoke tests) can ask the same question the
 * factory asks, without constructing a driver.
 */
export function affiliatesStripeConnectKeysFor(args: {
  agencyId: string;
  clientId: string;
}): StripeKeys | null {
  const install = pluginInstallStorePort.getInstall(
    { agencyId: args.agencyId, clientId: args.clientId },
    ECOMMERCE_PLUGIN_ID,
  );
  if (!install || !install.enabled) return null;
  const config = installConfigWithSecrets(
    ECOMMERCE_PLUGIN_ID,
    { agencyId: args.agencyId, clientId: args.clientId },
    install.config,
  );
  return tryReadStripeKeysFromInstall(config);
}

/**
 * The registered factory, exported for tests: given a scope (and optionally an
 * injected SDK client), either a real `StripeConnectPort` or null.
 */
export function affiliatesStripeConnectFor(
  args: { agencyId: string; clientId: string },
  injectedClient?: StripeConnectClientLike,
): StripeConnectPort | null {
  const keys = affiliatesStripeConnectKeysFor(args);
  if (!keys) return null;
  return makeAffiliatesStripeConnectPort(keys, injectedClient);
}

let registered = false;

export function ensureAffiliatesFoundationRegistered(): void {
  if (registered) return;
  registerAffiliatesFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    ecommerceOrders: ecommerceOrdersPortForAffiliates,
    // NOT cast away: the Connect factory is the one port whose shape this file
    // owns end to end, so tsc checks it here rather than trusting a blanket
    // `as unknown as`. The surrounding cast still bridges the shared ports,
    // whose plugin-vendored union types are only structurally compatible.
    stripeConnectFor(args: { agencyId: string; clientId: string }): StripeConnectPort | null {
      return affiliatesStripeConnectFor(args);
    },
    // A secret key alone buys onboarding, not settlement. `transfer.paid` is
    // the ONLY route a payout has to `completed`, and it arrives by webhook —
    // so with no webhook secret to verify against, an automated transfer would
    // really move the affiliate's money and then strand the payout in
    // `in_progress` with no control left to finish it. Report that honestly
    // instead, and let manual mark-paid carry the scope.
    stripeConnectTransferReady(args: { agencyId: string; clientId: string }): boolean {
      return Boolean(affiliatesStripeConnectKeysFor(args)?.webhookSecret);
    },
  } as unknown as Parameters<typeof registerAffiliatesFoundation>[0]);
  registered = true;
}

ensureAffiliatesFoundationRegistered();
