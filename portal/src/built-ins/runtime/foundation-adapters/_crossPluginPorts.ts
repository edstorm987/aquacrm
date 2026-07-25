import "server-only";
// Cross-plugin port adapters. These reach across plugin boundaries:
//   • EcommerceOrdersPort (used by affiliates + client-crm) — projects
//     ecommerce's ServerOrder shape into each subscriber's narrow view.
//   • MembershipBenefitsPort (used by client-crm) — reads the active
//     subscription for an end-customer via memberships's
//     SubscriptionService and projects to a tiny snapshot.
//
// Each adapter requires the source plugin's container, which means we
// need an enabled install for the (agencyId, clientId) scope. Reading
// from a missing install returns null/empty — the consuming plugin
// degrades gracefully (architecture §6 keeps cross-plugin calls
// best-effort, never blocking).

import { getInstall } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor as ecommerceContainerFor } from "@aqua/plugin-ecommerce/server";
import {
  containerFor as membershipsContainerFor,
  isStripeAvailable as membershipsStripeAvailable,
} from "@aqua/plugin-memberships/server";

const ECOMMERCE_PLUGIN_ID = "ecommerce";
const MEMBERSHIPS_PLUGIN_ID = "memberships";

// ─── EcommerceOrdersPort variants ────────────────────────────────────────
//
// Two shapes in the wild — affiliates wants `getOrder(orderId)`,
// client-crm wants `listForUser({ userId, email })`. Both project from
// the same `OrderService.getOrder` / `listOrdersForClient` reads.

export const ecommerceOrdersPortForAffiliates = {
  async getOrder(args: { agencyId: string; clientId: string; orderId: string }) {
    const install = getInstall({ agencyId: args.agencyId, clientId: args.clientId }, ECOMMERCE_PLUGIN_ID);
    if (!install || !install.enabled) return null;
    const storage = makePluginStorage(install.id);
    // ecommerce's containerFor only needs storage — `_storageOnly` shape.
    const container = ecommerceContainerFor(storage as never);
    const order = await container.orders.getOrder(args.orderId);
    if (!order || order.clientId !== args.clientId) return null;
    return {
      id: order.id,
      agencyId: args.agencyId,
      clientId: order.clientId,
      endCustomerUserId: order.endCustomerUserId,
      amountTotal: order.amountTotal,
      currency: order.currency,
      // Subtotal pre-discount: amountTotal + already-applied discount.
      // ecommerce's ServerOrder doesn't carry an explicit subtotal; we
      // synthesise from amountTotal + discountAmount.
      subtotal: order.amountTotal + (order.discountAmount ?? 0),
      referralCodeId: order.referralCodeId
        ?? (order.metadata?.referralCodeId as string | undefined),
      discountSource: order.discountSource,
      createdAt: order.createdAt,
    };
  },
};

export const ecommerceOrdersPortForCrm = {
  async listForUser(args: {
    agencyId: string;
    clientId: string;
    userId?: string;
    email?: string;
    limit?: number;
  }) {
    const install = getInstall({ agencyId: args.agencyId, clientId: args.clientId }, ECOMMERCE_PLUGIN_ID);
    if (!install || !install.enabled) return [];
    const storage = makePluginStorage(install.id);
    const container = ecommerceContainerFor(storage as never);
    const all = await container.orders.listOrdersForClient(args.clientId, args.limit ?? 50);
    return all
      .filter(o => {
        if (args.userId && o.endCustomerUserId === args.userId) return true;
        if (args.email && o.customerEmail?.toLowerCase() === args.email.toLowerCase()) return true;
        return !args.userId && !args.email;
      })
      .map(o => ({
        orderId: o.id,
        endCustomerUserId: o.endCustomerUserId,
        customerEmail: o.customerEmail,
        amountTotal: o.amountTotal,
        currency: o.currency,
        createdAt: o.createdAt,
      }));
  },
};

// ─── MembershipBenefitsPort (used by client-crm) ─────────────────────────

export const membershipBenefitsPort = {
  async getMembershipForUser(args: {
    agencyId: string;
    clientId: string;
    userId: string;
  }): Promise<{ planId: string; planName?: string; status: string } | null> {
    const install = getInstall({ agencyId: args.agencyId, clientId: args.clientId }, MEMBERSHIPS_PLUGIN_ID);
    if (!install || !install.enabled) return null;
    // memberships's container demands a Stripe client. The factory
    // returns null when keys aren't configured — degrade by skipping
    // the membership read rather than throwing. The CRM still runs,
    // it just doesn't tag this contact as a member.
    if (!membershipsStripeAvailable({ agencyId: args.agencyId, clientId: args.clientId })) return null;
    const storage = makePluginStorage(install.id);
    const container = membershipsContainerFor({
      agencyId: args.agencyId,
      clientId: args.clientId,
      storage: storage as never,
      install,
    });
    const sub = await container.subscriptions.getByUser(args.userId);
    if (!sub) return null;
    const plan = await container.plans.get(sub.planId);
    return {
      planId: sub.planId,
      planName: plan?.name,
      status: sub.status,
    };
  },
};
