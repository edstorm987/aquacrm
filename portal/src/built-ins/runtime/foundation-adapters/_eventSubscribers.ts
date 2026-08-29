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
//   • affiliates ← ecommerce order lifecycle
//       → AttributionService.recordOrder / reconcileOrder
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

async function affiliateContainerForOrderEvent(event: {
  agencyId: string;
  clientId?: string;
}) {
  if (!event.clientId) return null;
  const install = getInstall({ agencyId: event.agencyId, clientId: event.clientId }, "affiliates");
  if (!install || !install.enabled) return null;
  return affiliatesContainerFor({
    agencyId: event.agencyId,
    clientId: event.clientId,
    storage: makePluginStorage(install.id) as never,
    install,
  });
}

for (const eventName of ["order.created", "order.paid"] as const) {
  subscribeForPlugin("affiliates", eventName, async (event) => {
    const payload = event.payload as OrderCreatedPayload;
    if (!payload.orderId) return;
    const container = await affiliateContainerForOrderEvent(event);
    if (!container) return;
    await container.attributions.recordOrder({
      orderId: payload.orderId,
      referralCodeId: payload.referralCodeId,
    });
  });
}

for (const eventName of ["order.refunded", "order.cancelled"] as const) {
  subscribeForPlugin("affiliates", eventName, async (event) => {
    const payload = event.payload as OrderCreatedPayload;
    if (!payload.orderId) return;
    const container = await affiliateContainerForOrderEvent(event);
    if (!container) return;
    await container.attributions.reconcileOrder(payload.orderId);
  });
}

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

// ─── email-sender ← client-crm journey automations ──────────────────────
//
// Added 2026-08-28 with the journey-pipelines add-on, and it is the wire that
// makes the board's `send-email` action REAL rather than a rule that reports
// success into the void.
//
// ── What was found while adding it ───────────────────────────────────────
//
// email-sender exports `EVENT_SUBSCRIPTIONS`, whose own comment says
// *"Foundation's R6 router reads this list, looks up the matching method on
// the container's EmailService, and subscribes"*. **No such router exists.**
// `subscribeForPlugin` is called in this file for affiliates, client-crm and
// leads-pipeline, and in `leadsPipelineFoundation.ts` — never for
// email-sender, and `emailSenderFoundation.ts` only registers ports (its own
// comment defers the wiring to "a future round").
//
// So email-sender's four other declared subscribers — forms notification,
// membership change, affiliate payout, end-customer signup welcome — are
// declared and dormant. That is a real defect, but turning four dormant email
// paths on is a change to what the product SENDS, across every agency, and is
// not this add-on's call to make. It is written up for Ed instead.
//
// This subscribes the one new event explicitly, so the client's automation
// works today and nothing else starts emailing without a decision.

subscribeForPlugin("email-sender", "crm.automation.email_requested", async (event) => {
  const payload = event.payload as {
    automationId?: string;
    cardId?: string;
    contactEmail?: string;
    contactName?: string;
    subject?: string;
    bodyText?: string;
  };
  if (!payload.contactEmail || !payload.subject || !payload.automationId || !payload.cardId) return;

  // email-sender is agency-scoped, so the install is looked up WITHOUT the
  // client id even though the event carries one. `subscribeForPlugin` already
  // falls back this way when it filters fan-out; doing the same here keeps the
  // container's agency and the filter's agency the same install.
  const install = getInstall({ agencyId: event.agencyId }, "email-sender");
  if (!install || !install.enabled) return;

  const { containerFor: emailSenderContainerFor } = await import("@aqua/plugin-email-sender/server");
  const container = emailSenderContainerFor({
    agencyId: event.agencyId,
    storage: makePluginStorage(install.id) as never,
    install,
  } as never);
  await container.emails.onCrmAutomationEmailRequested({
    automationId: payload.automationId,
    cardId: payload.cardId,
    contactEmail: payload.contactEmail,
    contactName: payload.contactName,
    subject: payload.subject,
    bodyText: payload.bodyText ?? "",
    clientId: event.clientId,
  });
});

// ─── email-sender ← memberships ─────────────────────────────────────────
//
// The second of email-sender's declared subscribers to become real. The story
// of the other three is worth writing down, because "wire up the four dormant
// subscribers" sounds like one job and is actually four different ones:
//
//   • `membership.subscription_changed` — emitted, and wired here.
//   • `affiliate.payout_completed` — emitted, but the payload carries
//     `affiliateId` (an affiliate RECORD id) where the handler wants
//     `affiliateUserId` + `affiliateEmail`. Resolving one to the other needs a
//     cross-module read into affiliates that does not exist yet. Wiring it as
//     it stands would call a handler that returns `null` every time — a
//     subscriber that looks connected and sends nothing, which is worse than
//     the honest gap.
//   • `forms.notification.requested` — **nothing emits it.** Searched across
//     the whole of `src/`: no emitter, anywhere.
//   • `auth.bootstrap.signup` — **nothing emits it** either.
//
// ── Why the email address is resolved HERE ───────────────────────────────
//
// memberships emits `{ subscriptionId, userId, oldStatus, newStatus, … }` and
// the handler's first line is `if (!payload.userEmail) return null`. So the
// event as emitted can never produce a message. The address is looked up in
// this wire rather than added to the emit, because the emitting module has no
// business knowing that somebody, somewhere, wants to send an email — that is
// exactly the coupling the event bus exists to avoid.
//
// If the user cannot be resolved, NOTHING is sent and nothing is logged as
// sent. A membership change is not worth inventing a recipient for.

subscribeForPlugin("email-sender", "membership.subscription_changed", async (event) => {
  const payload = event.payload as {
    subscriptionId?: string;
    userId?: string;
    oldStatus?: string;
    newStatus?: string;
    newPlanId?: string;
  };
  if (!payload.subscriptionId || !payload.userId || !payload.newStatus) return;

  // The handler only acts on activation and cancellation; skip the rest before
  // doing any lookup at all.
  const isWelcome = payload.newStatus === "active" && payload.oldStatus !== "active";
  const isCancel = payload.newStatus === "canceled";
  if (!isWelcome && !isCancel) return;

  const install = getInstall({ agencyId: event.agencyId }, "email-sender");
  if (!install || !install.enabled) return;

  const { userPort } = await import("./_foundationPorts");
  const recipient = userPort.getUser(payload.userId);
  if (!recipient?.email) return;

  const { containerFor: emailSenderContainerFor } = await import("@aqua/plugin-email-sender/server");
  const container = emailSenderContainerFor({
    agencyId: event.agencyId,
    storage: makePluginStorage(install.id) as never,
    install,
  } as never);
  await container.emails.onMembershipSubscriptionChanged({
    subscriptionId: payload.subscriptionId,
    userId: payload.userId,
    userEmail: recipient.email,
    oldStatus: payload.oldStatus ?? "",
    newStatus: payload.newStatus,
    planName: payload.newPlanId,
  });
});
