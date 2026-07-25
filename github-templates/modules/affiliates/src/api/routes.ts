// Manifest API routes — mounted at `/api/portal/affiliates/...` by T1's
// catch-all dispatcher.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  approveAttributionHandler,
  createAffiliateHandler,
  createCodeHandler,
  deleteAffiliateHandler,
  listAffiliatesHandler,
  listAttributionsHandler,
  listCodesHandler,
  listPayoutsHandler,
  markPayoutPaidHandler,
  meCreateCodeHandler,
  meEnrollHandler,
  meHandler,
  meStripeOnboardHandler,
  meStripeRefreshHandler,
  processPayoutHandler,
  recordOrderHandler,
  schedulePayoutHandler,
  stripeWebhookHandler,
  updateAffiliateHandler,
  updateCodeHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Affiliates (admin)
  { path: "affiliates", methods: ["GET"], handler: listAffiliatesHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "affiliates", methods: ["POST"], handler: createAffiliateHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "affiliates", methods: ["PATCH"], handler: updateAffiliateHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "affiliates", methods: ["DELETE"], handler: deleteAffiliateHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Codes (admin)
  { path: "codes", methods: ["GET"], handler: listCodesHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "codes", methods: ["POST"], handler: createCodeHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "codes", methods: ["PATCH"], handler: updateCodeHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Attributions
  { path: "attributions", methods: ["GET"], handler: listAttributionsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "attributions/approve", methods: ["POST"], handler: approveAttributionHandler, visibleToRoles: [...ADMIN_ROLES] },
  // Internal fan-out endpoint — foundation calls this when ecommerce
  // emits `order.created`. Listed under admin roles for now (a future
  // round can mark it `public: true` once event-bus signing lands).
  { path: "attributions/record", methods: ["POST"], handler: recordOrderHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Payouts
  { path: "payouts", methods: ["GET"], handler: listPayoutsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "payouts", methods: ["POST"], handler: schedulePayoutHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "payouts/mark-paid", methods: ["POST"], handler: markPayoutPaidHandler, visibleToRoles: [...ADMIN_ROLES] },
  // R12 — Stripe Connect: admin "Process via Stripe" button.
  { path: "payouts/process", methods: ["POST"], handler: processPayoutHandler, visibleToRoles: [...ADMIN_ROLES] },

  // R12 — Stripe Connect webhook (account.updated + transfer.paid).
  // Public endpoint — verifies Stripe-Signature header internally.
  { path: "webhooks/stripe", methods: ["POST"], handler: stripeWebhookHandler, public: true },

  // Customer-facing
  { path: "me", methods: ["GET"], handler: meHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/enroll", methods: ["POST"], handler: meEnrollHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/codes", methods: ["POST"], handler: meCreateCodeHandler, visibleToRoles: [...END_CUSTOMER] },
  // R12 — customer Stripe Connect onboarding.
  { path: "me/stripe/onboard", methods: ["POST"], handler: meStripeOnboardHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/stripe/refresh", methods: ["POST"], handler: meStripeRefreshHandler, visibleToRoles: [...END_CUSTOMER] },
];
