// Manifest API routes — mounted at `/api/portal/memberships/...` by T1's
// catch-all dispatcher. Relative path convention (no leading slash) —
// same as fulfillment / ecommerce / agency-hr.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  adminCancelSubscriberHandler,
  createBenefitHandler,
  createPlanHandler,
  deletePlanHandler,
  getSubscriberHandler,
  listBenefitsHandler,
  listPlansHandler,
  listSubscribersHandler,
  meCancelHandler,
  meHandler,
  mePortalHandler,
  meSubscribeHandler,
  stripeWebhookHandler,
  updateBenefitHandler,
  updatePlanHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Plans (admin)
  { path: "plans", methods: ["GET"], handler: listPlansHandler, visibleToRoles: [...ADMIN_VIEWERS, "end-customer"] },
  { path: "plans", methods: ["POST"], handler: createPlanHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "plans", methods: ["PATCH"], handler: updatePlanHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "plans", methods: ["DELETE"], handler: deletePlanHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Benefits (admin)
  { path: "benefits", methods: ["GET"], handler: listBenefitsHandler, visibleToRoles: [...ADMIN_VIEWERS, "end-customer"] },
  { path: "benefits", methods: ["POST"], handler: createBenefitHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "benefits", methods: ["PATCH"], handler: updateBenefitHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Subscribers (admin)
  { path: "subscribers", methods: ["GET"], handler: listSubscribersHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "subscribers/get", methods: ["GET"], handler: getSubscriberHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "subscribers/cancel", methods: ["POST"], handler: adminCancelSubscriberHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Stripe webhook (public — Stripe signs)
  { path: "stripe/webhook", methods: ["POST"], handler: stripeWebhookHandler, public: true },

  // Customer-facing
  { path: "me", methods: ["GET"], handler: meHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/subscribe", methods: ["POST"], handler: meSubscribeHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/cancel", methods: ["POST"], handler: meCancelHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/portal", methods: ["POST"], handler: mePortalHandler, visibleToRoles: [...END_CUSTOMER] },
];
