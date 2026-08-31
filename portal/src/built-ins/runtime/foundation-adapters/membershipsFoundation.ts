import "server-only";
// Memberships plugin foundation registration.
//
// `stripeFor({ agencyId, clientId })` returns a real Stripe client built from
// the per-install Stripe keys carried on the **ecommerce** install (memberships
// `requires: ["ecommerce"]`). The keys are read through
// `installConfigWithSecrets`, i.e. out of the encrypted integrations vault —
// never off the browser-visible `install.config` alone.
//
// When there is no enabled ecommerce install in that scope, or it carries no
// secret key, the factory returns **null**. That null is the honest answer:
// `isStripeAvailable()` then reports false and paid-plan flows return 422 with
// a clear "Stripe not configured" message, instead of passing a guard against a
// stub that would have thrown three calls later.

import { registerMembershipsFoundation } from "@aqua/plugin-memberships/server";
import type { StripePort } from "@aqua/plugin-memberships/server";
import { installConfigWithSecrets } from "@/lib/server/plugins/pluginSecretConfig";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";
import {
  makeMembershipsStripePort,
  readMembershipsStripeKeys,
  type MembershipsStripeKeys,
  type StripeClientLike,
} from "./_membershipsStripeAdapter";

// Memberships' Stripe keys are the ecommerce install's keys, in the same
// (agencyId, clientId) scope. One Stripe account per client, one place to
// configure it — never a second key store.
const ECOMMERCE_PLUGIN_ID = "ecommerce";

/**
 * The Stripe keys memberships would use for this scope, or null when the
 * client has no configured Stripe.
 *
 * Exported so a caller (and the smoke tests) can ask the same question the
 * factory asks, without constructing a client.
 */
export function membershipsStripeKeysFor(args: {
  agencyId: string;
  clientId: string;
}): MembershipsStripeKeys | null {
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
  return readMembershipsStripeKeys(config);
}

/**
 * The registered factory, exported for tests: given a scope (and optionally an
 * injected SDK client), either a real `StripePort` or null.
 */
export function membershipsStripeFor(
  args: { agencyId: string; clientId: string },
  injectedClient?: StripeClientLike,
): StripePort | null {
  const keys = membershipsStripeKeysFor(args);
  if (!keys) return null;
  return makeMembershipsStripePort(keys, injectedClient);
}

let registered = false;

export function ensureMembershipsFoundationRegistered(): void {
  if (registered) return;
  registerMembershipsFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    stripeFor(args: { agencyId: string; clientId: string }) {
      return membershipsStripeFor(args);
    },
  } as unknown as Parameters<typeof registerMembershipsFoundation>[0]);
  registered = true;
}

ensureMembershipsFoundationRegistered();
