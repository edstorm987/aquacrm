import "server-only";
// Memberships plugin foundation registration.
//
// `stripeFor({ agencyId, clientId })` returns a Stripe client built
// from the per-install Stripe keys carried on the **ecommerce** install
// (memberships requires ecommerce). For dev / demo the keys are
// absent — returning null tells memberships to fall through to the
// free-tier path.
//
// A real Stripe SDK adapter is foundation-pending (the plugin chapter
// flags it). Until then the factory always returns null and paid-plan
// flows return 422 with a clear "Stripe not configured" message.

import { registerMembershipsFoundation } from "@aqua/plugin-memberships/server";
import {
  tenantPort, activityPort, eventBusPort, pluginInstallStorePort, userPort,
} from "./_foundationPorts";

// A Stripe SDK adapter is foundation-pending. Until a real adapter
// lands the factory returns a NOOP stub so memberships's `containerFor`
// can still build (admin-side reads + free-tier subscribes work). Paid
// flows hit the stub's `throw` and surface a clear "Stripe not
// configured" message — same UX as the plugin's own internal NOOP path.
const NOOP_STRIPE = {
  async createCustomer() { throw new Error("Stripe not configured (foundation pending)."); },
  async retrieveCustomer() { return null; },
  async createSubscription() { throw new Error("Stripe not configured (foundation pending)."); },
  async cancelSubscription() { throw new Error("Stripe not configured (foundation pending)."); },
  async retrieveSubscription() { return null; },
  async pauseSubscription() { throw new Error("Stripe not configured (foundation pending)."); },
  async resumeSubscription() { throw new Error("Stripe not configured (foundation pending)."); },
  async changeSubscriptionPlan() { throw new Error("Stripe not configured (foundation pending)."); },
  async createCheckoutSession() { throw new Error("Stripe not configured (foundation pending)."); },
  async createBillingPortalSession() { throw new Error("Stripe not configured (foundation pending)."); },
  async createPrice() { throw new Error("Stripe not configured (foundation pending)."); },
  async verifyWebhookSignature() { return null; },
};

let registered = false;

export function ensureMembershipsFoundationRegistered(): void {
  if (registered) return;
  registerMembershipsFoundation({
    tenant: tenantPort,
    user: userPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    stripeFor(_args: { agencyId: string; clientId: string }) {
      // Always return the NOOP for now. A future foundation patch will
      // read per-install Stripe keys off the ecommerce install and
      // hand back a real `Stripe SDK` wrapper here. Until then, the
      // stub keeps every container build green.
      return NOOP_STRIPE;
    },
  } as unknown as Parameters<typeof registerMembershipsFoundation>[0]);
  registered = true;
}

ensureMembershipsFoundationRegistered();
