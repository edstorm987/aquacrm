import "server-only";
// Cross-plugin event subscribers — wires emit-then-fan-out at boot.
//
// Each `subscribeForPlugin(pluginId, eventName, handler)` call says:
// "when `eventName` fires inside a tenant scope where `pluginId` is
// installed, run this handler with the per-(agencyId, clientId)
// container the plugin expects." The eventBus filters fan-out by
// looking up the install for each scoped event before invoking
// subscribers — no global handlers leak across tenants.
//
// New cross-plugin wires for R6:
//   • affiliates ← ecommerce `order.created`
//       → AttributionService.recordOrder
//   • client-crm ← ecommerce `order.created`
//       → ActivityService.ingestOrderCreated
//   • client-crm ← affiliates `affiliate.attribution_recorded`
//       → ActivityService.ingestAffiliateAttribution
//   • client-crm ← memberships `membership.subscription_started|canceled`
//       → ActivityService.ingestSubscription

import { subscribeForPlugin } from "@/server/eventBus";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { containerFor as affiliatesContainerFor } from "@aqua/plugin-affiliates/server";
import { containerFor as clientCrmContainerFor } from "@aqua/plugin-client-crm/server";

interface OrderCreatedPayload {
  orderId: string;
  clientId?: string;
  amountTotal: number;
  currency: string;
  subtotal?: number;
  referralCodeId?: string;
  endCustomerUserId?: string;
  customerEmail?: string;
  discountSource?: string;
}

interface AffiliateAttributionPayload {
  attributionId?: string;
  affiliateId?: string;
  affiliateUserId?: string;
  affiliateEmail?: string;
  orderId: string;
  amountCents?: number;
  amount?: number;
  currency?: string;
}

interface SubscriptionEventPayload {
  subscriptionId?: string;
  userId?: string;
  endCustomerUserId?: string;
  planId: string;
  status?: string;
  billing?: string;
}

// ─── affiliates ← ecommerce ─────────────────────────────────────────────

subscribeForPlugin("affiliates", "order.created", async (event) => {
  const payload = event.payload as OrderCreatedPayload;
  if (!event.clientId || !payload.referralCodeId) return;
  const install = getInstall({ agencyId: event.agencyId, clientId: event.clientId }, "affiliates");
  if (!install || !install.enabled) return;
  const container = affiliatesContainerFor({
    agencyId: event.agencyId,
    clientId: event.clientId,
    storage: makePluginStorage(install.id) as never,
    install,
  });
  // RecordOrderArgs only needs orderId + referralCodeId — affiliates
  // reads order subtotal/amount via its EcommerceOrdersPort internally.
  await container.attributions.recordOrder({
    orderId: payload.orderId,
    referralCodeId: payload.referralCodeId,
  });
});

// ─── client-crm ← ecommerce ─────────────────────────────────────────────

subscribeForPlugin("client-crm", "order.created", async (event) => {
  const payload = event.payload as OrderCreatedPayload;
  if (!event.clientId) return;
  const install = getInstall({ agencyId: event.agencyId, clientId: event.clientId }, "client-crm");
  if (!install || !install.enabled) return;
  const container = clientCrmContainerFor({
    agencyId: event.agencyId,
    clientId: event.clientId,
    storage: makePluginStorage(install.id) as never,
    install,
  });
  await container.activity.ingestOrderCreated({
    orderId: payload.orderId,
    endCustomerUserId: payload.endCustomerUserId,
    customerEmail: payload.customerEmail,
    amountTotal: payload.amountTotal,
    currency: payload.currency,
    occurredAt: event.emittedAt,
  });
});

// ─── client-crm ← affiliates ────────────────────────────────────────────

subscribeForPlugin("client-crm", "affiliate.attribution_recorded", async (event) => {
  const payload = event.payload as AffiliateAttributionPayload;
  if (!event.clientId) return;
  const install = getInstall({ agencyId: event.agencyId, clientId: event.clientId }, "client-crm");
  if (!install || !install.enabled) return;
  const container = clientCrmContainerFor({
    agencyId: event.agencyId,
    clientId: event.clientId,
    storage: makePluginStorage(install.id) as never,
    install,
  });
  await container.activity.ingestAffiliateAttribution({
    affiliateUserId: payload.affiliateUserId,
    affiliateEmail: payload.affiliateEmail,
    orderId: payload.orderId,
    amountCents: payload.amountCents ?? payload.amount ?? 0,
    occurredAt: event.emittedAt,
  });
});

// ─── client-crm ← memberships ───────────────────────────────────────────

const SUBSCRIPTION_STATE_MAP: Record<string, "started" | "canceled" | undefined> = {
  "membership.subscription_started":  "started",
  "membership.subscription_canceled": "canceled",
};

for (const eventName of Object.keys(SUBSCRIPTION_STATE_MAP)) {
  subscribeForPlugin("client-crm", eventName, async (event) => {
    const status = SUBSCRIPTION_STATE_MAP[eventName];
    if (!status) return;
    const payload = event.payload as SubscriptionEventPayload;
    if (!event.clientId) return;
    const userId = payload.userId ?? payload.endCustomerUserId;
    if (!userId || !payload.planId) return;
    const install = getInstall({ agencyId: event.agencyId, clientId: event.clientId }, "client-crm");
    if (!install || !install.enabled) return;
    const container = clientCrmContainerFor({
      agencyId: event.agencyId,
      clientId: event.clientId,
      storage: makePluginStorage(install.id) as never,
      install,
    });
    await container.activity.ingestSubscription({
      endCustomerUserId: userId,
      planId: payload.planId,
      status,
      occurredAt: event.emittedAt,
    });
  });
}
